import { ForbiddenException, Injectable } from '@nestjs/common';
import { InventoryService } from '@plexo/inventory';
import { CashSessionsService, type DailyPosition } from '@plexo/pos';
import { ReceivablesService, type CustomerAging } from '@plexo/receivables';
import { ReportsSalesService } from '@plexo/reports-sales';
import type { AuthenticatedUser } from '@plexo/types';

const RECEIVABLES_READ_ROLES = ['OWNER', 'ADMIN', 'ACCOUNTANT', 'SALES'] as const;
const POS_READ_ROLES = ['OWNER', 'ADMIN', 'SALES'] as const;
const REPORTS_SALES_MODULE = 'reports-sales';

export interface VentasPorArticuloParams {
  desde?: string;
  hasta?: string;
  limite?: number;
}

/** Mismas dos reglas que ModuleAccessGuard (libs/shared/auth) pero como
 * función plana en vez de un CanActivate atado a ExecutionContext - acá no
 * hay una ruta HTTP por herramienta, el orquestador del asistente (Fase 1)
 * llama a estos métodos directo. No se reusa el guard en sí porque está
 * acoplado a leer metadata de Reflector sobre un handler de Nest. */
function assertModuleAccess(user: AuthenticatedUser, module: string, toolName: string): void {
  if (user.role === 'OWNER' || user.role === 'ADMIN') {
    return;
  }
  const grant = user.moduleAccess.find((m) => m.module === module);
  if (!grant?.canRead) {
    throw new ForbiddenException(`No hay acceso de lectura al módulo "${module}" (herramienta "${toolName}")`);
  }
}

/** Equivalente de RolesGuard, misma razón que la función de arriba. */
function assertRole(user: AuthenticatedUser, allowedRoles: readonly string[], toolName: string): void {
  if (!allowedRoles.includes(user.role)) {
    throw new ForbiddenException(`El rol "${user.role}" no puede usar la herramienta "${toolName}"`);
  }
}

/**
 * Catálogo de herramientas del asistente de IA - Fase 0
 * (docs/plan-asistente-ia-conversacional.md, sección 5). Cada método:
 * 1) valida el permiso de `user` con el MISMO criterio que ya usa el
 *    controller HTTP del módulo que envuelve (nunca confía en que el
 *    catálogo ofrecido al modelo ya viene filtrado - defensa en profundidad,
 *    ver sección 3.2 del plan);
 * 2) delega en el Service de negocio ya existente, sin reimplementar
 *    lógica de reportes/agregación;
 * 3) NUNCA recibe tenantId como parámetro - corre dentro de la request ya
 *    tenant-scoped por TenantContextInterceptor, igual que cualquier otro
 *    controller autenticado (ver sección 3.1 del plan).
 *
 * Todavía sin Claude en el medio a propósito (Fase 1) - estos métodos se
 * prueban y se llaman directo, para separar "¿la herramienta está bien?" de
 * "¿el modelo la usa bien?".
 */
@Injectable()
export class AssistantToolsService {
  constructor(
    private readonly reportsSalesService: ReportsSalesService,
    private readonly receivablesService: ReceivablesService,
    private readonly cashSessionsService: CashSessionsService,
    private readonly inventoryService: InventoryService,
  ) {}

  async ventasPorArticulo(user: AuthenticatedUser, params: VentasPorArticuloParams = {}) {
    assertModuleAccess(user, REPORTS_SALES_MODULE, 'ventas_por_articulo');
    const rows = await this.reportsSalesService.getSalesByProduct(
      params.desde ? new Date(params.desde) : undefined,
      params.hasta ? new Date(params.hasta) : undefined,
    );
    return params.limite ? rows.slice(0, params.limite) : rows;
  }

  async deudaPorCliente(user: AuthenticatedUser): Promise<CustomerAging[]> {
    assertRole(user, RECEIVABLES_READ_ROLES, 'deuda_por_cliente');
    return this.receivablesService.getAgingReport();
  }

  async saldoCaja(user: AuthenticatedUser): Promise<DailyPosition> {
    assertRole(user, POS_READ_ROLES, 'saldo_caja');
    return this.cashSessionsService.getDailyPosition();
  }

  // Sin assertRole/assertModuleAccess a propósito: GET /inventory/articles
  // (el endpoint real que envuelve) no tiene ningún @Roles - cualquier rol
  // autenticado puede consultar el listado de artículos (lo usa, por
  // ejemplo, SALES vía ArticlePicker al facturar). Mismo criterio de
  // "reflejar el permiso real", no inventar uno más estricto acá.
  async stockArticulo(_user: AuthenticatedUser, nombreOSku: string) {
    const articles = await this.inventoryService.listArticles({ search: nombreOSku });
    return articles.map((article) => ({
      nombre: article.name,
      variantes: article.variants.map((v) => ({
        sku: v.sku,
        color: v.color,
        talle: v.size,
        precio: v.unitPrice,
        stockTotal: v.totalStock,
        stockMinimo: v.minimumStock,
      })),
    }));
  }
}
