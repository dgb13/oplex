import { Injectable } from '@nestjs/common';
import { getTenantDb, PrismaService, withTenantContext } from '@plexo/database';
import { SubscriptionService } from '@plexo/subscriptions';

export interface ProvisionTenantInput {
  tenantId: string;
  name: string;
  taxId?: string;
  ownerEmail: string;
  ownerName?: string;
  passwordHash: string;
  mustChangePassword: boolean;
  // false para el signup público (queda pendiente de /auth/verify-email);
  // true para toda alta que ya viene vetada por otro camino (SuperAdmin
  // backoffice, o un login OAuth donde el proveedor ya probó el email).
  autoVerifyEmail: boolean;
  planKey: string;
}

export interface ProvisionedTenant {
  tenantId: string;
  userId: string;
}

/**
 * Extraído del cuerpo de AdminTenantsService.createTenant() (era el único
 * camino para dar de alta un tenant hasta ahora) para que el signup público
 * (SignupService) y el alta vía OAuth sin cuenta previa (OAuthService)
 * reusen exactamente la misma lógica de creación de Tenant+User+trial, en
 * vez de reimplementarla. AdminTenantsService sigue siendo dueño de generar
 * el tenantId/tempPassword random para SU caso de uso (alta manual del
 * operador de plataforma) - eso no es parte de "provisionar", es específico
 * de quién llama.
 *
 * Igual que el código que reemplaza: inyecta PrismaService crudo, nunca
 * getTenantDb() a secas, porque el tenant recién generado no existe todavía
 * cuando arranca este método - withTenantContext abre la transacción/RLS
 * para ESE tenantId antes de poder insertar nada.
 */
@Injectable()
export class TenantProvisioningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptionService: SubscriptionService,
  ) {}

  async provision(input: ProvisionTenantInput): Promise<ProvisionedTenant> {
    let userId = '';

    await withTenantContext(this.prisma, input.tenantId, async () => {
      const db = getTenantDb();
      await db.tenant.create({ data: { id: input.tenantId, name: input.name, taxId: input.taxId } });
      // Toda alta necesita una moneda base desde el día uno - Cotizaciones/
      // Facturación/etc. la exigen (currencyId no-nullable) y, antes de esto,
      // ningún tenant nuevo terminaba con una configurada porque nada la
      // creaba automáticamente (ver el backfill en la migración
      // currency_base_backfill para los tenants viejos). ARS a secas porque
      // el producto entero asume Argentina (AFIP, CUIT, IIBB) - no hay
      // noción de tenant multi-país todavía.
      await db.currency.create({
        data: { tenantId: input.tenantId, code: 'ARS', name: 'Peso argentino', isBase: true },
      });
      const user = await db.user.create({
        data: {
          tenantId: input.tenantId,
          email: input.ownerEmail,
          name: input.ownerName,
          passwordHash: input.passwordHash,
          role: 'OWNER',
          mustChangePassword: input.mustChangePassword,
          emailVerifiedAt: input.autoVerifyEmail ? new Date() : null,
        },
      });
      userId = user.id;
      // Corre DENTRO de este callback a propósito: acá getTenantId() ya
      // resuelve al tenant recién creado (contexto anidado) - mismo
      // comentario que ya tenía AdminTenantsService.createTenant().
      await this.subscriptionService.startTrial(input.planKey);
    });

    return { tenantId: input.tenantId, userId };
  }
}
