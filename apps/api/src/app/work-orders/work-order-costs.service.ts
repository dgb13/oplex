import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { getTenantDb, getTenantId, Prisma } from '@plexo/database';

const D = (v: Prisma.Decimal | number | string) => new Prisma.Decimal(v);
const money = (v: Prisma.Decimal) => v.toDecimalPlaces(2).toNumber();

export interface WorkOrderCosts {
  /** Ingreso sin IVA: lo facturado o, si todavía no, lo presupuestado. */
  income: { amount: number; source: 'invoice' | 'quote' } | null;
  /** Costo de los repuestos que salieron del stock. */
  parts: { amount: number; source: 'invoice' | 'estimate'; missingCost: number } | null;
  purchases: { id: string; supplier: string; number: string; date: Date; amount: number }[];
  purchasesTotal: number;
  labor: {
    id: string;
    workerName: string;
    hours: number;
    costPerHour: number | null;
    note: string | null;
    workedAt: Date;
  }[];
  laborHours: number;
  laborCost: number;
  /** Cargas de horas sin costo por hora: el margen las cuenta en 0. */
  laborWithoutCost: number;
  totalCost: number;
  margin: number | null;
  marginPercent: number | null;
}

/**
 * Costo y margen de cada orden de trabajo (etapa 5 del plan de rubros).
 * No guarda nada calculado: lo arma cada vez desde la factura (o la
 * cotización), los movimientos de stock, las compras vinculadas y las horas.
 */
@Injectable()
export class WorkOrderCostsService {
  async costs(orderId: string): Promise<WorkOrderCosts> {
    const db = getTenantDb();
    const order = await db.workOrder.findUnique({
      where: { tenantId_id: { tenantId: getTenantId(), id: orderId } },
      include: {
        labor: { orderBy: { workedAt: 'asc' } },
        purchaseInvoices: { include: { supplier: { select: { name: true } } }, orderBy: { supplierInvoiceDate: 'asc' } },
      },
    });
    if (!order) throw new NotFoundException('Orden no encontrada');

    // La factura puede no estar vinculada todavía (se toma de la cotización).
    const invoiceId =
      order.invoiceId ??
      (order.quoteId ? (await db.invoice.findFirst({ where: { quoteId: order.quoteId }, select: { id: true } }))?.id : undefined);

    let income: WorkOrderCosts['income'] = null;
    let parts: WorkOrderCosts['parts'] = null;
    if (invoiceId) {
      const invoice = await db.invoice.findUnique({ where: { id: invoiceId }, select: { subtotal: true } });
      if (invoice) income = { amount: money(invoice.subtotal), source: 'invoice' };
      // Costo real: el promedio ponderado que se consumió al facturar.
      const movements = await db.stockMovement.findMany({
        where: { invoiceId, type: { in: ['SALE_OUT', 'RETURN'] } },
        select: { type: true, quantity: true, unitCost: true },
      });
      let amount = D(0);
      let missingCost = 0;
      for (const m of movements) {
        if (m.unitCost == null) {
          missingCost++;
          continue;
        }
        const value = D(m.quantity).abs().mul(m.unitCost);
        // Una nota de crédito devuelve repuestos al stock: resta del costo.
        amount = m.type === 'RETURN' ? amount.sub(value) : amount.add(value);
      }
      if (movements.length > 0) parts = { amount: money(amount), source: 'invoice', missingCost };
    } else if (order.quoteId) {
      const quote = await db.quote.findUnique({
        where: { id: order.quoteId },
        include: { lines: { include: { articleVariant: { include: { article: { select: { isService: true } } } } } } },
      });
      if (quote) {
        income = { amount: money(quote.lines.reduce((sum, l) => sum.add(l.netAmount ?? 0), D(0))), source: 'quote' };
        // Estimado: costo promedio actual de cada repuesto (los servicios no
        // tienen costo de stock: su costo son las horas).
        let amount = D(0);
        let missingCost = 0;
        let counted = 0;
        for (const line of quote.lines) {
          if (line.articleVariant.article.isService) continue;
          counted++;
          const ledgers = await db.stockLedger.findMany({
            where: { articleVariantId: line.articleVariantId, avgUnitCost: { not: null } },
            select: { quantity: true, avgUnitCost: true },
          });
          const qty = ledgers.reduce((s, l) => s.add(D(l.quantity).gt(0) ? l.quantity : 0), D(0));
          const avg = qty.gt(0)
            ? ledgers.reduce((s, l) => s.add(D(l.quantity).gt(0) ? D(l.quantity).mul(l.avgUnitCost ?? 0) : 0), D(0)).div(qty)
            : ledgers[0]?.avgUnitCost
              ? D(ledgers[0].avgUnitCost)
              : null;
          if (!avg) {
            missingCost++;
            continue;
          }
          amount = amount.add(avg.mul(line.quantity));
        }
        if (counted > 0) parts = { amount: money(amount), source: 'estimate', missingCost };
      }
    }

    const purchases = order.purchaseInvoices.map((p) => ({
      id: p.id,
      supplier: p.supplier.name,
      number: p.supplierInvoiceNumber,
      date: p.supplierInvoiceDate,
      amount: money(p.subtotal),
    }));
    const purchasesTotal = purchases.reduce((s, p) => s.add(p.amount), D(0));

    let laborHours = D(0);
    let laborCost = D(0);
    let laborWithoutCost = 0;
    const labor = order.labor.map((l) => {
      laborHours = laborHours.add(l.hours);
      if (l.costPerHour == null) laborWithoutCost++;
      else laborCost = laborCost.add(D(l.hours).mul(l.costPerHour));
      return {
        id: l.id,
        workerName: l.workerName,
        hours: D(l.hours).toNumber(),
        costPerHour: l.costPerHour == null ? null : D(l.costPerHour).toNumber(),
        note: l.note,
        workedAt: l.workedAt,
      };
    });

    const totalCost = D(parts?.amount ?? 0).add(purchasesTotal).add(laborCost);
    const margin = income ? D(income.amount).sub(totalCost) : null;
    return {
      income,
      parts,
      purchases,
      purchasesTotal: money(purchasesTotal),
      labor,
      laborHours: laborHours.toNumber(),
      laborCost: money(laborCost),
      laborWithoutCost,
      totalCost: money(totalCost),
      margin: margin ? money(margin) : null,
      marginPercent: margin && income && income.amount > 0 ? margin.div(income.amount).mul(100).toDecimalPlaces(1).toNumber() : null,
    };
  }

