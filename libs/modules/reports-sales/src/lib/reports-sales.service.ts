import { Injectable } from '@nestjs/common';
import { getTenantDb, Prisma } from '@plexo/database';

export interface CustomerSales {
  customerId: string;
  customerName: string;
  invoiceCount: number;
  totalSales: Prisma.Decimal;
}

export interface ProductSales {
  articleVariantId: string;
  sku: string;
  articleName: string;
  quantitySold: Prisma.Decimal;
  revenue: Prisma.Decimal;
}

export interface MonthlyRevenue {
  month: string; // 'YYYY-MM', UTC
  invoiceCount: number;
  subtotal: Prisma.Decimal;
  taxTotal: Prisma.Decimal;
  total: Prisma.Decimal;
}

export interface SellerSales {
  userId: string;
  userName: string;
  avatarUrl: string | null;
  invoiceCount: number;
  totalSales: Prisma.Decimal;
}

function defaultRange(from?: Date, to?: Date): { from: Date; to: Date } {
  const rangeTo = to ?? new Date();
  // A "to" of just a calendar day (the common case from a date-picker,
  // e.g. "2026-07-21") parses to that day's UTC midnight - without this,
  // every invoice issued later that same day would silently fall outside
  // an "up to today" range.
  rangeTo.setUTCHours(23, 59, 59, 999);
  const rangeFrom = from ?? new Date(Date.UTC(rangeTo.getUTCFullYear(), rangeTo.getUTCMonth(), 1));
  return { from: rangeFrom, to: rangeTo };
}

// Distinto de defaultRange: una tendencia mensual necesita varios meses de
// ventana, no "lo que va del mes actual" (eso dejaría un gráfico de
// tendencia con un solo punto sin fechas explícitas).
function defaultTrendRange(from?: Date, to?: Date): { from: Date; to: Date } {
  const rangeTo = to ?? new Date();
  rangeTo.setUTCHours(23, 59, 59, 999);
  const rangeFrom = from ?? new Date(Date.UTC(rangeTo.getUTCFullYear(), rangeTo.getUTCMonth() - 5, 1));
  return { from: rangeFrom, to: rangeTo };
}

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// Todos los meses del rango, incluidos los que no tuvieron actividad - un
// gráfico de tendencia con huecos salteados en vez de puntos en cero es
// engañoso (el eje X dejaría de ser uniforme).
function monthsBetween(from: Date, to: Date): string[] {
  const months: string[] = [];
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1));
  while (cursor <= end) {
    months.push(monthKey(cursor));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return months;
}

@Injectable()
export class ReportsSalesService {
  async getSalesByCustomer(from?: Date, to?: Date): Promise<CustomerSales[]> {
    const range = defaultRange(from, to);
    const db = getTenantDb();

    const grouped = await db.invoice.groupBy({
      by: ['customerId'],
      where: { issueDate: { gte: range.from, lte: range.to }, status: { not: 'CANCELLED' } },
      _sum: { total: true },
      _count: true,
    });

    // Netted against credit notes issued in the same range (not against the
    // range of their original invoice) - same period a full return zeroes
    // out the balance, `Invoice.status` flips to PAID (see
    // InvoicingService.createCreditNote), so without this a fully-returned
    // sale still reads as revenue here while the accounting-backed
    // Resultados report (which reverses the journal entry on the credit
    // note's own date) correctly nets it to zero.
    const creditNotes = await db.creditNote.findMany({
      where: { issueDate: { gte: range.from, lte: range.to } },
      select: { total: true, invoice: { select: { customerId: true } } },
    });
    const creditedByCustomer = new Map<string, Prisma.Decimal>();
    for (const creditNote of creditNotes) {
      const customerId = creditNote.invoice.customerId;
      creditedByCustomer.set(
        customerId,
        (creditedByCustomer.get(customerId) ?? new Prisma.Decimal(0)).add(creditNote.total),
      );
    }

    const customerIds = new Set([...grouped.map((g) => g.customerId), ...creditedByCustomer.keys()]);
    if (customerIds.size === 0) {
      return [];
    }

    const customers = await db.company.findMany({ where: { id: { in: [...customerIds] } } });
    const customerById = new Map(customers.map((c) => [c.id, c]));
    const groupedByCustomer = new Map(grouped.map((g) => [g.customerId, g]));

    return [...customerIds]
      .map((customerId) => {
        const g = groupedByCustomer.get(customerId);
        const credited = creditedByCustomer.get(customerId) ?? new Prisma.Decimal(0);
        return {
          customerId,
          customerName: customerById.get(customerId)?.name ?? 'Unknown',
          invoiceCount: g?._count ?? 0,
          totalSales: (g?._sum.total ?? new Prisma.Decimal(0)).sub(credited),
        };
      })
      .sort((a, b) => b.totalSales.cmp(a.totalSales));
  }

