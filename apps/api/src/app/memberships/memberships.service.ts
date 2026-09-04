import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { getTenantDb, PrismaService, withTenantContext } from '@plexo/database';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { AuthService } from '../auth/auth.service.js';

/** Rango del mes calendario actual en UTC - mismo criterio que
 * AdminTenantsService.currentMonthRangeUtc() (apps/api/src/app/admin/
 * admin-tenants.service.ts), reescrito acá porque ese helper es privado de
 * otro composition-root y este uso es igual de cross-tenant (un solo
 * "ahora" para todo el recorrido de la cartera, no por-cliente). */
function currentMonthRangeUtc(): { from: Date; to: Date } {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { from, to };
}

const PLATFORM_SETTINGS_ID = 'global';

/**
 * Alcance por defecto de un contador externo (ver docs/plan_modulo_contadores.txt,
 * punto 3) - sólo lectura, salvo `taxes` (único precedente real ya
 * existente en el código: `managedByAccountant` en
 * libs/modules/taxes/src/lib/taxes.service.ts, que ya distingue "esto se
 * le puede delegar a un ACCOUNTANT" en producción). Éste es además el
 * conjunto COMPLETO de módulos que en toda la app usan
 * `@RequireModuleAccess` (grep verificado) - `invoicing`/`receivables`/
 * `payables` sólo usan `@Roles(...)`, así que el rol `ACCOUNTANT` de la
 * fila espejo ya les da acceso sin necesitar ninguna fila acá; nada de
 * Inventario/Ventas/Compras/POS por defecto, ninguno de esos módulos
 * aparece en esta lista a propósito.
 */
const DEFAULT_ACCOUNTANT_MODULE_ACCESS: { module: string; canRead: boolean; canWrite: boolean }[] = [
  { module: 'taxes', canRead: true, canWrite: true },
  { module: 'accounting', canRead: true, canWrite: false },
  { module: 'reports-sales', canRead: true, canWrite: false },
  { module: 'reports-pnl', canRead: true, canWrite: false },
  { module: 'reports-financial', canRead: true, canWrite: false },
];

export interface ResolvedTenant {
  tenantId: string;
  tenantName: string;
}

export interface PortfolioClientSummary {
  membershipId: string;
  clientTenantId: string;
  clientTenantName: string;
  ownTaxCondition: string | null;
  invoicesThisMonth: number;
  upcomingDeadlines: PortfolioDeadlineSummary[];
}

export interface PortfolioDeadlineSummary {
  id: string;
  kind: string;
  dueDate: Date;
  description: string;
}

/** Cuántos vencimientos PENDING trae el consolidado por cliente - a
 * propósito sin filtro de fecha (>= hoy): uno ya vencido y todavía PENDING
 * es justamente el que más le importa ver primero al contador, orderBy
 * dueDate asc ya lo deja arriba de la lista. */
const PORTFOLIO_DEADLINES_PER_CLIENT = 5;

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

export interface ClientMembershipSummary {
  id: string;
  homeTenantId: string;
  homeTenantName: string;
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
  private readonly logger = new Logger(MembershipsService.name);

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
   * Cartera consolidada: sólo las membresías ACCEPTED, con un resumen
   * liviano por cliente (condición IVA + facturación de este mes) - mismo
   * patrón/costo que AdminTenantsService.listTenants() (un
   * withTenantContext por cliente, secuencial, con try/catch individual
   * para que un cliente con datos corruptos no tumbe la cartera entera).
   * Deliberadamente liviano: NO recalcula VatBookService.getSalesBook()
   * completo acá - eso se reserva para cuando el contador entra a UN
   * cliente puntual (ver plan, "Costo, honestamente"). Incluye los próximos
   * vencimientos PENDING de cada cliente (sub-fase 1e).
   */
  async getPortfolio(studioTenantId: string): Promise<PortfolioClientSummary[]> {
    const memberships = await this.listMine(studioTenantId);
    const accepted = memberships.filter((m) => m.status === 'ACCEPTED');
    const { from, to } = currentMonthRangeUtc();

    const summaries: PortfolioClientSummary[] = [];
    for (const membership of accepted) {
      try {
        const summary = await withTenantContext(this.prisma, membership.clientTenantId, async () => {
          const db = getTenantDb();
          const [settings, invoicesThisMonth, deadlines] = await Promise.all([
            db.tenantSettings.findUnique({ where: { tenantId: membership.clientTenantId } }),
            db.invoice.count({ where: { issueDate: { gte: from, lt: to } } }),
            db.taxDeadline.findMany({
              where: { status: 'PENDING' },
              orderBy: { dueDate: 'asc' },
              take: PORTFOLIO_DEADLINES_PER_CLIENT,
            }),
          ]);
          return {
            membershipId: membership.id,
            clientTenantId: membership.clientTenantId,
            clientTenantName: membership.clientTenantName,
            ownTaxCondition: settings?.ownTaxCondition ?? null,
            invoicesThisMonth,
            upcomingDeadlines: deadlines.map((d) => ({
              id: d.id,
              kind: d.kind,
              dueDate: d.dueDate,
              description: d.description,
            })),
          };
        });
        summaries.push(summary);
      } catch (err) {
        this.logger.error(
          `Failed to load portfolio summary for ${membership.clientTenantId}: ${(err as Error).message}`,
        );
      }
    }

    return summaries;
  }

