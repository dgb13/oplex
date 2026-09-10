import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { getTenantDb, getTenantId, PrismaService, withTenantContext } from '@plexo/database';
import type { AuthenticatedUser } from '@plexo/types';
import { createHash, randomInt } from 'node:crypto';

// Cuánto vive el código antes de tener que pedir uno nuevo - mismo criterio
// que OTP_EXPIRY_MINUTES (signup.service.ts), variable propia porque el
// tiempo razonable para "escribí este código y mandalo por WhatsApp" no
// tiene por qué coincidir con el de un email.
const CODE_EXPIRY_MINUTES = Number(process.env['WHATSAPP_LINK_CODE_EXPIRY_MINUTES'] ?? 10);
const CODE_MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_SECONDS = 60;

export type WhatsAppLinkConfirmOutcome = 'ok' | 'invalid' | 'too-many-attempts' | 'not-found';

export interface WhatsAppLinkRequestResult {
  phoneE164: string;
  code: string;
  expiresAt: Date;
}

export interface WhatsAppLinkStatus {
  linked: boolean;
  phoneE164: string | null;
  verifiedAt: Date | null;
  pending: { phoneE164: string; expiresAt: Date } | null;
}

function generateCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

/** Normaliza a dígitos + "+" adelante (E.164) - mismo "sólo dígitos" que ya
 * usa PurchaseOrderService.buildWhatsappLink para el link de wa.me, acá se
 * le suma el "+" porque esto se guarda como identificador único, no como
 * un link efímero. */
function normalizePhone(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, '');
  if (digits.length < 8 || digits.length > 15) {
    throw new BadRequestException('Número de teléfono inválido');
  }
  return `+${digits}`;
}

/**
 * Fase 5a del asistente de IA (docs/plan-asistente-ia-conversacional.md,
 * sección 3.3) - vinculación de un número de WhatsApp a la cuenta YA
 * logueada. Sólo la mitad "web" del flujo: pedir un código y mostrárselo al
 * usuario, y la lógica de confirmarlo. Todavía NO recibe mensajes reales de
 * WhatsApp (esa es la Fase 5b, que requiere credenciales de Meta Cloud API
 * que este proyecto no tiene cargadas todavía) - `confirmCode()` está lista
 * para que el webhook de 5b la llame apenas exista, pero por ahora no la
 * invoca nadie desde HTTP.
 */
@Injectable()
export class WhatsAppLinkService {
  constructor(private readonly prisma: PrismaService) {}

  /** Corre dentro del contexto de tenant ya abierto por el request
   * autenticado (TenantContextInterceptor) - a diferencia de confirmCode()
   * de más abajo, que corre pre-auth (la llama un webhook, no un usuario
   * logueado). */
  async requestLink(user: AuthenticatedUser, phoneRaw: string): Promise<WhatsAppLinkRequestResult> {
    const db = getTenantDb();
    const phoneE164 = normalizePhone(phoneRaw);

    const existingLink = await db.whatsAppLink.findUnique({ where: { userId: user.sub } });
    if (existingLink) {
      throw new ForbiddenException('Ya tenés un número de WhatsApp vinculado - desvinculalo antes de generar uno nuevo');
    }

    const existingRequest = await db.whatsAppLinkRequest.findUnique({ where: { userId: user.sub } });
    if (existingRequest) {
      const secondsSinceLastSend = (Date.now() - existingRequest.lastSentAt.getTime()) / 1000;
      if (secondsSinceLastSend < RESEND_COOLDOWN_SECONDS) {
        throw new BadRequestException('Esperá un momento antes de generar otro código');
      }
    }

    const code = generateCode();
    const expiresAt = new Date(Date.now() + CODE_EXPIRY_MINUTES * 60_000);
    await db.whatsAppLinkRequest.upsert({
      where: { userId: user.sub },
      create: { tenantId: getTenantId(), userId: user.sub, phoneE164, codeHash: hashCode(code), expiresAt },
      update: { phoneE164, codeHash: hashCode(code), expiresAt, attemptCount: 0, lastSentAt: new Date() },
    });

    // El código vuelve tal cual en la respuesta - acá no hay "envío" real
    // todavía (eso es justamente lo que falta para vincular): mostrárselo
    // en pantalla a un usuario que ya probó su identidad con su contraseña
    // ES la entrega (sección 3.3 del plan, paso 2).
    return { phoneE164, code, expiresAt };
  }

  async getStatus(user: AuthenticatedUser): Promise<WhatsAppLinkStatus> {
    const db = getTenantDb();
    const [link, pending] = await Promise.all([
      db.whatsAppLink.findUnique({ where: { userId: user.sub } }),
      db.whatsAppLinkRequest.findUnique({ where: { userId: user.sub } }),
    ]);
    return {
      linked: !!link,
      phoneE164: link?.phoneE164 ?? null,
      verifiedAt: link?.verifiedAt ?? null,
      pending: pending && pending.expiresAt > new Date() ? { phoneE164: pending.phoneE164, expiresAt: pending.expiresAt } : null,
    };
  }

  async unlink(user: AuthenticatedUser): Promise<void> {
    await getTenantDb().whatsAppLink.deleteMany({ where: { userId: user.sub } });
  }

  /** Fase 5b la llama desde el webhook real, con tenantId/userId ya
   * resueltos por la función SECURITY DEFINER que esa fase agrega (buscar
   * "a qué pending le corresponde este teléfono" sin contexto de tenant
   * todavía - mismo problema que find_tenants_by_email en el login). Por
   * eso recibe los ids ya resueltos en vez de resolverlos acá: esta función
   * sólo sabe validar/confirmar, no reimplementa esa búsqueda pre-auth. Abre
   * su propio withTenantContext porque quien la llama (un webhook) no tiene
   * ninguno abierto todavía. */
  async confirmCode(tenantId: string, userId: string, phoneE164: string, code: string): Promise<WhatsAppLinkConfirmOutcome> {
    return withTenantContext(this.prisma, tenantId, async () => {
      const db = getTenantDb();
      const pending = await db.whatsAppLinkRequest.findUnique({ where: { userId } });
      if (!pending || pending.phoneE164 !== phoneE164) {
        return 'not-found';
      }
      if (pending.expiresAt < new Date()) {
        return 'invalid';
      }
      if (pending.attemptCount >= CODE_MAX_ATTEMPTS) {
        return 'too-many-attempts';
      }
      if (pending.codeHash !== hashCode(code)) {
        await db.whatsAppLinkRequest.update({ where: { userId }, data: { attemptCount: { increment: 1 } } });
        return 'invalid';
      }

      await db.whatsAppLink.create({ data: { tenantId, userId, phoneE164 } });
      await db.whatsAppLinkRequest.delete({ where: { userId } });
      return 'ok';
    });
  }
}
