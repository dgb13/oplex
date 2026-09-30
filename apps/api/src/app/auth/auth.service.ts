import { ForbiddenException, Inject, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ActivityLogService, type MyActivityEntry } from '@plexo/activity-log';
import { isPlatformAdminEmail } from '@plexo/auth';
import { AUTH_EMAIL_SENDER, type AuthEmailSender } from '@plexo/auth-email';
import { getTenantDb, PrismaService, withTenantContext, type User } from '@plexo/database';
import { LEGAL_TERMS_VERSION, type AuthenticatedUser, type ModuleAccessClaim } from '@plexo/types';
import * as bcrypt from 'bcryptjs';
import type { SignOptions } from 'jsonwebtoken';
import { createHash, randomBytes } from 'node:crypto';
import type { ChangePasswordDto } from './dto/change-password.dto.js';
import type { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import type { LoginDto } from './dto/login.dto.js';
import type { ResetPasswordDto } from './dto/reset-password.dto.js';
import type { ResolveTenantDto } from './dto/resolve-tenant.dto.js';
import type { UpdateProfileDto } from './dto/update-profile.dto.js';

const PASSWORD_RESET_TOKEN_EXPIRY_MINUTES = Number(process.env['PASSWORD_RESET_TOKEN_EXPIRY_MINUTES'] ?? 60);
const FRONTEND_URL = process.env['FRONTEND_URL'] ?? 'http://localhost:4200';

function hashResetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  role: string;
  tenantId: string;
  showOnlinePresence: boolean;
  mustChangePassword: boolean;
  isPlatformAdmin: boolean;
  createdAt: Date;
  // Contrato de uso: la app pide aceptar cuando no coinciden.
  acceptedTermsVersion: string | null;
  currentTermsVersion: string;
}

/** Thrown by login() when the account exists and the password is correct
 * but the email hasn't been verified yet (see SignupService) - a distinct
 * error code (not just a message string) so the frontend can route to
 * /verify-email instead of showing a generic "credenciales inválidas",
 * same idea as how mustChangePassword already redirects. */
