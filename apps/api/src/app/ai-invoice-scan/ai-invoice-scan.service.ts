import { ForbiddenException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { AiInvoiceExtractionService, type AiInvoiceExtractionResult } from '@plexo/ai-invoice-scan';
import { getTenantDb, getTenantId, PrismaService, withTenantContext } from '@plexo/database';
import { SubscriptionService } from '@plexo/subscriptions';

// Fila única de PlatformSettings - mismo criterio que
// ExchangeRateSchedulerService/MembershipsService.getSettings.
const PLATFORM_SETTINGS_ID = 'global';

// Ventana del circuit breaker: si de las últimas RECENT_ATTEMPTS_SAMPLE
// llamadas de ESTE tenant en los últimos RECENT_WINDOW_MINUTES minutos,
// todas fallaron, el servicio se muestra "rojo" para ese tenant (no rompe
// nada, sólo desalienta seguir intentando contra un proveedor caído). Sin
// ninguna falla reciente = verde. Con alguna pero no todas = amarillo.
const RECENT_WINDOW_MINUTES = 15;
const RECENT_ATTEMPTS_SAMPLE = 5;
const MIN_FAILURES_FOR_RED = 3;

export type AiInvoiceScanAvailability =
  | { available: 'green' }
  | { available: 'yellow'; reason: string }
  | { available: 'red'; reason: string };

export interface AiInvoiceScanSettings {
  aiInvoiceScanEnabled: boolean;
}

/**
 * "Carga de comprobantes IA" - disponibilidad (semáforo) + kill-switch
 * global + registro de intentos (ver docs/plan-carga-comprobantes-ia.md,
 * AiInvoiceScanAttempt en schema.prisma). El chequeo de cuota/plan en sí
 * NO se reimplementa acá - se delega 100% a
 * SubscriptionService.assertCanUseAiInvoiceScan(), la MISMA función que
 * gatea extractFromUpload() más abajo - evita que el semáforo diga verde y
 * la extracción real rechace, o viceversa.
 */
@Injectable()
export class AiInvoiceScanService {
  private readonly logger = new Logger(AiInvoiceScanService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptionService: SubscriptionService,
    private readonly aiInvoiceExtractionService: AiInvoiceExtractionService,
  ) {}

  /** Get-or-create defensivo - mismo criterio que
   * ExchangeRateSchedulerService.getSettings (la migración ya siembra la
   * fila única vía el DEFAULT de la columna). */
  async getSettings(): Promise<AiInvoiceScanSettings> {
    const existing = await this.prisma.platformSettings.findUnique({ where: { id: PLATFORM_SETTINGS_ID } });
    if (existing) {
      return existing;
    }
    return this.prisma.platformSettings.create({ data: { id: PLATFORM_SETTINGS_ID } });
  }

  async updateSettings(enabled: boolean): Promise<AiInvoiceScanSettings> {
    return this.prisma.platformSettings.upsert({
      where: { id: PLATFORM_SETTINGS_ID },
      create: { id: PLATFORM_SETTINGS_ID, aiInvoiceScanEnabled: enabled },
      update: { aiInvoiceScanEnabled: enabled },
    });
  }

  /** Transacción propia (withTenantContext abre una $transaction nueva,
   * conexión aparte de la del request en curso) - a propósito, no
   * getTenantDb() directo. extractFromUpload() llama esto DESDE un catch
   * que después vuelve a lanzar el error real (nunca lo esconde) - si el
   * insert usara la transacción del request, ese throw dispararía un
   * rollback que se llevaría puesto el registro del intento con él, y el
   * circuit breaker/cupo nunca vería la falla. Encontrado en vivo (ver
   * PROGRESS.md), no era evidente sólo con los tests unitarios mockeados. */
  async recordAttempt(status: 'SUCCESS' | 'FAILURE', errorReason?: string): Promise<void> {
    const tenantId = getTenantId();
    await withTenantContext(this.prisma, tenantId, async () => {
      await getTenantDb().aiInvoiceScanAttempt.create({ data: { tenantId, status, errorReason } });
    });
  }

  async getAvailability(): Promise<AiInvoiceScanAvailability> {
    const settings = await this.getSettings();
    if (!settings.aiInvoiceScanEnabled) {
      return { available: 'red', reason: 'El escaneo automático no está disponible en este momento.' };
    }

    try {
      await this.subscriptionService.assertCanUseAiInvoiceScan();
    } catch (err) {
      return { available: 'red', reason: (err as Error).message };
    }

    const since = new Date(Date.now() - RECENT_WINDOW_MINUTES * 60_000);
    const recent = await getTenantDb().aiInvoiceScanAttempt.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: RECENT_ATTEMPTS_SAMPLE,
      select: { status: true },
    });

    const failures = recent.filter((r) => r.status === 'FAILURE').length;
    if (recent.length >= MIN_FAILURES_FOR_RED && failures === recent.length) {
      return {
        available: 'red',
        reason: 'El escaneo automático no está disponible en este momento. Podés cargar la factura manualmente.',
      };
    }
    if (failures > 0) {
      return { available: 'yellow', reason: 'El escaneo automático está más lento de lo normal.' };
    }
    return { available: 'green' };
  }

  /** Reusa exactamente el mismo chequeo de disponibilidad que el semáforo
   * (getAvailability) - si el semáforo dice rojo, esto rechaza con el mismo
   * motivo, nunca deja pasar una llamada real a Claude que el semáforo ya
   * advirtió que iba a fallar. "Amarillo" sigue permitiendo intentar (es
   * sólo un aviso de lentitud, no un bloqueo). Registra el intento
   * (éxito/fallo) en los dos casos - eso es lo que alimenta el circuit
   * breaker del propio semáforo para la próxima consulta. */
  async extractFromUpload(buffer: Buffer, mimetype: string): Promise<AiInvoiceExtractionResult> {
    const availability = await this.getAvailability();
    if (availability.available === 'red') {
      throw new ForbiddenException(availability.reason);
    }

    try {
      const result = await this.aiInvoiceExtractionService.extract(buffer, mimetype);
      await this.recordAttempt('SUCCESS');
      return result;
    } catch (err) {
      const message = (err as Error).message;
      await this.recordAttempt('FAILURE', message);
      // El error técnico real (credenciales, rate limit del proveedor,
      // formato no soportado, etc.) queda en el log del servidor para
      // diagnóstico - nunca se lo devolvemos tal cual al usuario final, que
      // sólo necesita saber que puede seguir cargando a mano.
      this.logger.error(`Fallo al extraer datos con IA: ${message}`);
      throw new ServiceUnavailableException(
        'No se pudo leer el comprobante con IA en este momento. Cargá la factura manualmente.',
      );
    }
  }
}
