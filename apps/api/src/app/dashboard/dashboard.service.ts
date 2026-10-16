import { Injectable } from '@nestjs/common';
import { getTenantDb, Prisma } from '@plexo/database';
import { InventoryService } from '@plexo/inventory';

export interface StockItem {
  articleVariantId: string;
  sku: string;
  articleName: string;
  quantity: number;
}

export interface WarehouseStock {
  warehouseId: string;
  warehouseName: string;
  items: StockItem[];
  totalItems: number;
}

export interface RecentInvoice {
  id: string;
  customerName: string;
  total: number;
  balanceDue: number;
  status: string;
  issueDate: string;
  documentLetter: string;
  number: string;
}

export interface TodaySummary {
  invoiceCount: number;
  total: number;
  paidCount: number;
}

export interface LowStockAlert {
  warehouseName: string;
  sku: string;
  articleName: string;
  currentQuantity: number;
  minimumQuantity: number;
}

export interface SalesDay {
  date: string;
  total: number;
  count: number;
}

export interface DashboardSnapshot {
  stockByWarehouse: WarehouseStock[];
  recentInvoices: RecentInvoice[];
  todaySummary: TodaySummary;
  lowStockAlerts: LowStockAlert[];
  salesLast7Days: SalesDay[];
}

type WithCreditNotes = { total: Prisma.Decimal; creditNotes: { total: Prisma.Decimal }[] };

function creditedTotal(inv: WithCreditNotes): number {
  return inv.creditNotes.reduce((s, cn) => s + cn.total.toNumber(), 0);
}

function netTotal(inv: WithCreditNotes): number {
  return inv.total.toNumber() - creditedTotal(inv);
}

/** Mismo criterio que invoiceDisplayStatus en la web: "Anulada" cuando las
 * notas de crédito cubren el total. */
function isFullyCredited(inv: WithCreditNotes): boolean {
  return inv.total.toNumber() > 0 && creditedTotal(inv) >= inv.total.toNumber();
}

// "Hoy" y los días del gráfico van en hora argentina (UTC-3, sin horario de
// verano), no en la del servidor: el contenedor corre en UTC y una factura
// de las 22 hs caía en el día siguiente.
const AR_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Fecha argentina (AAAA-MM-DD) de un instante. */
function arDayKey(date: Date): string {
  return new Date(date.getTime() - AR_OFFSET_MS).toISOString().slice(0, 10);
}

@Injectable()
export class DashboardService {
  constructor(private readonly inventoryService: InventoryService) {}

  async getSnapshot(): Promise<DashboardSnapshot> {
    const db = getTenantDb();
    const todayStart = new Date(Date.parse(`${arDayKey(new Date())}T00:00:00Z`) + AR_OFFSET_MS);
    const sevenDaysAgo = new Date(todayStart.getTime() - 6 * DAY_MS);

    const [warehouses, recentInvoices, todayInvoices, last7Invoices, reorderSuggestions] =
      await Promise.all([
        db.warehouse.findMany({
          include: {
            stockLedger: {
              include: { articleVariant: { include: { article: true } } },
            },
          },
          orderBy: { name: 'asc' },
        }),
        db.invoice.findMany({
          take: 10,
          orderBy: { issueDate: 'desc' },
          select: {
            id: true,
            customerName: true,
            total: true,
            balanceDue: true,
            status: true,
            issueDate: true,
            documentLetter: true,
            number: true,
            creditNotes: { select: { total: true } },
          },
        }),
        db.invoice.findMany({
          where: { issueDate: { gte: todayStart }, status: { not: 'CANCELLED' } },
          select: { total: true, status: true, creditNotes: { select: { total: true } } },
        }),
        db.invoice.findMany({
          where: { issueDate: { gte: sevenDaysAgo }, status: { not: 'CANCELLED' } },
          select: { issueDate: true, total: true, creditNotes: { select: { total: true } } },
        }),
        this.inventoryService.listReorderSuggestions(),
      ]);

    // Stock by warehouse
    const stockByWarehouse: WarehouseStock[] = warehouses.map((wh) => {
      const items: StockItem[] = wh.stockLedger.map((sl) => ({
        articleVariantId: sl.articleVariantId,
        sku: sl.articleVariant.sku,
        articleName: sl.articleVariant.article.name,
        quantity: sl.quantity.toNumber(),
      }));
      return {
        warehouseId: wh.id,
        warehouseName: wh.name,
        items,
        totalItems: items.reduce((s, i) => s + i.quantity, 0),
      };
    });

    // Low stock alerts - misma comparación MinimumStock vs StockLedger que
    // usa la pantalla de Alertas de Inventario, resuelta una sola vez en
    // InventoryService.listReorderSuggestions() (antes reimplementada acá
    // en paralelo e independiente, ver PROGRESS.md).
    const lowStockAlerts: LowStockAlert[] = reorderSuggestions.map((s) => ({
      warehouseName: s.warehouseName,
      sku: s.sku,
      articleName: s.articleName,
      currentQuantity: s.currentQuantity,
      minimumQuantity: s.minimumQuantity,
    }));

    // Today summary - neto de notas de crédito, como el Resumen de
    // Facturación: una factura anulada por NC queda en PAID a propósito (ver
    // InvoicingService.createCreditNote), así que no es venta ni cobro.
    const todayActive = todayInvoices.filter((inv) => !isFullyCredited(inv));
    const todaySummary: TodaySummary = {
      invoiceCount: todayActive.length,
      total: todayActive.reduce((s, inv) => s + netTotal(inv), 0),
      paidCount: todayActive.filter((inv) => inv.status === 'PAID').length,
    };

    // Sales last 7 days — group by date string (fecha argentina)
    const salesMap = new Map<string, { total: number; count: number }>();
    for (let i = 0; i < 7; i++) {
      salesMap.set(arDayKey(new Date(sevenDaysAgo.getTime() + i * DAY_MS)), { total: 0, count: 0 });
    }
    for (const inv of last7Invoices) {
      const key = arDayKey(inv.issueDate);
      const existing = salesMap.get(key);
      if (existing && !isFullyCredited(inv)) {
        existing.total += netTotal(inv);
        existing.count += 1;
      }
    }
    const salesLast7Days: SalesDay[] = Array.from(salesMap.entries()).map(([date, val]) => ({
      date,
      ...val,
    }));

    return {
      stockByWarehouse,
      recentInvoices: recentInvoices.map((inv) => ({
        id: inv.id,
        customerName: inv.customerName,
        total: inv.total.toNumber(),
        balanceDue: inv.balanceDue.toNumber(),
        status: isFullyCredited(inv) ? 'CREDITED' : inv.status,
        issueDate: inv.issueDate.toISOString(),
        documentLetter: inv.documentLetter,
        number: inv.number,
      })),
      todaySummary,
      lowStockAlerts,
      salesLast7Days,
    };
  }
}