  async getSalesByProduct(from?: Date, to?: Date): Promise<ProductSales[]> {
    const range = defaultRange(from, to);
    const db = getTenantDb();

    const grouped = await db.invoiceLine.groupBy({
      by: ['articleVariantId'],
      where: {
        invoice: { issueDate: { gte: range.from, lte: range.to }, status: { not: 'CANCELLED' } },
      },
      _sum: { quantity: true, lineTotal: true },
    });

    // Same netting as getSalesByCustomer, at line granularity - grouped by
    // the credited InvoiceLine's articleVariantId, since CreditNoteLine
    // itself doesn't carry one. Small per-tenant/per-period dataset, same
    // in-memory aggregation trade-off the rest of this report already makes.
    const creditNoteLines = await db.creditNoteLine.findMany({
      where: { creditNote: { issueDate: { gte: range.from, lte: range.to } } },
      select: { quantity: true, lineTotal: true, invoiceLine: { select: { articleVariantId: true } } },
    });
    const creditedByVariant = new Map<string, { quantity: Prisma.Decimal; lineTotal: Prisma.Decimal }>();
    for (const line of creditNoteLines) {
      const variantId = line.invoiceLine.articleVariantId;
      const existing = creditedByVariant.get(variantId) ?? {
        quantity: new Prisma.Decimal(0),
        lineTotal: new Prisma.Decimal(0),
      };
      creditedByVariant.set(variantId, {
        quantity: existing.quantity.add(line.quantity),
        lineTotal: existing.lineTotal.add(line.lineTotal),
      });
    }

    const variantIds = new Set([...grouped.map((g) => g.articleVariantId), ...creditedByVariant.keys()]);
    if (variantIds.size === 0) {
      return [];
    }

    const variants = await db.articleVariant.findMany({
      where: { id: { in: [...variantIds] } },
      include: { article: true },
    });
    const variantById = new Map(variants.map((v) => [v.id, v]));
    const groupedByVariant = new Map(grouped.map((g) => [g.articleVariantId, g]));

    return [...variantIds]
      .map((articleVariantId) => {
        const variant = variantById.get(articleVariantId);
        const g = groupedByVariant.get(articleVariantId);
        const credited = creditedByVariant.get(articleVariantId);
        return {
          articleVariantId,
          sku: variant?.sku ?? 'Unknown',
          articleName: variant?.article.name ?? 'Unknown',
          quantitySold: (g?._sum.quantity ?? new Prisma.Decimal(0)).sub(credited?.quantity ?? 0),
          revenue: (g?._sum.lineTotal ?? new Prisma.Decimal(0)).sub(credited?.lineTotal ?? 0),
        };
      })
      .sort((a, b) => b.revenue.cmp(a.revenue));
  }

