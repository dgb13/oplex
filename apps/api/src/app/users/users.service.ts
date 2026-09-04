import { ForbiddenException, Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { AUTH_EMAIL_SENDER, type AuthEmailSender } from '@plexo/auth-email';
import { getTenantDb, getTenantId, PrismaService, withTenantContext, type UserRole, type UserStatus } from '@plexo/database';
import { SubscriptionService } from '@plexo/subscriptions';
import type { AuthenticatedUser } from '@plexo/types';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import type { AcceptInvitationDto } from './dto/accept-invitation.dto.js';
import type { ChangeRoleDto } from './dto/change-role.dto.js';
import type { InviteUserDto } from './dto/invite-user.dto.js';
import type { SendInvitationDto } from './dto/send-invitation.dto.js';
import type { ToggleStatusDto } from './dto/toggle-status.dto.js';

const PASSWORD_RESET_TOKEN_EXPIRY_MINUTES = Number(process.env['PASSWORD_RESET_TOKEN_EXPIRY_MINUTES'] ?? 60);
const TEAM_INVITATION_EXPIRY_MINUTES = Number(process.env['TEAM_INVITATION_EXPIRY_HOURS'] ?? 72) * 60;
const FRONTEND_URL = process.env['FRONTEND_URL'] ?? 'http://localhost:4200';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface InvitedUser {
  id: string;
  email: string;
  tempPassword: string;
}

export interface TeamMember {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  status: UserStatus;
  mustChangePassword: boolean;
  createdAt: Date;
  isExternalAccountant: boolean;
}

/**
 * Invitar un segundo/tercer/etc. usuario al propio tenant - a diferencia de
 * AdminTenantsService (que crea un tenant nuevo), esto corre dentro del
 * contexto tenant-scoped normal (getTenantDb()), el mismo que ya abrió
 * TenantContextInterceptor para este request. Vive en apps/api en vez de
 * una lib porque, igual que AuthService, está atado a bcrypt/User de una
 * forma que no encaja en el patrón "lib de negocio" del resto del código.
 *
 * inviteUser() (alta directa con clave temporal, devuelta en la response) e
 * inviteMember() (invitación por mail con link de un solo uso) son dos
 * flujos deliberadamente distintos, no una sola operación con un flag - el
 * admin elige uno u otro en el modal de "Invitar/Agregar colaborador" del
 * frontend.
 */
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptionService: SubscriptionService,
    @Inject(AUTH_EMAIL_SENDER) private readonly authEmailSender: AuthEmailSender,
  ) {}

  async listMembers(): Promise<TeamMember[]> {
    return getTenantDb().user.findMany({
      where: { tenantId: getTenantId() },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        mustChangePassword: true,
        createdAt: true,
        isExternalAccountant: true,
      },
    });
  }

  async inviteUser(dto: InviteUserDto): Promise<InvitedUser> {
    await this.subscriptionService.assertCanAddUser();

    const tempPassword = randomBytes(9).toString('base64url');
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    const user = await getTenantDb().user.create({
      data: {
        tenantId: getTenantId(),
        email: dto.email,
        name: dto.name,
        role: dto.role,
        passwordHash,
        mustChangePassword: true,
      },
    });

    return { id: user.id, email: user.email, tempPassword };
  }

  async inviteMember(dto: SendInvitationDto, actor: AuthenticatedUser): Promise<{ ok: true }> {
    await this.subscriptionService.assertCanAddUser();

    const tenantId = getTenantId();
    const db = getTenantDb();

    const existingUser = await db.user.findUnique({
      where: { tenantId_email: { tenantId, email: dto.email } },
    });
    if (existingUser) {
      throw new ForbiddenException('Ese email ya pertenece a este equipo');
    }

    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + TEAM_INVITATION_EXPIRY_MINUTES * 60_000);

    // Cualquier invitación previa sin usar de este email queda inválida -
    // mismo criterio que AuthService.forgotPassword con PasswordResetToken.
    await db.teamInvitation.updateMany({
      where: { tenantId, email: dto.email, usedAt: null },
      data: { usedAt: new Date() },
    });
    await db.teamInvitation.create({
      data: { tenantId, email: dto.email, role: dto.role, tokenHash, expiresAt, invitedByUserId: actor.sub },
    });

    const tenant = await db.tenant.findUnique({ where: { id: tenantId } });
    const acceptUrl = `${FRONTEND_URL}/accept-invitation?tenantId=${tenantId}&token=${rawToken}`;
    await this.authEmailSender.sendInvitation({
      to: dto.email,
      tenantName: tenant?.name ?? 'tu equipo',
      role: dto.role,
      acceptUrl,
      expiresInMinutes: TEAM_INVITATION_EXPIRY_MINUTES,
    });

    return { ok: true };
  }

  /** Corre pre-auth, como AuthService.resetPassword - el invitado todavía no
   * tiene sesión (ni fila User) hasta este momento, así que no hay contexto
   * tenant-scoped ambient que usar y se abre uno explícito con el tenantId
   * que vino en el link. */
  async acceptInvitation(dto: AcceptInvitationDto): Promise<{ ok: true }> {
    const tokenHash = hashToken(dto.token);

    const outcome = await withTenantContext(this.prisma, dto.tenantId, async () => {
      const db = getTenantDb();
      const invitation = await db.teamInvitation.findFirst({
        where: { tokenHash, usedAt: null },
      });
      if (!invitation || invitation.expiresAt < new Date()) {
        return 'invalid' as const;
      }

      const existingUser = await db.user.findUnique({
        where: { tenantId_email: { tenantId: dto.tenantId, email: invitation.email } },
      });
      if (existingUser) {
        return 'already-member' as const;
      }

      const passwordHash = await bcrypt.hash(dto.password, 10);
      await db.user.create({
        data: {
          tenantId: dto.tenantId,
          email: invitation.email,
          name: dto.name,
          role: invitation.role,
          passwordHash,
          // Llegó por un link a su propia casilla, ya está verificado - mismo
          // criterio que el resto de la app para "email confirmado".
          emailVerifiedAt: new Date(),
        },
      });
      await db.teamInvitation.update({ where: { id: invitation.id }, data: { usedAt: new Date() } });
      return 'ok' as const;
    });

    if (outcome === 'invalid') {
      throw new UnauthorizedException('La invitación es inválida o expiró');
    }
    if (outcome === 'already-member') {
      throw new ForbiddenException('Ese email ya pertenece a este equipo');
    }
    return { ok: true };
  }

  async changeRole(userId: string, dto: ChangeRoleDto): Promise<void> {
    const tenantId = getTenantId();
    const db = getTenantDb();

    const target = await db.user.findFirst({ where: { id: userId, tenantId } });
    if (!target) {
      throw new NotFoundException('Usuario no encontrado');
    }
    this.assertNotExternalAccountant(target);
    if (target.role === 'OWNER' && dto.role !== 'OWNER') {
      await this.assertNotLastActiveOwner(tenantId, userId);
    }

    await db.user.update({ where: { id: userId }, data: { role: dto.role } });
  }

  async toggleStatus(userId: string, dto: ToggleStatusDto, actor: AuthenticatedUser): Promise<void> {
    if (dto.status === 'SUSPENDED' && actor.sub === userId) {
      throw new ForbiddenException('No podés suspender tu propia cuenta');
    }

    const tenantId = getTenantId();
    const db = getTenantDb();

    const target = await db.user.findFirst({ where: { id: userId, tenantId } });
    if (!target) {
      throw new NotFoundException('Usuario no encontrado');
    }
    this.assertNotExternalAccountant(target);
    if (dto.status === 'SUSPENDED' && target.role === 'OWNER') {
      await this.assertNotLastActiveOwner(tenantId, userId);
    }

    await db.user.update({ where: { id: userId }, data: { status: dto.status } });
  }

  /** Defensa en profundidad para la fila espejo de un contador externo
   * (creada por MembershipsService.activate(), ver
   * docs/plan_modulo_contadores.txt Fase 2 punto 1) - su rol/estado real
   * lo gobierna la membership, no la gestión de equipo normal. El
   * frontend ya oculta estos controles para esta fila; esto es la
   * garantía server-side de que no se puede esquivar pegándole directo a
   * la API. */
  private assertNotExternalAccountant(target: { isExternalAccountant: boolean }): void {
    if (target.isExternalAccountant) {
      throw new ForbiddenException(
        'Este usuario está gestionado desde Contadores - andá a /accountants para revocar el acceso',
      );
    }
  }

  /** Admin-triggered: reusa el mismo modelo/mecanismo (PasswordResetToken +
   * AuthEmailSender.sendPasswordResetLink) que ya usa el self-service
   * "olvidé mi contraseña" de AuthService.forgotPassword, en vez de un
   * segundo sistema de clave temporal en paralelo - la diferencia con
   * forgotPassword es sólo el punto de entrada (un admin ya conoce el
   * userId/tenantId, no necesita la búsqueda cross-tenant por email). */
  async resetPasswordForMember(userId: string): Promise<{ ok: true }> {
    const tenantId = getTenantId();
    const db = getTenantDb();

    const target = await db.user.findFirst({ where: { id: userId, tenantId } });
    if (!target) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_EXPIRY_MINUTES * 60_000);

    await db.passwordResetToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });
    await db.passwordResetToken.create({
      data: { tenantId, userId, tokenHash, expiresAt },
    });

    const resetUrl = `${FRONTEND_URL}/reset-password?tenantId=${tenantId}&token=${rawToken}`;
    await this.authEmailSender.sendPasswordResetLink({
      to: target.email,
      resetUrl,
      expiresInMinutes: PASSWORD_RESET_TOKEN_EXPIRY_MINUTES,
    });

    return { ok: true };
  }

  private async assertNotLastActiveOwner(tenantId: string, excludingUserId: string): Promise<void> {
    const otherActiveOwners = await getTenantDb().user.count({
      where: { tenantId, role: 'OWNER', status: 'ACTIVE', id: { not: excludingUserId } },
    });
    if (otherActiveOwners === 0) {
      throw new ForbiddenException('Tiene que quedar al menos un OWNER activo en el equipo');
    }
  }
}
