import { Injectable } from '@nestjs/common';
import { PrismaService } from '@plexo/database';

const PLATFORM_SETTINGS_ID = 'global';

export interface AssistantSettings {
  assistantDisplayName: string | null;
  assistantRateLimitWindowMinutes: number;
  assistantRateLimitMaxMessages: number;
}

export interface UpdateAssistantSettingsInput {
  assistantDisplayName?: string | null;
  assistantRateLimitWindowMinutes?: number;
  assistantRateLimitMaxMessages?: number;
}

/**
 * Configuración de plataforma del asistente de IA - nombre mostrado +
 * rate limit (docs/plan-asistente-ia-conversacional.md, secciones 1 y
 * 8.2), ninguno de los dos hardcodeado en código. Mismo patrón
 * get-or-create defensivo que AiInvoiceScanService.getSettings - la
 * migración ya siembra la fila única vía el DEFAULT de las columnas.
 */
@Injectable()
export class AssistantSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings(): Promise<AssistantSettings> {
    const existing = await this.prisma.platformSettings.findUnique({ where: { id: PLATFORM_SETTINGS_ID } });
    if (existing) {
      return existing;
    }
    return this.prisma.platformSettings.create({ data: { id: PLATFORM_SETTINGS_ID } });
  }

  async updateSettings(patch: UpdateAssistantSettingsInput): Promise<AssistantSettings> {
    return this.prisma.platformSettings.upsert({
      where: { id: PLATFORM_SETTINGS_ID },
      create: { id: PLATFORM_SETTINGS_ID, ...patch },
      update: patch,
    });
  }
}
