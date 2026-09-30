import { BadRequestException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { AUTH_EMAIL_SENDER, type AuthEmailSender } from '@plexo/auth-email';
import { getTenantDb, PrismaService, withTenantContext } from '@plexo/database';
import * as bcrypt from 'bcryptjs';
import { createHash, randomInt, randomUUID } from 'node:crypto';
import { LegalService, type RequestMeta } from '../legal/legal.service.js';
import { AuthService } from './auth.service.js';
import type { ResendCodeDto } from './dto/resend-code.dto.js';
import type { SignupDto } from './dto/signup.dto.js';
import type { VerifyEmailDto } from './dto/verify-email.dto.js';
import { TenantProvisioningService } from './tenant-provisioning.service.js';

const OTP_EXPIRY_MINUTES = Number(process.env['OTP_EXPIRY_MINUTES'] ?? 15);
const OTP_MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_SECONDS = 60;
const SIGNUP_DEFAULT_PLAN_KEY = process.env['SIGNUP_DEFAULT_PLAN_KEY'] ?? 'SILVER';

function generateCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

/**
 * Alta pública de tenant ("Empezá gratis") - a diferencia de
 * AdminTenantsService.createTenant (operador de plataforma, autenticado,
 * autoVerifyEmail:true), acá no hay ningún caller autenticado detrás, así
 * que el gate es un código de 6 dígitos por email antes de poder loguear
 * (ver EmailNotVerifiedError en auth.service.ts). Reusa
 * TenantProvisioningService para la creación de Tenant+User+trial - misma
 * lógica, sólo cambia quién la dispara y con qué flags.
 */
@Injectable()
export class SignupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantProvisioningService: TenantProvisioningService,
    private readonly authService: AuthService,
    @Inject(AUTH_EMAIL_SENDER) private readonly authEmailSender: AuthEmailSender,
    private readonly legalService: LegalService,
  ) {}

  async signup(dto: SignupDto, meta: RequestMeta = {}): Promise<{ tenantId: string; email: string }> {
    const tenantId = randomUUID();
    const passwordHash = await bcrypt.hash(dto.password, 10);

    const { userId } = await this.tenantProvisioningService.provision({
      tenantId,
      name: dto.tenantName,
      taxId: dto.taxId,
      ownerEmail: dto.email,
      ownerName: dto.ownerName,
      passwordHash,
      mustChangePassword: false,
      autoVerifyEmail: false,
      planKey: SIGNUP_DEFAULT_PLAN_KEY,
    });

    // Prueba de que aceptó el contrato al crear la cuenta (quién, cuándo,
    // qué versión, desde qué IP/navegador).
    await withTenantContext(this.prisma, tenantId, () => this.legalService.acceptCurrentTerms(meta, userId));

    await this.issueAndSendCode(tenantId, userId, dto.email);

    return { tenantId, email: dto.email };
  }

  async verifyEmail(dto: VerifyEmailDto): Promise<{ accessToken: string }> {
    const result = await withTenantContext(this.prisma, dto.tenantId, async () => {
      const db = getTenantDb();
      const user = await db.user.findUnique({
        where: { tenantId_email: { tenantId: dto.tenantId, email: dto.email } },
      });
      if (!user) {
        return null;
      }

      const codeRow = await db.emailVerificationCode.findUnique({ where: { userId: user.id } });
      if (!codeRow || codeRow.expiresAt < new Date()) {
        return { outcome: 'invalid' as const };
      }
      if (codeRow.attemptCount >= OTP_MAX_ATTEMPTS) {
        return { outcome: 'too-many-attempts' as const };
      }
      if (codeRow.codeHash !== hashCode(dto.code)) {
        await db.emailVerificationCode.update({
          where: { userId: user.id },
          data: { attemptCount: { increment: 1 } },
        });
        return { outcome: 'invalid' as const };
      }

      const verifiedUser = await db.user.update({
        where: { id: user.id },
        data: { emailVerifiedAt: new Date() },
      });
      await db.emailVerificationCode.delete({ where: { userId: user.id } });
      const moduleAccess = await db.userModuleAccess.findMany({ where: { userId: user.id } });

      return { outcome: 'ok' as const, user: verifiedUser, moduleAccess };
    });

    if (!result || result.outcome === 'invalid') {
      throw new UnauthorizedException('Código inválido o expirado');
    }
    if (result.outcome === 'too-many-attempts') {
      throw new UnauthorizedException('Demasiados intentos - pedí un código nuevo');
    }

    // Recién verificado - el usuario queda logueado directamente, sin pedir
    // login de nuevo (mismo criterio de UX que un "magic link").
    const accessToken = await this.authService.buildAccessToken(result.user, dto.tenantId, result.moduleAccess);
    return { accessToken };
  }

  async resendCode(dto: ResendCodeDto): Promise<{ ok: true }> {
    const outcome = await withTenantContext(this.prisma, dto.tenantId, async () => {
      const db = getTenantDb();
      const user = await db.user.findUnique({
        where: { tenantId_email: { tenantId: dto.tenantId, email: dto.email } },
      });
      if (!user || user.emailVerifiedAt) {
        // Cuenta inexistente o ya verificada - no hay nada que reenviar.
        // No se distingue el motivo en la respuesta (ver forgotPassword,
        // mismo criterio de no revelar de más).
        return 'noop' as const;
      }

      const existing = await db.emailVerificationCode.findUnique({ where: { userId: user.id } });
      if (existing) {
        const secondsSinceLastSend = (Date.now() - existing.lastSentAt.getTime()) / 1000;
        if (secondsSinceLastSend < RESEND_COOLDOWN_SECONDS) {
          return 'cooldown' as const;
        }
      }

      await this.issueAndSendCode(dto.tenantId, user.id, dto.email);
      return 'sent' as const;
    });

    if (outcome === 'cooldown') {
      throw new BadRequestException('Esperá un momento antes de pedir otro código');
    }
    return { ok: true };
  }

  /** Corre DENTRO de un withTenantContext ya abierto por el caller (signup
   * arranca uno propio vía TenantProvisioningService.provision, resendCode
   * abre el suyo) - por eso recibe tenantId/userId en vez de resolverlos de
   * getTenantId()/ambient context, para no asumir en qué callback corre. */
  private async issueAndSendCode(tenantId: string, userId: string, email: string): Promise<void> {
    const code = generateCode();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60_000);

    await withTenantContext(this.prisma, tenantId, () =>
      getTenantDb().emailVerificationCode.upsert({
        where: { userId },
        create: { tenantId, userId, codeHash: hashCode(code), expiresAt },
        update: { codeHash: hashCode(code), expiresAt, attemptCount: 0, lastSentAt: new Date() },
      }),
    );

    await this.authEmailSender.sendVerificationCode({ to: email, code, expiresInMinutes: OTP_EXPIRY_MINUTES });
  }
}
