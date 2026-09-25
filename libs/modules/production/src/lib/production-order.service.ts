import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  getTenantDb,
  getTenantId,
  getUserId,
  Prisma,
  type ProductionConsumption,
  type ProductionOrder,
  type ProductionOutput,
  type StockReservation,
} from '@plexo/database';
import type { CalendarEntry } from '@plexo/types';
import { BomService, type BomDetail } from './bom.service.js';
import { ProductionNumberingService } from './production-numbering.service.js';
import { ProductionPlanningService } from './production-planning.service.js';
import type { CreateProductionOrderDto } from './dto/create-production-order.dto.js';

// Quién generó la orden - varios usuarios trabajan sobre el mismo panel de
// Producción, cada orden muestra su autor (avatar + nombre). Mismo select
// que createdBy en Compras/Cotizaciones, más avatarUrl para el avatar.
const CREATED_BY_SELECT = { select: { id: true, name: true, email: true, avatarUrl: true } } as const;

/**
 * Ciclo de vida de la orden de producción (ver
 * docs/OPLEX-Produccion-Plan-Tecnico-14-9.md, Fase 4.5) - escribe sus
 * propias tablas (`ProductionOrder`, `StockReservation`,
 * `ProductionConsumption`, `ProductionOutput`), nunca `StockLedger`/
 * `StockMovement` directamente: ese es el único trabajo de
 * `InventoryService.recordMovement` (regla de "single point of writing"
 * del repo). Por eso `completeOrder` en sí (decidir CUÁNTO se consume de
 * cada insumo y llamar a `recordMovement`) vive en `apps/api`
 * (composición, `ProductionService.completeOrder`) - un lib module no
 * puede inyectar el Service de otro módulo - y sólo le pide a este
 * service que persista el resultado (`recordConsumption`/`recordOutput`/
 * `finishOrder`) una vez que ya sabe qué pasó.
 */
@Injectable()
export class ProductionOrderService {
  constructor(
    private readonly bomService: BomService,
    private readonly planningService: ProductionPlanningService,
    private readonly numbering: ProductionNumberingService,
  ) {}

  /** Congela bomId/bomVersion contra la receta activa AHORA - si la
   * receta cambia después, esta orden sigue produciendo con la versión
   * que tenía al crearse (mismo criterio "congelado" que unitCost en
   * StockMovement). Numera contra la serie propia del usuario que la crea
   * (ver ProductionNumberingService) - createdByUserId queda null sólo en
   * las órdenes de antes de que este campo existiera. */
  async create(dto: CreateProductionOrderDto): Promise<ProductionOrder> {
    const db = getTenantDb();
    const bom = await this.bomService.getActiveBomOrThrow(dto.outputArticleVariantId);
    const number = await this.numbering.nextNumber();

    return db.productionOrder.create({
      data: {
        tenantId: getTenantId(),
        number,
        createdByUserId: getUserId(),
        outputArticleVariantId: dto.outputArticleVariantId,
        bomId: bom.id,
        bomVersion: bom.version,
        quantity: dto.quantity,
        status: 'DRAFT',
        scheduledStartAt: dto.scheduledStartAt ? new Date(dto.scheduledStartAt) : null,
      },
    });
  }

