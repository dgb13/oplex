import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { getTenantDb, PrismaService, withTenantContext } from '@plexo/database';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { AuthService } from '../auth/auth.service.js';

const PLATFORM_SETTINGS_ID = 'global';

export interface StudioMembershipSummary {
  id: string;
  clientTenantId: string;
  clientTenantName: string;
  direction: 'CLIENT_INVITED' | 'ACCOUNTANT_REQUESTED';
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'REVOKED';
  inviteeIdentifier: string | null;
  createdAt: Date;
  respondedAt: Date | null;
}

/**
 * Vive en apps/api (no en una lib) por el mismo motivo que AdminTenantsService:
 * inyecta PrismaService crudo (no getTenantDb()) para poder cruzar tenants -
 * ver docs/plan_modulo_contadores.txt, punto 1. La única forma de leer "mis"
 * TenantMembership (scoped al tenant CLIENTE, no al estudio) desde el lado
 * del estudio es list_studio_memberships(), SECURITY DEFINER, mismo patrón
 * ya probado por list_tenant_ids()/find_tenants_by_email() - ver la
 * migración 20260920000000_tenant_membership.
 */
@Injectable()
export class MembershipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  /** Cartera del estudio (todas las membresías donde homeTenantId = el
   * tenant del que llama), sin importar en qué tenant cliente vive cada
   * fila - por eso la función SQL, no un findMany bajo RLS normal. */
  async listMine(studioTenantId: string): Promise<StudioMembershipSummary[]> {
    const rows = await this.prisma.$queryRaw<
      {
        id: string;
        tenant_id: string;
        client_tenant_name: string;
        direction: 'CLIENT_INVITED' | 'ACCOUNTANT_REQUESTED';
        status: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'REVOKED';
        invitee_identifier: string | null;
        created_at: Date;
        responded_at: Date | null;
      }[]
    >`SELECT * FROM list_studio_memberships(${studioTenantId})`;

    return rows.map((row) => ({
      id: row.id,
      clientTenantId: row.tenant_id,
      clientTenantName: row.client_tenant_name,
      direction: row.direction,
      status: row.status,
      inviteeIdentifier: row.invitee_identifier,
      createdAt: row.created_at,
      respondedAt: row.responded_at,
    }));
  }

  /**
   * Activa una sesión en el tenant cliente de una membership ya ACCEPTED,
   * con la identidad PROPIA del usuario que llama (no un usuario prestado
   * del cliente, a diferencia de AuthService.impersonate()) - ver punto 2
   * del plan. Nunca acepta ningún id de actor desde el body/params: el
   * único id de estudio que importa es request.user.tenantId (el del JWT ya
   * verificado, resuelto por el controller), nunca uno pasado por el
   * caller - es la pieza de más escrutinio de todo el diseño, ver el plan.
   */
  async activate(
    membershipId: string,
    actorUserId: string,
    actorTenantId: string,
  ): Promise<{ accessToken: string; expiresAt: string }> {
    // Todavía dentro del contexto RLS del PROPIO tenant del que llama (el
    // estudio) - TenantContextInterceptor ya lo abrió para este request.
    // Hace falta capturar email/name ACÁ, antes de saltar al tenant
    // cliente más abajo, porque este User (el del estudio) deja de ser
    // visible bajo RLS en cuanto se activa el contexto del cliente.
    const studioUser = await getTenantDb().user.findUnique({ where: { id: actorUserId } });
    if (!studioUser) {
      throw new NotFoundException('User not found');
    }

    const memberships = await this.listMine(actorTenantId);
    const membership = memberships.find((m) => m.id === membershipId);
    if (!membership) {
      throw new NotFoundException('Membership not found');
    }
    if (membership.status !== 'ACCEPTED') {
      throw new ForbiddenException('Esta membership todavía no fue aceptada');
    }

    const clientTenantId = membership.clientTenantId;

    const { linkedUser, moduleAccess } = await withTenantContext(this.prisma, clientTenantId, async () => {
      const db = getTenantDb();
      const existingLink = await db.tenantMembershipLink.findUnique({
        where: { membershipId_studioUserId: { membershipId, studioUserId: actorUserId } },
      });

      if (existingLink) {
        const user = await db.user.findUnique({ where: { id: existingLink.linkedUserId } });
        if (!user) {
          throw new NotFoundException('Linked user not found');
        }
        if (user.status === 'SUSPENDED') {
          throw new ForbiddenException('Tu acceso a este cliente fue suspendido');
        }
        const moduleAccessRows = await db.userModuleAccess.findMany({ where: { userId: user.id } });
        return { linkedUser: user, moduleAccess: moduleAccessRows };
      }

      // Contraseña aleatoria e inutilizable a propósito - esta fila nunca
      // se loguea directo (ver plan, "isExternalAccountant"), sólo se
      // activa vía este endpoint.
      const passwordHash = await bcrypt.hash(randomBytes(32).toString('hex'), 10);
      const user = await db.user.create({
        data: {
          tenantId: clientTenantId,
          email: studioUser.email,
          name: studioUser.name,
          role: 'ACCOUNTANT',
          passwordHash,
          isExternalAccountant: true,
          emailVerifiedAt: new Date(),
        },
      });
      await db.tenantMembershipLink.create({
        data: { tenantId: clientTenantId, membershipId, studioUserId: actorUserId, linkedUserId: user.id },
      });

      return { linkedUser: user, moduleAccess: [] as { module: string; canRead: boolean; canWrite: boolean }[] };
    });

    const settings = await this.getSettings();
    const accessToken = await this.authService.buildAccessToken(linkedUser, clientTenantId, moduleAccess, {
      expiresIn: `${settings.membershipSessionDurationHours}h`,
    });
    const expiresAt = new Date(
      Date.now() + settings.membershipSessionDurationHours * 60 * 60_000,
    ).toISOString();
    return { accessToken, expiresAt };
  }

  /** Get-or-create defensivo - mismo criterio que
   * ExchangeRateSchedulerService.getSettings (la migración ya siembra la
   * fila única vía el DEFAULT de la columna, esto es sólo una red de
   * seguridad si algún día se resetea la tabla a mano). */
  async getSettings(): Promise<{ membershipSessionDurationHours: number }> {
    const existing = await this.prisma.platformSettings.findUnique({ where: { id: PLATFORM_SETTINGS_ID } });
    if (existing) {
      return existing;
    }
    return this.prisma.platformSettings.create({ data: { id: PLATFORM_SETTINGS_ID } });
  }

  /** "Duración de sesión de membership" en Admin - elegible entre 1/2/5/8hs
   * (validado en el DTO del controller, @IsIn([1,2,5,8])). */
  async updateSettings(hours: number): Promise<{ membershipSessionDurationHours: number }> {
    return this.prisma.platformSettings.upsert({
      where: { id: PLATFORM_SETTINGS_ID },
      create: { id: PLATFORM_SETTINGS_ID, membershipSessionDurationHours: hours },
      update: { membershipSessionDurationHours: hours },
    });
  }
}
