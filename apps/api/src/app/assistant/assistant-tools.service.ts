import { ForbiddenException, Injectable } from '@nestjs/common';
import { getTenantDb } from '@plexo/database';
import { InventoryService } from '@plexo/inventory';
import { PayablesService } from '@plexo/payables';
import { CashSessionsService, type DailyPosition } from '@plexo/pos';
import { PurchaseOrderService } from '@plexo/purchases';
import { ReceivablesService, type CustomerAging } from '@plexo/receivables';
import { ReportsSalesService } from '@plexo/reports-sales';
import type { AuthenticatedUser } from '@plexo/types';

export const RECEIVABLES_READ_ROLES = ['OWNER', 'ADMIN', 'ACCOUNTANT', 'SALES'] as const;
export const POS_READ_ROLES = ['OWNER', 'ADMIN', 'SALES'] as const;
// Mismo READ_ROLES que PayablesController (GET /payables/aging).
export const PAYABLES_READ_ROLES = ['OWNER', 'ADMIN', 'ACCOUNTANT', 'INVENTORY', 'PURCHASES'] as const;
const REPORTS_SALES_MODULE = 'reports-sales';

// Tope de artículos por consulta de costos: cada uno es una ficha completa
// (stock por depósito + último costo) - una búsqueda muy amplia ("a") no
// debería traer el inventario entero.
const COST_LOOKUP_LIMIT = 5;
const SUPPLIER_DEBT_LIMIT = 15;

/** Hasta dónde puede ver la persona dentro de lo que el tema le permite -
 * hoy sólo "Ventas ve sólo sus propias ventas y clientes"
 * (AssistantAccessService). */
export interface AssistantDataScope {
  // Sólo facturas emitidas por este usuario. undefined = toda la empresa.
  onlyIssuedBy?: string;
}

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
 * (docs/planesdemodulos/plan-asistente-ia-conversacional.md, sección 5). Cada método:
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
    private readonly payablesService: PayablesService,
    private readonly purchaseOrderService: PurchaseOrderService,
  ) {}

  async ventasPorArticulo(user: AuthenticatedUser, params: VentasPorArticuloParams = {}, scope: AssistantDataScope = {}) {
    assertModuleAccess(user, REPORTS_SALES_MODULE, 'ventas_por_articulo');
    const rows = await this.reportsSalesService.getSalesByProduct(
      params.desde ? new Date(params.desde) : undefined,
      params.hasta ? new Date(params.hasta) : undefined,
      scope.onlyIssuedBy,
    );
    return params.limite ? rows.slice(0, params.limite) : rows;
  }

  async deudaPorCliente(user: AuthenticatedUser, scope: AssistantDataScope = {}): Promise<CustomerAging[]> {
    assertRole(user, RECEIVABLES_READ_ROLES, 'deuda_por_cliente');
    return this.receivablesService.getAgingReport(new Date(), scope.onlyIssuedBy);
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

  // Sin assertRole a propósito, mismo criterio que stockArticulo: la ficha
  // del artículo (GET /inventory/articles/:id/sheet, que es de donde sale el
  // costo en la pantalla de Inventario) no tiene @Roles. Quién lo puede
  // preguntar por el asistente lo decide el tema "Costos y márgenes".
  //
  // La remarca se calcula igual que en Inventario (precio = costo × (1 +
  // remarca)): costo y precio están en la misma base. Se usa el último
  // costo de compra, el mismo que muestra "Costo actual" en el historial de
  // precios; el promedio ponderado va aparte, sin mezclarlos.
  async costoArticulo(_user: AuthenticatedUser, nombreOSku: string) {
    const articles = (await this.inventoryService.listArticles({ search: nombreOSku })).slice(0, COST_LOOKUP_LIMIT);
    return Promise.all(
      articles.map(async (article) => {
        const sheet = await this.inventoryService.getArticleSheet(article.id);
        return {
          nombre: article.name,
          variantes: sheet.variants.map((v) => {
            const ultimoCosto = v.lastCost?.amount ?? null;
            return {
              sku: v.sku,
              variante: v.label,
              precioVenta: v.unitPrice,
              ultimoCosto,
              fechaUltimoCosto: v.lastCost?.at ?? null,
              costoPromedioPonderado: v.avgUnitCost,
              gananciaPorUnidad: ultimoCosto !== null ? round2(v.unitPrice - ultimoCosto) : null,
              remarcaSobreCostoPorcentaje:
                ultimoCosto !== null && ultimoCosto > 0 ? round2((v.unitPrice / ultimoCosto - 1) * 100) : null,
            };
          }),
        };
      }),
    );
  }

  async comprasResumen(user: AuthenticatedUser) {
    assertRole(user, PAYABLES_READ_ROLES, 'compras_resumen');
    const [aging, sentOrders] = await Promise.all([
      this.payablesService.getAgingReport(),
      this.purchaseOrderService.list('SENT'),
    ]);
    // El listado de órdenes no trae el nombre del artículo de cada línea (sólo
    // articleVariantId) - una sola consulta para todas, en vez de pedir el
    // detalle completo de cada orden.
    const pendingVariantIds = [
      ...new Set(sentOrders.flatMap((o) => o.lines.filter((l) => l.pendingQuantity.gt(0)).map((l) => l.articleVariantId))),
    ];
    const variants = pendingVariantIds.length
      ? await getTenantDb().articleVariant.findMany({
          where: { id: { in: pendingVariantIds } },
          select: { id: true, sku: true, article: { select: { name: true } } },
        })
      : [];
    const variantById = new Map(variants.map((v) => [v.id, v]));
    const pendingOrders = sentOrders
      .map((order) => ({
        numero: order.number,
        proveedor: order.supplier.name,
        moneda: order.currency.code,
        total: order.total,
        lineasPendientes: order.lines
          .filter((line) => line.pendingQuantity.gt(0))
          .map((line) => {
            const variant = variantById.get(line.articleVariantId);
            return { articulo: variant?.article.name ?? null, sku: variant?.sku ?? null, cantidadPendiente: line.pendingQuantity };
          }),
      }))
      .filter((order) => order.lineasPendientes.length > 0);
    return {
      deudaConProveedores: aging.slice(0, SUPPLIER_DEBT_LIMIT),
      proveedoresConDeuda: aging.length,
      ordenesDeCompraPendientesDeRecibir: pendingOrders,
    };
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
