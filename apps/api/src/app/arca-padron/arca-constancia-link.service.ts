import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '@plexo/database';

const PLATFORM_SETTINGS_ID = 'global';

/** Consulta pública de la Constancia de Inscripción / Opción - Monotributo
 * (sin clave fiscal). Se puede cambiar desde /admin si ARCA la mueve. */
export const DEFAULT_CONSTANCIA_URL = 'https://seti.afip.gob.ar/padron-puc-constancia-internet/ConsultaConstanciaAction.do';

// Lo que tiene que mostrar la página (o el iframe donde ARCA arma el
// formulario: jsp/Constancia.jsp) para seguir siendo la consulta.
const FORM_MARKER = /CUIT del Contribuyente/i;
const FETCH_TIMEOUT_MS = 15_000;

export type ConstanciaLinkCheckStatus = 'OK' | 'CHANGED' | 'DOWN';

export interface ConstanciaLinkStatus {
  url: string;
  isDefault: boolean;
  checkedAt: string | null;
  status: ConstanciaLinkCheckStatus | null;
  message: string | null;
}

/**
 * Enlace del botón "Abrir la consulta en ARCA" (Conexión con ARCA → paso 1).
 * Vive en PlatformSettings para poder cambiarlo desde /admin sin un deploy,
 * y se verifica (desde /admin y una vez por día) que responda y que siga
 * siendo la consulta de constancia.
 */
@Injectable()
export class ArcaConstanciaLinkService {
  private readonly logger = new Logger(ArcaConstanciaLinkService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getUrl(): Promise<string> {
    const row = await this.prisma.platformSettings.findUnique({ where: { id: PLATFORM_SETTINGS_ID }, select: { constanciaUrl: true } });
    return row?.constanciaUrl || DEFAULT_CONSTANCIA_URL;
  }

  async getStatus(): Promise<ConstanciaLinkStatus> {
    const row = await this.prisma.platformSettings.findUnique({
      where: { id: PLATFORM_SETTINGS_ID },
      select: { constanciaUrl: true, constanciaUrlCheckAt: true, constanciaUrlCheckStatus: true, constanciaUrlCheckMessage: true },
    });
    return {
      url: row?.constanciaUrl || DEFAULT_CONSTANCIA_URL,
      isDefault: !row?.constanciaUrl,
      checkedAt: row?.constanciaUrlCheckAt?.toISOString() ?? null,
      status: (row?.constanciaUrlCheckStatus as ConstanciaLinkCheckStatus | null) ?? null,
      message: row?.constanciaUrlCheckMessage ?? null,
    };
  }

  async setUrl(url: string): Promise<ConstanciaLinkStatus> {
    const trimmed = url.trim();
    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      throw new BadRequestException('El enlace no es una dirección web válida.');
    }
    if (parsed.protocol !== 'https:') throw new BadRequestException('El enlace tiene que empezar con https://');
    const value = trimmed === DEFAULT_CONSTANCIA_URL ? null : trimmed;
    await this.prisma.platformSettings.upsert({
      where: { id: PLATFORM_SETTINGS_ID },
      create: { id: PLATFORM_SETTINGS_ID, constanciaUrl: value },
      update: { constanciaUrl: value },
    });
    return this.verify();
  }

  async verify(): Promise<ConstanciaLinkStatus> {
    const url = await this.getUrl();
    const result = await this.check(url);
    await this.prisma.platformSettings.upsert({
      where: { id: PLATFORM_SETTINGS_ID },
      create: { id: PLATFORM_SETTINGS_ID, constanciaUrlCheckAt: new Date(), constanciaUrlCheckStatus: result.status, constanciaUrlCheckMessage: result.message },
      update: { constanciaUrlCheckAt: new Date(), constanciaUrlCheckStatus: result.status, constanciaUrlCheckMessage: result.message },
    });
    return this.getStatus();
  }

  @Cron('0 7 * * *', { timeZone: 'America/Argentina/Buenos_Aires' })
  async dailyCheck(): Promise<void> {
    try {
      const status = await this.verify();
      if (status.status !== 'OK') this.logger.warn(`El enlace de la constancia de ARCA no pasó la verificación: ${status.message}`);
    } catch (err) {
      this.logger.error(`No se pudo verificar el enlace de la constancia: ${(err as Error).message}`);
    }
  }

  /** Exportado para tests vía la instancia. */
  async check(url: string): Promise<{ status: ConstanciaLinkCheckStatus; message: string }> {
    const started = Date.now();
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), redirect: 'follow' });
      if (!response.ok) return { status: 'DOWN', message: `ARCA respondió ${response.status}.` };
      let html = await response.text();
      if (!FORM_MARKER.test(html)) {
        // ARCA arma el formulario en un iframe (jsp/Constancia.jsp).
        const frame = html.match(/<iframe[^>]+src="([^"]*[Cc]onstancia[^"]*)"/);
        if (frame) {
          const frameResponse = await fetch(new URL(frame[1], response.url || url), { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
          html = frameResponse.ok ? await frameResponse.text() : '';
        }
      }
      const seconds = ((Date.now() - started) / 1000).toLocaleString('es-AR', { maximumFractionDigits: 1 });
      if (!FORM_MARKER.test(html)) {
        return { status: 'CHANGED', message: `ARCA respondió en ${seconds} s, pero la página ya no muestra el formulario "CUIT del Contribuyente". Puede que hayan cambiado la consulta.` };
      }
      return { status: 'OK', message: `ARCA respondió en ${seconds} s y la página muestra la consulta de constancia ("CUIT del Contribuyente").` };
    } catch (err) {
      const cause = (err as Error & { cause?: { code?: string } }).cause?.code;
      return { status: 'DOWN', message: `No se pudo abrir el enlace${cause ? ` (${cause})` : ''}: ${(err as Error).message}` };
    }
  }
}