  /** Reprogramar la fecha de inicio - sólo mientras la orden no arrancó
   * (DRAFT/PLANNED). No toca las reservas: se reserva al confirmar, no en
   * la fecha programada. */
  async schedule(orderId: string, scheduledStartAt: string | null | undefined): Promise<ProductionOrder> {
    const db = getTenantDb();
    const order = await db.productionOrder.findUnique({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('Orden de producción no encontrada');
    }
    if (order.status !== 'DRAFT' && order.status !== 'PLANNED') {
      throw new BadRequestException('Sólo se puede reprogramar una orden que todavía no empezó');
    }
    return db.productionOrder.update({
      where: { id: order.id },
      data: { scheduledStartAt: scheduledStartAt ? new Date(scheduledStartAt) : null },
    });
  }

  /** PLANNED → IN_PROGRESS: registra el inicio REAL (startedAt), que es lo
   * que después permite medir cuánto tardó la fabricación en sí (inicio →
   * fin) aparte de la espera previa (creada → inicio). Se puede iniciar
   * aunque falten insumos - completar sigue exigiendo que no falte nada. */
  async start(orderId: string): Promise<ProductionOrder> {
    const db = getTenantDb();
    await db.$queryRaw`SELECT id FROM production_orders WHERE id = ${orderId} FOR UPDATE`;
    const order = await db.productionOrder.findUnique({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('Orden de producción no encontrada');
    }
    if (order.status !== 'PLANNED') {
      throw new BadRequestException('Sólo se puede iniciar una orden planificada');
    }
    return db.productionOrder.update({
      where: { id: order.id },
      data: { status: 'IN_PROGRESS', startedAt: new Date() },
    });
  }

  /**
   * DRAFT → PLANNED: reserva lo que haya disponible de cada insumo de la
   * receta, para `warehouseId`. Si algo no alcanza, reserva lo que sí hay
   * y deja `isShortOnMaterials=true` - la decisión de "avanzar igual con
   * faltante" es del caller (UI), confirm() no vuelve a preguntar, sólo
   * ejecuta y reporta el resultado.
   */
  async confirm(orderId: string, warehouseId: string): Promise<ProductionOrder> {
    const db = getTenantDb();

    // Lock de la orden primero: dos confirmaciones concurrentes de la
    // misma orden no deben poder reservar dos veces.
    await db.$queryRaw`SELECT id FROM production_orders WHERE id = ${orderId} FOR UPDATE`;
    const order = await db.productionOrder.findUnique({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('Orden de producción no encontrada');
    }
    if (order.status !== 'DRAFT') {
      throw new BadRequestException('Sólo se puede confirmar una orden en borrador');
    }
    if (!order.bomId) {
      throw new BadRequestException('Esta orden no tiene una receta (BOM) contra la cual reservar');
    }

    const bom = await this.bomService.getById(order.bomId);
    const isShortOnMaterials = await this.reserveAgainstBom(order, bom, warehouseId, []);

    return db.productionOrder.update({
      where: { id: order.id },
      data: { status: 'PLANNED', isShortOnMaterials },
    });
  }

  /**
   * PLANNED + isShortOnMaterials → PLANNED: vuelve a intentar reservar
   * SÓLO lo que todavía falta de cada insumo (nunca toca lo ya
   * reservado) - para cuando llegó stock después de confirm() y la
   * orden quedó "esperando insumos" en cola, sin un endpoint para
   * retomarla hasta ahora (reportado por el usuario probando OP-000007:
   * Azúcar tenía 0 disponible al confirmar, 12 disponibles ahora, y no
   * había forma de que la orden se enterara sin cancelar y recrearla).
   * Mismo `warehouseId` que ya tenían las reservas existentes - todas
   * las reservas de una orden comparten depósito (ver
   * ProductionService.completeOrder, que asume esto).
   */
  async retryReservation(orderId: string, warehouseId: string): Promise<ProductionOrder> {
    const db = getTenantDb();

    await db.$queryRaw`SELECT id FROM production_orders WHERE id = ${orderId} FOR UPDATE`;
    const order = await db.productionOrder.findUnique({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('Orden de producción no encontrada');
    }
    if ((order.status !== 'PLANNED' && order.status !== 'IN_PROGRESS') || !order.isShortOnMaterials) {
      throw new BadRequestException(
        'Sólo se puede reintentar la reserva de una orden planificada o en curso con insumos faltantes',
      );
    }
    if (!order.bomId) {
      throw new BadRequestException('Esta orden no tiene una receta (BOM) contra la cual reservar');
    }

    const existingReservations = await db.stockReservation.findMany({
      where: { productionOrderId: orderId, status: 'ACTIVE' },
    });
    const existingWarehouseId = existingReservations[0]?.warehouseId;
    if (existingWarehouseId && existingWarehouseId !== warehouseId) {
      throw new BadRequestException(
        'Esta orden ya tiene insumos reservados en otro depósito - usá ese mismo depósito para completar la reserva',
      );
    }

    const bom = await this.bomService.getById(order.bomId);
    const isShortOnMaterials = await this.reserveAgainstBom(order, bom, warehouseId, existingReservations);

    return db.productionOrder.update({
      where: { id: order.id },
      data: { isShortOnMaterials },
    });
  }

  /** Núcleo compartido de confirm()/retryReservation(): por cada línea de
   * la receta, calcula cuánto falta todavía (requerido menos lo que ya
   * está en `alreadyReserved` para ese insumo) y reserva lo que haya
   * disponible de esa diferencia - nunca crea una reserva por más de lo
   * que realmente falta, así retryReservation nunca duplica lo que
   * confirm() ya reservó. Devuelve si, después de esto, algo sigue
   * faltando. */
  private async reserveAgainstBom(
    order: ProductionOrder,
    bom: BomDetail,
    warehouseId: string,
    alreadyReserved: StockReservation[],
  ): Promise<boolean> {
    const db = getTenantDb();
    const tenantId = getTenantId();
    let isShortOnMaterials = false;

    // Lo ya reservado es un pozo POR INSUMO que se va descontando línea a
    // línea - no se le resta entero a cada línea. Una receta puede usar el
    // mismo insumo en varias líneas (la Mesa de trabajo tiene el tubo
    // rectangular en 4 tramos distintos); restando el total reservado del
    // insumo contra cada línea por separado, retryReservation daba por
    // cubiertas líneas que no lo estaban y dejaba la orden sin faltante con
    // menos reservado de lo que pide la receta (bug real: 3 de 4 huevos
    // reservados y isShortOnMaterials=false). En confirm() el pozo arranca
    // en 0, así que ahí no cambia nada.
    const pool = new Map<string, Prisma.Decimal>();
    for (const r of alreadyReserved) {
      pool.set(r.inputArticleVariantId, (pool.get(r.inputArticleVariantId) ?? new Prisma.Decimal(0)).add(r.quantityReserved));
    }

    for (const line of bom.lines) {
      const requerido = line.quantity
        .mul(order.quantity)
        .mul(new Prisma.Decimal(1).add(line.expectedWastePercent.div(100)));
      const yaReservado = Prisma.Decimal.min(pool.get(line.inputArticleVariantId) ?? new Prisma.Decimal(0), requerido);
      pool.set(line.inputArticleVariantId, (pool.get(line.inputArticleVariantId) ?? new Prisma.Decimal(0)).sub(yaReservado));
      const faltante = requerido.sub(yaReservado);
      if (faltante.lte(0)) {
        continue;
      }

      // Mismo lock de StockLedger que ya toma
      // InventoryService.recordMovement antes de calcular "disponible" -
      // contrato de concurrencia documentado en el modelo StockReservation.
      // No-op si la fila todavía no existe (insumo sin stock cargado
      // nunca en ese depósito - "disponible" da 0 igual).
      await db.$queryRaw`
        SELECT id FROM stock_ledger
        WHERE "warehouseId" = ${warehouseId} AND "articleVariantId" = ${line.inputArticleVariantId}
        FOR UPDATE
      `;

      const disponible = await this.planningService.getDisponible({
        articleVariantId: line.inputArticleVariantId,
        warehouseId,
      });

      const reservable = Prisma.Decimal.min(Prisma.Decimal.max(disponible, 0), faltante);
      if (reservable.lt(faltante)) {
        isShortOnMaterials = true;
      }
      if (reservable.gt(0)) {
        await db.stockReservation.create({
          data: {
            tenantId,
            productionOrderId: order.id,
            inputArticleVariantId: line.inputArticleVariantId,
            warehouseId,
            quantityReserved: reservable,
            status: 'ACTIVE',
          },
        });
      }
    }

    // 1D: los mm pueden alcanzar y aun así no haber una pieza donde entre
    // entero algún corte (1600 mm en recortes de 800 para un corte de
    // 1200) - la orden queda "esperando insumos" desde ya, en vez de
    // confirmarse y fallar recién al completarla.
    const unfittable = await this.planningService.findUnfittableCuts(bom.lines, order.quantity, warehouseId);
    if (unfittable.length > 0) {
      isShortOnMaterials = true;
    }

    return isShortOnMaterials;
  }

  /**
   * → CANCELLED: las reservas ACTIVE pasan a RELEASED. Como una reserva
   * nunca tocó StockLedger.quantity (sólo resta del "disponible"
   * calculado al vuelo), liberar es sólo un update de status - no hay
   * ningún movimiento de stock que revertir.
   */
  async cancel(orderId: string): Promise<ProductionOrder> {
    const db = getTenantDb();

    await db.$queryRaw`SELECT id FROM production_orders WHERE id = ${orderId} FOR UPDATE`;
    const order = await db.productionOrder.findUnique({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('Orden de producción no encontrada');
    }
    if (order.status === 'DONE' || order.status === 'CANCELLED') {
      throw new BadRequestException('No se puede cancelar una orden que ya fue completada o cancelada');
    }

    await db.stockReservation.updateMany({
      where: { productionOrderId: order.id, status: 'ACTIVE' },
      data: { status: 'RELEASED' },
    });

    return db.productionOrder.update({
      where: { id: order.id },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });
  }

  /** Reservas ACTIVE de una orden - lo que ProductionService.completeOrder
   * (apps/api) tiene que consumir de verdad para completarla. */
  getActiveReservations(orderId: string) {
    return getTenantDb().stockReservation.findMany({
      where: { productionOrderId: orderId, status: 'ACTIVE' },
    });
  }

  /**
   * Primer paso de completar una orden (ver
   * ProductionService.completeOrder, apps/api): lockea la orden y valida
   * que se pueda completar - PLANNED o IN_PROGRESS y sin faltante. Una
   * orden `isShortOnMaterials` se queda "en cola" hasta que se confirme de
   * nuevo con el faltante ya cubierto (no hay completar parcial en v1).
   * Completar sin haber pasado por "Iniciar" sigue permitido (startedAt
   * queda null: el Historial muestra la fabricación como desconocida).
   */
  async assertCompletable(orderId: string): Promise<ProductionOrder> {
    const db = getTenantDb();
    await db.$queryRaw`SELECT id FROM production_orders WHERE id = ${orderId} FOR UPDATE`;
    const order = await db.productionOrder.findUnique({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('Orden de producción no encontrada');
    }
    if (order.status !== 'PLANNED' && order.status !== 'IN_PROGRESS') {
      throw new BadRequestException('Sólo se puede completar una orden planificada o en curso');
    }
    if (order.isShortOnMaterials) {
      throw new BadRequestException(
        'A esta orden todavía le faltan insumos - volvé a confirmarla cuando haya stock suficiente',
      );
    }
    return order;
  }

  /** Un insumo efectivamente consumido: registra el `ProductionConsumption`
   * y pasa esa reserva puntual a CONSUMED (nunca ACTIVE dos veces sobre la
   * misma reserva). */
  async recordConsumption(input: {
    productionOrderId: string;
    reservationId: string;
    inputArticleVariantId: string;
    quantityConsumed: Prisma.Decimal;
    stockPieceId?: string;
    offcutPieceId?: string;
    wasteAmount?: Prisma.Decimal;
    cost: Prisma.Decimal;
  }): Promise<ProductionConsumption> {
    const db = getTenantDb();
    const consumption = await db.productionConsumption.create({
      data: {
        tenantId: getTenantId(),
        productionOrderId: input.productionOrderId,
        inputArticleVariantId: input.inputArticleVariantId,
        quantityConsumed: input.quantityConsumed,
        stockPieceId: input.stockPieceId,
        offcutPieceId: input.offcutPieceId,
        wasteAmount: input.wasteAmount ?? new Prisma.Decimal(0),
        cost: input.cost,
      },
    });
    await db.stockReservation.update({
      where: { id: input.reservationId },
      data: { status: 'CONSUMED' },
    });
    return consumption;
  }

  /** Pasa a CONSUMED reservas que no tuvieron un recordConsumption propio -
   * en 1D los cortes se planifican por insumo (no por reserva), así que
   * las reservas de un insumo usado en varias líneas de la receta se
   * cierran todas juntas acá. */
  async markReservationsConsumed(reservationIds: string[]): Promise<void> {
    if (reservationIds.length === 0) return;
    await getTenantDb().stockReservation.updateMany({
      where: { id: { in: reservationIds } },
      data: { status: 'CONSUMED' },
    });
  }

  /** Un producto generado (principal o subproducto declarado en la BOM). */
  recordOutput(input: {
    productionOrderId: string;
    articleVariantId: string;
    isPrimary: boolean;
    quantityProduced: Prisma.Decimal;
    cost: Prisma.Decimal;
  }): Promise<ProductionOutput> {
    return getTenantDb().productionOutput.create({
      data: {
        tenantId: getTenantId(),
        productionOrderId: input.productionOrderId,
        articleVariantId: input.articleVariantId,
        isPrimary: input.isPrimary,
        quantityProduced: input.quantityProduced,
        cost: input.cost,
      },
    });
  }

  finishOrder(orderId: string): Promise<ProductionOrder> {
    return getTenantDb().productionOrder.update({
      where: { id: orderId },
      data: { status: 'DONE', finishedAt: new Date() },
    });
  }

  // Con relations - a diferencia del resto de los métodos de este service
  // (que sólo necesitan los campos propios de ProductionOrder), el detalle
  // de una orden (pantalla "Nueva orden / detalle", Fase 6) necesita ver
  // qué se reservó/consumió/produjo realmente, no sólo el estado. Lectura
  // pura, no requiere ningún Service de otro módulo. `bom.lines` viaja
  // acá (no sólo bomId) para que el frontend pueda calcular cuánto falta
  // de cada insumo (requerido de la receta CONGELADA vs. lo reservado) sin
  // un segundo request - la receta activa hoy puede ya ser otra versión.
  async getById(orderId: string) {
    const order = await getTenantDb().productionOrder.findUnique({
      where: { id: orderId },
      include: {
        reservations: true,
        consumptions: true,
        outputs: true,
        bom: { include: { lines: true } },
        createdBy: CREATED_BY_SELECT,
      },
    });
    if (!order) {
      throw new NotFoundException('Orden de producción no encontrada');
    }
    // Cortes 1D que hoy no entran en ninguna pieza - sólo para una orden
    // planificada (ya tiene depósito, por sus reservas) y todavía sin
    // completar. Es lo que explica un "Esperando insumos" con todos los mm
    // reservados.
    const warehouseId = order.reservations.find((r) => r.status === 'ACTIVE')?.warehouseId;
    const unfittableCuts =
      (order.status === 'PLANNED' || order.status === 'IN_PROGRESS') && warehouseId && order.bom
        ? await this.planningService.findUnfittableCuts(order.bom.lines, order.quantity, warehouseId)
        : [];
    return { ...order, unfittableCuts };
  }

  list(status?: ProductionOrder['status']) {
    return getTenantDb().productionOrder.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      include: { createdBy: CREATED_BY_SELECT },
    });
  }

  /** Órdenes completadas, para Producción → Historial (agrupadas por
   * producto en el frontend). `outputs` trae el costo real de lo
   * producido y `reservations` el depósito que usó (para que "Repetir"
   * proponga el mismo). */
  async listHistory() {
    const db = getTenantDb();
    const orders = await db.productionOrder.findMany({
      where: { status: 'DONE' },
      orderBy: { finishedAt: 'desc' },
      include: {
        createdBy: CREATED_BY_SELECT,
        outputs: true,
        reservations: { select: { warehouseId: true }, take: 1 },
      },
    });
    // Versión de receta vigente HOY por producto - el Historial marca
    // "v1 (hoy v2)" cuando la orden se hizo con una receta que ya cambió.
    const activeBoms = await db.billOfMaterials.findMany({
      where: { isActive: true, outputArticleVariantId: { in: [...new Set(orders.map((o) => o.outputArticleVariantId))] } },
      select: { outputArticleVariantId: true, version: true },
    });
    const activeVersion = new Map(activeBoms.map((b) => [b.outputArticleVariantId, b.version]));
    return orders.map((o) => ({ ...o, activeBomVersion: activeVersion.get(o.outputArticleVariantId) ?? null }));
  }

  /** Función pura de la Agenda (Fase 2, ver docs/plan-agenda.md). Proyecta
   * el inicio programado (scheduledStartAt) de las órdenes que todavía no
   * arrancaron, y las fechas reales (startedAt/finishedAt) de las demás -
   * nunca una estimación inventada. Una orden con varias fechas dentro del
   * rango aporta una entry por fecha, con ids distintos para no colisionar
   * en el merge. */
  async getCalendarEntries(from: Date, to: Date): Promise<CalendarEntry[]> {
    const orders = await getTenantDb().productionOrder.findMany({
      where: {
        status: { not: 'CANCELLED' },
        OR: [
          { startedAt: { gte: from, lte: to } },
          { finishedAt: { gte: from, lte: to } },
          { status: { in: ['DRAFT', 'PLANNED'] }, scheduledStartAt: { gte: from, lte: to } },
        ],
      },
      include: { outputArticleVariant: { include: { article: true } } },
    });

    const entries: CalendarEntry[] = [];
    for (const order of orders) {
      const articleName = order.outputArticleVariant.article.name;
      if (
        (order.status === 'DRAFT' || order.status === 'PLANNED') &&
        order.scheduledStartAt &&
        order.scheduledStartAt >= from &&
        order.scheduledStartAt <= to
      ) {
        entries.push({
          id: `${order.id}-scheduled`,
          source: 'prod',
          title: articleName,
          date: order.scheduledStartAt.toISOString(),
          amount: null,
          flow: null,
          ref: `Inicio programado (${order.number})`,
          editable: false,
          link: { module: 'production-order', id: order.id },
        });
      }
      if (order.startedAt && order.startedAt >= from && order.startedAt <= to) {
        entries.push({
          id: `${order.id}-start`,
          source: 'prod',
          title: articleName,
          date: order.startedAt.toISOString(),
          amount: null,
          flow: null,
          ref: 'Inicio de producción',
          editable: false,
          link: { module: 'production-order', id: order.id },
        });
      }
      if (order.finishedAt && order.finishedAt >= from && order.finishedAt <= to) {
        entries.push({
          id: `${order.id}-finish`,
          source: 'prod',
          title: articleName,
          date: order.finishedAt.toISOString(),
          amount: null,
          flow: null,
          ref: 'Entrega de producción',
          editable: false,
          link: { module: 'production-order', id: order.id },
        });
      }
    }
    return entries;
  }
}