  async addLabor(orderId: string, input: { workerName: string; userId?: string; hours: number; costPerHour?: number; note?: string; workedAt?: string }) {
    const db = getTenantDb();
    const tenantId = getTenantId();
    const order = await db.workOrder.findUnique({ where: { tenantId_id: { tenantId, id: orderId } }, select: { id: true } });
    if (!order) throw new NotFoundException('Orden no encontrada');
    await db.workOrderLabor.create({
      data: {
        tenantId,
        workOrderId: orderId,
        workerName: input.workerName.trim(),
        userId: input.userId,
        hours: input.hours,
        costPerHour: input.costPerHour ?? null,
        note: input.note?.trim() || null,
        ...(input.workedAt ? { workedAt: new Date(input.workedAt) } : {}),
      },
    });
    return this.costs(orderId);
  }

  async deleteLabor(orderId: string, laborId: string) {
    const db = getTenantDb();
    const entry = await db.workOrderLabor.findFirst({ where: { id: laborId, workOrderId: orderId } });
    if (!entry) throw new NotFoundException('Carga de horas no encontrada');
    await db.workOrderLabor.delete({ where: { id: laborId } });
    return this.costs(orderId);
  }

  /** Último costo por hora cargado para cada persona, para precompletar. */
  async lastRates(): Promise<Record<string, number>> {
    const rows = await getTenantDb().workOrderLabor.findMany({
      where: { costPerHour: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: { workerName: true, costPerHour: true },
      take: 200,
    });
    const rates: Record<string, number> = {};
    for (const r of rows) if (!(r.workerName in rates) && r.costPerHour != null) rates[r.workerName] = D(r.costPerHour).toNumber();
    return rates;
  }

  /** Facturas de compra recientes, para vincular a una orden. */
  async searchPurchases(q?: string) {
    const search = q?.trim();
    const rows = await getTenantDb().purchaseInvoice.findMany({
      where: search
        ? {
            OR: [
              { supplierInvoiceNumber: { contains: search, mode: 'insensitive' } },
              { supplier: { name: { contains: search, mode: 'insensitive' } } },
              { notes: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {},
      include: { supplier: { select: { name: true } } },
      orderBy: { supplierInvoiceDate: 'desc' },
      take: 30,
    });
    return rows.map((p) => ({
      id: p.id,
      supplier: p.supplier.name,
      number: p.supplierInvoiceNumber,
      date: p.supplierInvoiceDate,
      amount: money(p.subtotal),
      workOrderId: p.workOrderId,
      notes: p.notes,
    }));
  }

  async linkPurchase(orderId: string, purchaseInvoiceId: string, link: boolean) {
    const db = getTenantDb();
    const tenantId = getTenantId();
    const order = await db.workOrder.findUnique({ where: { tenantId_id: { tenantId, id: orderId } }, select: { id: true } });
    if (!order) throw new NotFoundException('Orden no encontrada');
    const purchase = await db.purchaseInvoice.findUnique({ where: { tenantId_id: { tenantId, id: purchaseInvoiceId } } });
    if (!purchase) throw new NotFoundException('Factura de compra no encontrada');
    if (link && purchase.workOrderId && purchase.workOrderId !== orderId) {
      throw new BadRequestException('Esa compra ya está cargada en otra orden');
    }
    await db.purchaseInvoice.update({
      where: { tenantId_id: { tenantId, id: purchaseInvoiceId } },
      data: { workOrderId: link ? orderId : null },
    });
    return this.costs(orderId);
  }

  /** Reporte "Margen por trabajo": órdenes del período con su margen. */
  async marginReport(from?: string, to?: string) {
    const db = getTenantDb();
    const orders = await db.workOrder.findMany({
      where: {
        createdAt: {
          ...(from ? { gte: new Date(from) } : {}),
          ...(to ? { lt: new Date(new Date(to).getTime() + 86_400_000) } : {}),
        },
      },
      include: { customer: { select: { name: true } }, asset: { select: { identifier: true } }, status: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    const rows = [];
    for (const o of orders) {
      const c = await this.costs(o.id);
      rows.push({
        id: o.id,
        number: o.number,
        createdAt: o.createdAt,
        customer: o.customer.name,
        asset: o.asset?.identifier ?? null,
        status: o.status.name,
        closed: Boolean(o.closedAt),
        income: c.income?.amount ?? null,
        incomeSource: c.income?.source ?? null,
        totalCost: c.totalCost,
        laborHours: c.laborHours,
        margin: c.margin,
        marginPercent: c.marginPercent,
      });
    }
    return rows;
  }
}
