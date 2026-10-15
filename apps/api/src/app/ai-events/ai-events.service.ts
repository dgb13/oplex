import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { PrismaService, tenantContextStorage } from '@plexo/database';

export type AiFeature = 'ASSISTANT_CHAT' | 'ASSISTANT_HELP' | 'CONSTANCIA' | 'INVOICE_SCAN' | 'ARTICLE_IMPORT';

// Cuántas fallas se conservan (las más nuevas) y cuántos días los usos OK.
const KEEP_FAILURES = 20;
const KEEP_OK_DAYS = 90;

/**
 * Usos y fallas de las funciones de IA, para /admin → Inteligencia
 * artificial (AdminAiStatusService). Escribe con el PrismaService crudo, fuera
 * de la transacción del request: una falla casi siempre termina en una
 * excepción que hace rollback del request, y el registro tiene que quedar
 * igual. Nunca rompe la función que lo llama: si no puede guardar, sólo lo
 * deja en el log.
 */
@Injectable()
export class AiEventsService {
  private readonly logger = new Logger(AiEventsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(feature: AiFeature, ok: boolean, reason?: string): Promise<void> {
    try {
      const tenantId = tenantContextStorage.getStore()?.tenantId ?? null;
      await this.prisma.aiFeatureEvent.create({
        data: { feature, ok, tenantId, reason: reason ? reason.slice(0, 1000) : null },
      });
      if (!ok) {
        const keep = await this.prisma.aiFeatureEvent.findMany({
          where: { ok: false },
          orderBy: { createdAt: 'desc' },
          take: KEEP_FAILURES,
          select: { id: true },
        });
        await this.prisma.aiFeatureEvent.deleteMany({ where: { ok: false, id: { notIn: keep.map((e) => e.id) } } });
      } else {
        await this.prisma.aiFeatureEvent.deleteMany({
          where: { ok: true, createdAt: { lt: new Date(Date.now() - KEEP_OK_DAYS * 86_400_000) } },
        });
      }
    } catch (err) {
      this.logger.warn(`No se pudo registrar el evento de IA ${feature}: ${(err as Error).message}`);
    }
  }
}

@Global()
@Module({ providers: [AiEventsService], exports: [AiEventsService] })
export class AiEventsModule {}
