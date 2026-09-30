import { Inject, Injectable, Logger } from '@nestjs/common';
import { AUTH_EMAIL_SENDER, type AuthEmailSender } from '@plexo/auth-email';
import { getTenantDb, getTenantId, getUserId, PrismaService, type LegalRequestType } from '@plexo/database';
import { LEGAL_TERMS_VERSION } from '@plexo/types';
import { randomInt } from 'node:crypto';

// Titular del servicio (ver apps/web/legal/terminos-y-condiciones.md): a
// este email llegan los pedidos de arrepentimiento y de baja.
const PROVIDER_EMAIL = process.env['LEGAL_CONTACT_EMAIL'] ?? 'belvederegerman79@gmail.com';

export interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

const TYPE_LABEL: Record<LegalRequestType, { prefix: string; name: string }> = {
  WITHDRAWAL: { prefix: 'ARR', name: 'arrepentimiento (revocación de la contratación)' },
  CANCELLATION: { prefix: 'BAJ', name: 'baja de la suscripción' },
};

/**
 * Contrato de uso: aceptación registrada de los Términos, la Política de
 * Privacidad y el Acuerdo de Tratamiento de Datos (la prueba ante un
 * reclamo), y los pedidos de arrepentimiento (Res. 424/2020) y de baja
 * (Ley 24.240 art. 10 ter).
 */
@Injectable()
export class LegalService {
  private readonly logger = new Logger(LegalService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(AUTH_EMAIL_SENDER) private readonly email: AuthEmailSender,
  ) {}

  /** Registra la aceptación de la versión vigente por el usuario actual
   * (dentro de la transacción del request). Idempotente por versión. */
  async acceptCurrentTerms(meta: RequestMeta, userId = getUserId()): Promise<{ version: string; acceptedAt: Date }> {
    if (!userId) {
      throw new Error('No hay usuario para registrar la aceptación');
    }
    const db = getTenantDb();
    const acceptedAt = new Date();
    await db.legalAcceptance.create({
      data: {
        tenantId: getTenantId(),
        userId,
        version: LEGAL_TERMS_VERSION,
        acceptedAt,
        ip: meta.ip?.slice(0, 100),
        userAgent: meta.userAgent?.slice(0, 500),
      },
    });
    await db.user.update({
      where: { id: userId },
      data: { acceptedTermsVersion: LEGAL_TERMS_VERSION, acceptedTermsAt: acceptedAt },
    });
    return { version: LEGAL_TERMS_VERSION, acceptedAt };
  }

  /** Pedido de arrepentimiento (página pública, sin sesión) o de baja
   * (desde la app). Devuelve el número de trámite y avisa por email al
   * titular y a quien lo pidió. */
  async createRequest(
    type: LegalRequestType,
    input: { name: string; email: string; taxId?: string; message?: string },
    meta: RequestMeta,
    session?: { tenantId: string; userId: string },
  ): Promise<{ code: string; createdAt: Date }> {
    const label = TYPE_LABEL[type];
    let created: { code: string; createdAt: Date } | null = null;
    for (let attempt = 0; attempt < 5 && !created; attempt++) {
      const code = `${label.prefix}-${randomInt(0, 1_000_000).toString().padStart(6, '0')}`;
      try {
        created = await this.prisma.legalRequest.create({
          data: {
            type,
            code,
            tenantId: session?.tenantId,
            userId: session?.userId,
            name: input.name.trim(),
            email: input.email.trim(),
            taxId: input.taxId?.trim() || null,
            message: input.message?.trim() || null,
            ip: meta.ip?.slice(0, 100),
          },
          select: { code: true, createdAt: true },
        });
      } catch (err) {
        // Número de trámite repetido (único): se prueba otro.
        if ((err as { code?: string }).code !== 'P2002') throw err;
      }
    }
    if (!created) {
      throw new Error('No se pudo generar el número de trámite');
    }

    const when = created.createdAt.toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });
    const detail = [
      `Número de trámite: ${created.code}`,
      `Fecha: ${when}`,
      `Nombre: ${input.name}`,
      `Email: ${input.email}`,
      input.taxId ? `CUIT: ${input.taxId}` : null,
      input.message ? `Mensaje: ${input.message}` : null,
    ]
      .filter(Boolean)
      .join('\n');
    try {
      await this.email.sendLegalNotice({
        to: PROVIDER_EMAIL,
        subject: `Oplex - pedido de ${label.name} ${created.code}`,
        text: `Llegó un pedido de ${label.name}.\n\n${detail}\n`,
      });
      await this.email.sendLegalNotice({
        to: input.email,
        subject: `Oplex - recibimos tu pedido de ${label.name} (${created.code})`,
        text: `Recibimos tu pedido de ${label.name}.\n\n${detail}\n\nGuardá este número de trámite. Te vamos a responder a este email.\n\nOplex`,
      });
    } catch (err) {
      // El pedido ya quedó registrado; un email que falla no lo invalida.
      this.logger.error(`No se pudo enviar el aviso de ${created.code}: ${(err as Error).message}`);
    }
    return created;
  }
}