  /** Relaciones donde YO soy el cliente (invité a un estudio, o un estudio
   * me pidió acceso) - a diferencia de listMine(), esto SÍ es RLS estándar
   * (la fila vive en mi propio tenant, ya visible vía el contexto que
   * TenantContextInterceptor ya abrió para este request). Lo único
   * cross-tenant es mostrar el NOMBRE del estudio del otro lado
   * (homeTenantId) - se resuelve por tenant distinto abriendo un
   * withTenantContext puntual, mismo mecanismo que activate()/
   * requestFromStudio, sin necesitar otra función SQL nueva. */
  async listForClient(): Promise<ClientMembershipSummary[]> {
    const rows = await getTenantDb().tenantMembership.findMany({ orderBy: { createdAt: 'desc' } });

    const homeTenantIds = [...new Set(rows.map((r) => r.homeTenantId))];
    const namesByTenantId = new Map<string, string>();
    for (const homeTenantId of homeTenantIds) {
      const tenant = await withTenantContext(this.prisma, homeTenantId, () =>
        getTenantDb().tenant.findUnique({ where: { id: homeTenantId } }),
      );
      namesByTenantId.set(homeTenantId, tenant?.name ?? 'Estudio desconocido');
    }

    return rows.map((row) => ({
      id: row.id,
      homeTenantId: row.homeTenantId,
      homeTenantName: namesByTenantId.get(row.homeTenantId) ?? 'Estudio desconocido',
      direction: row.direction,
      status: row.status,
      inviteeIdentifier: row.inviteeIdentifier,
      createdAt: row.createdAt,
      respondedAt: row.respondedAt,
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
      // Primera vez que algo escribe en UserModuleAccess en toda la app -
      // hasta acá sólo se leía (ver plan). Alcance mínimo/curado, no un CRUD
      // genérico: sólo esta fila puntual, con este set fijo de módulos.
      await db.userModuleAccess.createMany({
        data: DEFAULT_ACCOUNTANT_MODULE_ACCESS.map((grant) => ({
          tenantId: clientTenantId,
          userId: user.id,
          ...grant,
        })),
      });
      const moduleAccessRows = await db.userModuleAccess.findMany({ where: { userId: user.id } });

      return { linkedUser: user, moduleAccess: moduleAccessRows };
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

  /** "Invita" (CLIENT_INVITED) - el cliente, operando en su propio contexto
   * de siempre, arma la fila directo con RLS estándar (es el único de los
   * dos flujos de alta que no necesita ningún salto de contexto: el cliente
   * ya está "en su tenant"). */
  async inviteFromClient(
    identifier: string,
    clientTenantId: string,
    initiatedByUserId: string,
  ): Promise<StudioMembershipSummary> {
    const resolved = await this.resolveIdentifier(identifier);
    if (!resolved) {
      throw new NotFoundException(
        'No encontramos ninguna cuenta de Oplex con ese email/CUIT - el estudio contable necesita tener su propia cuenta antes de poder invitarlo.',
      );
    }
    if (resolved.tenantId === clientTenantId) {
      throw new BadRequestException('No podés invitarte a vos mismo');
    }

    const db = getTenantDb();
    const existing = await db.tenantMembership.findFirst({
      where: { homeTenantId: resolved.tenantId, status: { in: ['PENDING', 'ACCEPTED'] } },
    });
    if (existing) {
      throw new BadRequestException('Ya existe una relación pendiente o activa con este estudio');
    }

    const created = await db.tenantMembership.create({
      data: {
        tenantId: clientTenantId,
        homeTenantId: resolved.tenantId,
        inviteeIdentifier: identifier,
        direction: 'CLIENT_INVITED',
        status: 'PENDING',
        initiatedByUserId,
      },
    });
    return this.toSummary(created, resolved.tenantName);
  }

  /** "Pide acceso" (ACCOUNTANT_REQUESTED) - a diferencia de inviteFromClient,
   * acá el que llama (el estudio) NO tiene contexto sobre el tenant cliente
   * resuelto, así que hace falta abrir un withTenantContext propio para esa
   * escritura puntual - mismo mecanismo que ya usa activate() para entrar a
   * un tenant cliente, no una función SQL nueva. */
  async requestFromStudio(
    identifier: string,
    studioTenantId: string,
    actorUserId: string,
  ): Promise<StudioMembershipSummary> {
    const resolved = await this.resolveIdentifier(identifier);
    if (!resolved) {
      throw new NotFoundException('No encontramos ninguna cuenta de Oplex con ese email/CUIT.');
    }
    if (resolved.tenantId === studioTenantId) {
      throw new BadRequestException('No podés pedirte acceso a vos mismo');
    }

    const mine = await this.listMine(studioTenantId);
    const existing = mine.find(
      (m) => m.clientTenantId === resolved.tenantId && (m.status === 'PENDING' || m.status === 'ACCEPTED'),
    );
    if (existing) {
      throw new BadRequestException('Ya existe una relación pendiente o activa con este cliente');
    }

    const created = await withTenantContext(this.prisma, resolved.tenantId, () =>
      getTenantDb().tenantMembership.create({
        data: {
          tenantId: resolved.tenantId,
          homeTenantId: studioTenantId,
          inviteeIdentifier: identifier,
          direction: 'ACCOUNTANT_REQUESTED',
          status: 'PENDING',
          initiatedByUserId: actorUserId,
        },
      }),
    );
    return this.toSummary(created, resolved.tenantName);
  }

  /** Responde (acepta/rechaza) una solicitud PENDING. Sólo le corresponde a
   * quien NO la inició: si el cliente invitó, responde el estudio; si el
   * estudio pidió acceso, responde el cliente - chequeado con los propios
   * campos de la fila (dentro del withTenantContext ya abierto), nunca
   * confiando en de qué lado "dice" venir el caller. */
  async respond(
    membershipId: string,
    callerTenantId: string,
    decision: 'ACCEPTED' | 'DECLINED',
  ): Promise<StudioMembershipSummary> {
    const clientTenantId = await this.resolveMembershipClientTenantId(membershipId, callerTenantId);

    return withTenantContext(this.prisma, clientTenantId, async () => {
      const db = getTenantDb();
      const membership = await db.tenantMembership.findUnique({ where: { id: membershipId } });
      if (!membership) {
        throw new NotFoundException('Membership not found');
      }
      if (membership.status !== 'PENDING') {
        throw new ForbiddenException('Esta solicitud ya fue respondida');
      }
      const expectedResponderTenantId =
        membership.direction === 'CLIENT_INVITED' ? membership.homeTenantId : membership.tenantId;
      if (expectedResponderTenantId !== callerTenantId) {
        throw new ForbiddenException('No te corresponde responder esta solicitud');
      }

      const updated = await db.tenantMembership.update({
        where: { id: membershipId },
        data: { status: decision, respondedAt: new Date() },
      });
      const clientTenant = await db.tenant.findUniqueOrThrow({ where: { id: clientTenantId } });
      return this.toSummary(updated, clientTenant.name);
    });
  }

  /** Corta una relación ACCEPTED - cualquiera de las dos partes puede
   * hacerlo. Suspende (no borra) todas las filas espejo ya creadas para
   * esta membership, para que ninguna reactivación futura las reutilice -
   * activate() ya rechaza un User con status SUSPENDED. */
  async revoke(membershipId: string, callerTenantId: string): Promise<StudioMembershipSummary> {
    const clientTenantId = await this.resolveMembershipClientTenantId(membershipId, callerTenantId);

    return withTenantContext(this.prisma, clientTenantId, async () => {
      const db = getTenantDb();
      const membership = await db.tenantMembership.findUnique({ where: { id: membershipId } });
      if (!membership) {
        throw new NotFoundException('Membership not found');
      }
      if (membership.status !== 'ACCEPTED') {
        throw new BadRequestException('Sólo se puede revocar una relación activa');
      }

      const links = await db.tenantMembershipLink.findMany({ where: { membershipId } });
      if (links.length) {
        await db.user.updateMany({
          where: { id: { in: links.map((l) => l.linkedUserId) } },
          data: { status: 'SUSPENDED' },
        });
      }

      const updated = await db.tenantMembership.update({
        where: { id: membershipId },
        data: { status: 'REVOKED', respondedAt: new Date() },
      });
      const clientTenant = await db.tenant.findUniqueOrThrow({ where: { id: clientTenantId } });
      return this.toSummary(updated, clientTenant.name);
    });
  }

  /** Encuentra a qué tenant cliente pertenece una membership sin asumir de
   * qué lado llama el caller: primero intenta RLS estándar (funciona si el
   * caller es el cliente, ya está "en" ese tenant), y si no aparece nada
   * (RLS la esconde) recién ahí prueba del lado del estudio vía
   * list_studio_memberships(). Ninguna de las dos ramas confía en un id
   * mandado por el caller más allá de su propio tenantId ya verificado. */
  private async resolveMembershipClientTenantId(membershipId: string, callerTenantId: string): Promise<string> {
    const asClient = await getTenantDb().tenantMembership.findUnique({ where: { id: membershipId } });
    if (asClient) {
      return asClient.tenantId;
    }
    const mine = await this.listMine(callerTenantId);
    const asStudio = mine.find((m) => m.id === membershipId);
    if (!asStudio) {
      throw new NotFoundException('Membership not found');
    }
    return asStudio.clientTenantId;
  }

  /** email → find_tenants_by_email() (ya existía, usado hoy para login);
   * CUIT (11 dígitos) → find_tenant_by_tax_id() (nueva, mismo mecanismo,
   * ver migración 20260921000000_membership_invites). Ambas son
   * SECURITY DEFINER porque resolver "qué tenant es este identificador" es
   * intrínsecamente cross-tenant - no hay contexto RLS propio todavía. */
  private async resolveIdentifier(identifier: string): Promise<ResolvedTenant | null> {
    const trimmed = identifier.trim();
    if (trimmed.includes('@')) {
      const rows = await this.prisma.$queryRaw<{ tenant_id: string; tenant_name: string }[]>`
        SELECT DISTINCT tenant_id, tenant_name FROM find_tenants_by_email(${trimmed})
      `;
      if (rows.length === 0) return null;
      if (rows.length > 1) {
        throw new BadRequestException('Ese email pertenece a más de una cuenta - probá con el CUIT del estudio');
      }
      return { tenantId: rows[0].tenant_id, tenantName: rows[0].tenant_name };
    }

    const digits = trimmed.replace(/\D/g, '');
    if (digits.length !== 11) {
      throw new BadRequestException('Ingresá un email o un CUIT válido (11 dígitos)');
    }
    const rows = await this.prisma.$queryRaw<{ tenant_id: string; tenant_name: string }[]>`
      SELECT tenant_id, tenant_name FROM find_tenant_by_tax_id(${digits})
    `;
    if (rows.length === 0) return null;
    if (rows.length > 1) {
      throw new BadRequestException('Hay más de una cuenta con ese CUIT - contactá a soporte');
    }
    return { tenantId: rows[0].tenant_id, tenantName: rows[0].tenant_name };
  }

  private toSummary(
    row: {
      id: string;
      tenantId: string;
      direction: 'CLIENT_INVITED' | 'ACCOUNTANT_REQUESTED';
      status: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'REVOKED';
      inviteeIdentifier: string | null;
      createdAt: Date;
      respondedAt: Date | null;
    },
    clientTenantName: string,
  ): StudioMembershipSummary {
    return {
      id: row.id,
      clientTenantId: row.tenantId,
      clientTenantName,
      direction: row.direction,
      status: row.status,
      inviteeIdentifier: row.inviteeIdentifier,
      createdAt: row.createdAt,
      respondedAt: row.respondedAt,
    };
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
