import { Injectable } from '@nestjs/common';
import { getTenantDb, PrismaService, withTenantContext, type TenantStatus } from '@plexo/database';
import * as bcrypt from 'bcryptjs';
import { randomBytes, randomUUID } from 'node:crypto';
import { AuthService } from '../auth/auth.service.js';
import { TenantProvisioningService } from '../auth/tenant-provisioning.service.js';
import type { CreateTenantDto } from './dto/create-tenant.dto.js';

export interface CreatedTenant {
  tenantId: string;
  ownerEmail: string;
  tempPassword: string;
}

export interface TenantUserSummary {
  id: string;
  email: string;
  name: string | null;
  roles: string[];
}

/**
 * Alta de tenant para el operador de plataforma (ver PlatformAdminGuard) -
 * reemplaza el proceso manual (seed script / SQL directo) que era el único
 * camino hasta ahora. Vive en apps/api (no en una lib) porque, a diferencia
 * de todo lo demás en este código, esta operación NO puede quedar scopeada
 * al tenant de quien la ejecuta: inyecta PrismaService crudo, nunca
 * getTenantDb().
 *
 * `Tenant` SÍ tiene RLS (policy tenant_self_only, keyed por "id" - ver
 * 20260723000001_row_level_security) - por eso hace falta abrir un
 * withTenantContext propio para el tenant recién generado antes de poder
 * insertarlo, no es opcional. Como este request YA viene envuelto en una
 * transacción para el tenant del propio admin (TenantContextInterceptor,
 * global), este bloque abre una segunda transacción/conexión independiente
 * en el mismo pool - aceptable para un endpoint de un solo operador, de
 * baja frecuencia.
 */
@Injectable()
export class AdminTenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly tenantProvisioningService: TenantProvisioningService,
  ) {}

  // La lista y la ficha de tenants viven en AdminTenantInsightsService.

  /** Para el selector de "a quién impersonar" en el frontend, cuando un
   * tenant tiene más de un usuario (ver la sección de impersonación del
   * plan aprobado). */
  async listTenantUsers(tenantId: string): Promise<TenantUserSummary[]> {
    return withTenantContext(this.prisma, tenantId, async () => {
      const users = await getTenantDb().user.findMany({
        select: { id: true, email: true, name: true, roles: true },
        orderBy: { email: 'asc' },
      });
      return users;
    });
  }

  async updateTenantStatus(tenantId: string, status: TenantStatus): Promise<void> {
    await withTenantContext(this.prisma, tenantId, () =>
      getTenantDb().tenant.update({ where: { id: tenantId }, data: { status } }),
    );
  }

  /** Delega en AuthService.impersonate() - ver ese método para el detalle
   * del token corto y el registro en el activity log del tenant destino. */
  impersonate(tenantId: string, userId: string, admin: { id: string; email: string }) {
    return this.authService.impersonate(tenantId, userId, admin);
  }

  async createTenant(dto: CreateTenantDto): Promise<CreatedTenant> {
    const tenantId = randomUUID();
    const tempPassword = randomBytes(9).toString('base64url');
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    // autoVerifyEmail: true - un tenant dado de alta acá lo crea el
    // operador de plataforma a mano, no hace falta el gate de OTP que sí
    // aplica al signup público (ver SignupService).
    await this.tenantProvisioningService.provision({
      tenantId,
      name: dto.name,
      taxId: dto.taxId,
      ownerEmail: dto.ownerEmail,
      ownerName: dto.ownerName,
      passwordHash,
      mustChangePassword: true,
      autoVerifyEmail: true,
      planKey: dto.planKey,
    });

    return { tenantId, ownerEmail: dto.ownerEmail, tempPassword };
  }
}