  async getRevenueByMonth(from?: Date, to?: Date): Promise<MonthlyRevenue[]> {
    const range = defaultTrendRange(from, to);
    const db = getTenantDb();

    const invoices = await db.invoice.findMany({
      where: { issueDate: { gte: range.from, lte: range.to }, status: { not: 'CANCELLED' } },
      select: { issueDate: true, subtotal: true, taxTotal: true, total: true },
    });
    // Netted into the month the credit note itself was issued, not the
    // original invoice's month - same convention as getSalesByCustomer.
    const creditNotes = await db.creditNote.findMany({
      where: { issueDate: { gte: range.from, lte: range.to } },
      select: { issueDate: true, subtotal: true, taxTotal: true, total: true },
    });

    const zeroBucket = () => ({
      count: 0,
      subtotal: new Prisma.Decimal(0),
      taxTotal: new Prisma.Decimal(0),
      total: new Prisma.Decimal(0),
    });
    const byMonth = new Map<string, ReturnType<typeof zeroBucket>>();
    for (const month of monthsBetween(range.from, range.to)) {
      byMonth.set(month, zeroBucket());
    }
    for (const invoice of invoices) {
      const bucket = byMonth.get(monthKey(invoice.issueDate)) ?? zeroBucket();
      bucket.count += 1;
      bucket.subtotal = bucket.subtotal.add(invoice.subtotal);
      bucket.taxTotal = bucket.taxTotal.add(invoice.taxTotal);
      bucket.total = bucket.total.add(invoice.total);
      byMonth.set(monthKey(invoice.issueDate), bucket);
    }
    for (const creditNote of creditNotes) {
      const bucket = byMonth.get(monthKey(creditNote.issueDate)) ?? zeroBucket();
      bucket.subtotal = bucket.subtotal.sub(creditNote.subtotal);
      bucket.taxTotal = bucket.taxTotal.sub(creditNote.taxTotal);
      bucket.total = bucket.total.sub(creditNote.total);
      byMonth.set(monthKey(creditNote.issueDate), bucket);
    }

    return [...byMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, b]) => ({
        month,
        invoiceCount: b.count,
        subtotal: b.subtotal,
        taxTotal: b.taxTotal,
        total: b.total,
      }));
  }

  async getSalesBySeller(from?: Date, to?: Date): Promise<SellerSales[]> {
    const range = defaultRange(from, to);
    const db = getTenantDb();

    const grouped = await db.invoice.groupBy({
      by: ['issuedByUserId'],
      where: { issueDate: { gte: range.from, lte: range.to }, status: { not: 'CANCELLED' } },
      _sum: { total: true },
      _count: true,
    });

    // Netted against the ORIGINAL invoice's seller, not whoever happened to
    // issue the credit note (often a different person, e.g. a manager
    // processing the return) - same convention as getSalesByCustomer.
    const creditNotes = await db.creditNote.findMany({
      where: { issueDate: { gte: range.from, lte: range.to } },
      select: { total: true, invoice: { select: { issuedByUserId: true } } },
    });
    const creditedBySeller = new Map<string, Prisma.Decimal>();
    for (const creditNote of creditNotes) {
      const sellerId = creditNote.invoice.issuedByUserId;
      creditedBySeller.set(
        sellerId,
        (creditedBySeller.get(sellerId) ?? new Prisma.Decimal(0)).add(creditNote.total),
      );
    }

    const sellerIds = new Set([...grouped.map((g) => g.issuedByUserId), ...creditedBySeller.keys()]);
    if (sellerIds.size === 0) {
      return [];
    }

    const users = await db.user.findMany({ where: { id: { in: [...sellerIds] } } });
    const userById = new Map(users.map((u) => [u.id, u]));
    const groupedBySeller = new Map(grouped.map((g) => [g.issuedByUserId, g]));

    return [...sellerIds]
      .map((userId) => {
        const g = groupedBySeller.get(userId);
        const credited = creditedBySeller.get(userId) ?? new Prisma.Decimal(0);
        const user = userById.get(userId);
        return {
          userId,
          userName: user?.name ?? user?.email ?? 'Usuario',
          avatarUrl: user?.avatarUrl ?? null,
          invoiceCount: g?._count ?? 0,
          totalSales: (g?._sum.total ?? new Prisma.Decimal(0)).sub(credited),
        };
      })
      .sort((a, b) => b.totalSales.cmp(a.totalSales));
  }
}