export class EmailNotVerifiedError extends ForbiddenException {
  constructor(tenantId: string, email: string) {
    super({ code: 'EMAIL_NOT_VERIFIED', message: 'Verificá tu email para ingresar', tenantId, email });
  }
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly activityLogService: ActivityLogService,
    @Inject(AUTH_EMAIL_SENDER) private readonly authEmailSender: AuthEmailSender,
  ) {}

  /**
   * ip is logged separately from the credential check itself (see
   * recordLoginAttempt) rather than inside the same withTenantContext
   * transaction: throwing UnauthorizedException below would roll back
   * anything written in the transaction that produced `found`, and a
   * failed-login attempt is exactly the kind of activity that must still
   * be recorded even though the "real" operation didn't succeed.
   */
  async login(dto: LoginDto, ip: string | null): Promise<{ accessToken: string }> {
    const found = await withTenantContext(this.prisma, dto.tenantId, async () => {
      const db = getTenantDb();
      const tenant = await db.tenant.findUnique({ where: { id: dto.tenantId } });
      const user = await db.user.findUnique({
        where: { tenantId_email: { tenantId: dto.tenantId, email: dto.email } },
      });
      if (!user) {
        return null;
      }

      const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
      if (!passwordValid) {
        return null;
      }

      const moduleAccess = await db.userModuleAccess.findMany({
        where: { userId: user.id },
      });

      return {
        user,
        moduleAccess,
        tenantSuspended: tenant?.status === 'SUSPENDED',
        userSuspended: user.status === 'SUSPENDED',
      };
    });

    // Credenciales correctas pero tenant/usuario suspendido cuenta como
    // login fallido en el activity log - no se emitió ningún token. Lo
    // mismo para email sin verificar: la contraseña era correcta, pero no
    // se emite token - ver el comentario de EmailNotVerifiedError.
    const loginSucceeded = !!found && !found.tenantSuspended && !found.userSuspended && !!found.user.emailVerifiedAt;
    await this.recordLoginAttempt(dto.tenantId, found?.user.id, ip, loginSucceeded ? 'SUCCESS' : 'FAILURE');

    if (!found) {
      throw new UnauthorizedException('Invalid credentials');
    }
    // Chequeado sólo acá, no en cada request (TenantStatus/UserStatus, ver
    // schema.prisma) - un JWT ya emitido es una foto fija, mismo criterio
    // ya aceptado para mustChangePassword/role (MustChangePasswordGuard).
    // code: 'ACCOUNT_SUSPENDED' en ambos - igual que EMAIL_NOT_VERIFIED más
    // abajo, es lo que el login del frontend usa para mostrar el mensaje
    // real en vez de pisarlo con el genérico "Credenciales inválidas" que
    // usa para contraseña incorrecta.
    if (found.tenantSuspended) {
      throw new UnauthorizedException({
        code: 'ACCOUNT_SUSPENDED',
        message: 'Esta cuenta está suspendida - contactate con el administrador',
      });
    }
    // Distinto del bloqueo de tenant de arriba: acá el tenant sigue activo,
    // es este usuario puntual al que un OWNER/ADMIN suspendió desde
    // /settings/team (UsersService.toggleStatus) sin borrar su historial.
    if (found.userSuspended) {
      throw new UnauthorizedException({
        code: 'ACCOUNT_SUSPENDED',
        message: 'Tu usuario fue suspendido - contactate con el administrador de tu cuenta',
      });
    }
    if (!found.user.emailVerifiedAt) {
      throw new EmailNotVerifiedError(dto.tenantId, found.user.email);
    }

    const accessToken = await this.buildAccessToken(found.user, dto.tenantId, found.moduleAccess, {
      rememberMe: dto.rememberMe,
    });
    return { accessToken };
  }

  /** Único lugar que arma el payload del JWT para un login "normal" (no
   * impersonación) - reusado por login(), y por SignupService/OAuthService
   * cuando emiten un token apenas se crea/verifica una cuenta, para que
   * isPlatformAdmin se calcule una sola vez con el mismo criterio en los 3
   * casos. tenantId se recibe explícito (no user.tenantId) a propósito: en
   * impersonate() el "contexto" (targetTenantId) es la fuente de verdad, no
   * un campo más del row que se leyó bajo ese mismo contexto - evita
   * acoplar el payload a que el caller haya armado bien el mock/row.
   * rememberMe extiende la expiración (JWT_REMEMBER_ME_EXPIRES_IN, default
   * 30d) en vez del JWT_EXPIRES_IN normal (default 8h) - se pasa como
   * override a signAsync en vez de tocar el default global del JwtModule,
   * que sigue siendo el corto. */
  async buildAccessToken(
    user: User,
    tenantId: string,
    moduleAccess: { module: string; canRead: boolean; canWrite: boolean }[],
    opts?: {
      rememberMe?: boolean;
      expiresIn?: string;
      mustChangePasswordOverride?: boolean;
      impersonatedBy?: { id: string; email: string };
    },
  ): Promise<string> {
    const payload: AuthenticatedUser = {
      sub: user.id,
      tenantId,
      email: user.email,
      role: user.role,
      moduleAccess: moduleAccess.map((grant): ModuleAccessClaim => ({
        module: grant.module,
        canRead: grant.canRead,
        canWrite: grant.canWrite,
      })),
      mustChangePassword: opts?.mustChangePasswordOverride ?? user.mustChangePassword,
      isPlatformAdmin: isPlatformAdminEmail(user.email),
      ...(opts?.impersonatedBy ? { impersonatedBy: opts.impersonatedBy } : {}),
    };

    const expiresIn = opts?.expiresIn ?? (opts?.rememberMe ? process.env['JWT_REMEMBER_ME_EXPIRES_IN'] ?? '30d' : undefined);
    if (expiresIn) {
      return this.jwtService.signAsync(payload, { expiresIn: expiresIn as SignOptions['expiresIn'] });
    }
    return this.jwtService.signAsync(payload);
  }

  /**
   * SuperAdmin-only (gated by PlatformAdminGuard at the controller, see
   * AdminTenantsController) - issues a short-lived token (15 min, not the
   * normal 8h default) for the SAME AuthenticatedUser payload shape as
   * login(), but for the TARGET user's own identity. mustChangePassword is
   * forced to false regardless of the target's real flag - otherwise the
   * SuperAdmin could get bounced to /profile mid-impersonation (see
   * MustChangePasswordGuard). impersonatedBy is the one addition to the
   * payload, purely informational (RolesGuard/ModuleAccessGuard/
   * MustChangePasswordGuard don't read it).
   *
   * Records one activity-log entry in the TARGET tenant (userId = the
   * admin's own id, entityLabel names both parties) - this is the only
   * place impersonation becomes visible to that tenant at all, since
   * ActivityLogInterceptor already logs this same request into the
   * ADMIN's own tenant (keyed by request.user.tenantId, which is the
   * admin's tenant, not the target's) without any code here.
   */
  async impersonate(
    targetTenantId: string,
    targetUserId: string,
    impersonatedBy: { id: string; email: string },
  ): Promise<{ accessToken: string; expiresAt: string }> {
    const EXPIRES_IN_MINUTES = 15;

    const found = await withTenantContext(this.prisma, targetTenantId, async () => {
      const db = getTenantDb();
      const user = await db.user.findUnique({ where: { id: targetUserId } });
      if (!user) {
        return null;
      }

      const moduleAccess = await db.userModuleAccess.findMany({ where: { userId: user.id } });

      await db.userActivityLog.create({
        data: {
          tenantId: targetTenantId,
          userId: impersonatedBy.id,
          action: 'admin.impersonate',
          outcome: 'SUCCESS',
          entityLabel: `${user.email} (impersonado por ${impersonatedBy.email})`,
        },
      });

      return { user, moduleAccess };
    });

    if (!found) {
      throw new NotFoundException('User not found in that tenant');
    }

    const accessToken = await this.buildAccessToken(found.user, targetTenantId, found.moduleAccess, {
      expiresIn: `${EXPIRES_IN_MINUTES}m`,
      mustChangePasswordOverride: false,
      impersonatedBy,
    });
    const expiresAt = new Date(Date.now() + EXPIRES_IN_MINUTES * 60_000).toISOString();
    return { accessToken, expiresAt };
  }

  private async recordLoginAttempt(
    tenantId: string,
    userId: string | undefined,
    ip: string | null,
    outcome: 'SUCCESS' | 'FAILURE',
  ): Promise<void> {
    try {
      await withTenantContext(this.prisma, tenantId, () =>
        getTenantDb().userActivityLog.create({
          data: { tenantId, userId, action: 'auth.login', outcome, ip },
        }),
      );
    } catch (err) {
      // A logging failure must never block login itself.
      this.logger.error(`Failed to record login attempt: ${(err as Error).message}`);
    }
  }

  /**
   * Profile reads/writes below all run inside a request already wrapped by
   * TenantContextInterceptor (these routes aren't @Public()), so they use
   * getTenantDb() directly rather than opening their own withTenantContext -
   * unlike login(), which runs before any such context exists.
   */
  async getProfile(userId: string): Promise<UserProfile> {
    const user = await getTenantDb().user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return toProfile(user);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<UserProfile> {
    const user = await getTenantDb().user.update({
      where: { id: userId },
      data: {
        name: dto.name,
        avatarUrl: dto.avatarUrl,
        showOnlinePresence: dto.showOnlinePresence,
      },
    });
    return toProfile(user);
  }

  /** Own recent actions, friendly phrasing only - see ActivityLogService
   * for why this stays deliberately free of IP/diff detail. */
  getMyActivity(userId: string): Promise<MyActivityEntry[]> {
    return this.activityLogService.listForUser(userId);
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await getTenantDb().user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const currentValid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!currentValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await getTenantDb().user.update({
      where: { id: userId },
      data: { passwordHash, mustChangePassword: false },
    });
  }

  /** Un email sólo es único por (tenantId, email) - ver User en
   * schema.prisma - así que "a qué empresa pertenece este email" puede
   * tener 0, 1 o varias respuestas. find_tenants_by_email() es una función
   * SECURITY DEFINER (mismo patrón que list_tenant_ids(), ver la migración
   * 20260826000000_auth_onboarding) porque esto corre pre-auth: no hay
   * ningún tenant activo todavía del cual consultar con RLS normal. El
   * frontend usa esto para autocompletar/pedir elegir el tenantId antes del
   * paso de contraseña, en vez del campo "Tenant ID" a mano de antes. */
  async resolveTenant(dto: ResolveTenantDto): Promise<{ candidates: { tenantId: string; tenantName: string }[] }> {
    const rows = await this.prisma.$queryRaw<{ tenant_id: string; tenant_name: string }[]>`
      SELECT tenant_id, tenant_name FROM find_tenants_by_email(${dto.email})
    `;
    return { candidates: rows.map((row) => ({ tenantId: row.tenant_id, tenantName: row.tenant_name })) };
  }

  /** Siempre responde {ok:true} sin importar cuántos (o cero) tenants
   * matchean el email - no hay forma de distinguir "no existe esa cuenta"
   * de "listo, revisá tu correo" desde afuera (mismo criterio anti-
   * enumeración que cualquier flujo de reseteo de contraseña estándar). Un
   * email en 2+ tenants recibe un link por cada uno, cada link con su
   * propio tenantId/token. */
  async forgotPassword(dto: ForgotPasswordDto): Promise<{ ok: true }> {
    const rows = await this.prisma.$queryRaw<{ tenant_id: string; user_id: string }[]>`
      SELECT tenant_id, user_id FROM find_tenants_by_email(${dto.email})
    `;

    for (const row of rows) {
      const rawToken = randomBytes(32).toString('base64url');
      const tokenHash = hashResetToken(rawToken);
      const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_EXPIRY_MINUTES * 60_000);

      await withTenantContext(this.prisma, row.tenant_id, async () => {
        const db = getTenantDb();
        // Cualquier token previo sin usar de este usuario queda inválido -
        // sólo el último link enviado debe poder usarse.
        await db.passwordResetToken.updateMany({
          where: { userId: row.user_id, usedAt: null },
          data: { usedAt: new Date() },
        });
        await db.passwordResetToken.create({
          data: { tenantId: row.tenant_id, userId: row.user_id, tokenHash, expiresAt },
        });
      });

      const resetUrl = `${FRONTEND_URL}/reset-password?tenantId=${row.tenant_id}&token=${rawToken}`;
      await this.authEmailSender.sendPasswordResetLink({
        to: dto.email,
        resetUrl,
        expiresInMinutes: PASSWORD_RESET_TOKEN_EXPIRY_MINUTES,
      });
    }

    return { ok: true };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const tokenHash = hashResetToken(dto.token);

    const outcome = await withTenantContext(this.prisma, dto.tenantId, async () => {
      const db = getTenantDb();
      const tokenRow = await db.passwordResetToken.findFirst({
        where: { tokenHash, usedAt: null },
      });
      if (!tokenRow || tokenRow.expiresAt < new Date()) {
        return 'invalid' as const;
      }

      const passwordHash = await bcrypt.hash(dto.newPassword, 10);
      await db.user.update({ where: { id: tokenRow.userId }, data: { passwordHash } });
      await db.passwordResetToken.update({ where: { id: tokenRow.id }, data: { usedAt: new Date() } });
      return 'ok' as const;
    });

    if (outcome === 'invalid') {
      throw new UnauthorizedException('El link de recuperación es inválido o expiró');
    }
  }
}

function toProfile(user: User): UserProfile {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    role: user.role,
    tenantId: user.tenantId,
    showOnlinePresence: user.showOnlinePresence,
    mustChangePassword: user.mustChangePassword,
    isPlatformAdmin: isPlatformAdminEmail(user.email),
    createdAt: user.createdAt,
    acceptedTermsVersion: user.acceptedTermsVersion,
    currentTermsVersion: LEGAL_TERMS_VERSION,
  };
}
