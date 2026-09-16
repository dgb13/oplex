import { Injectable } from '@nestjs/common';
import { getTenantDb, Prisma } from '@plexo/database';

export interface SupplierPurchases {
  supplierId: string;
  supplierName: string;
  orderCount: number;
  totalPurchased: Prisma.Decimal;
}

export interface BuyerPurchases {
  userId: string;
  userName: string;
  avatarUrl: string | null;
  orderCount: number;
  totalPurchased: Prisma.Decimal;
}

// Mismo criterio que ReportsSalesService.defaultRange (libs/modules/reports-sales) -
// "lo que va del mes" cuando no se pide un rango explícito.
function defaultRange(from?: Date, to?: Date): { from: Date; to: Date } {
  const rangeTo = to ?? new Date();
  rangeTo.setUTCHours(23, 59, 59, 999);
  const rangeFrom = from ?? new Date(Date.UTC(rangeTo.getUTCFullYear(), rangeTo.getUTCMonth(), 1));
  return { from: rangeFrom, to: rangeTo };
}

// Basado en PurchaseOrder (no en PurchaseInvoice): "Compradores" es
// específicamente sobre quién genera las órdenes de compra, y esta consulta
// hermana usa la misma fuente para no mezclar "comprometido en OC" con
// "efectivamente facturado por el proveedor" en la misma pantalla.
@Injectable()
export class ReportsPurchasesService {
  async getPurchasesBySupplier(from?: Date, to?: Date): Promise<SupplierPurchases[]> {
    const range = defaultRange(from, to);
    const db = getTenantDb();

    const grouped = await db.purchaseOrder.groupBy({
      by: ['supplierId'],
      where: { createdAt: { gte: range.from, lte: range.to }, status: { not: 'CANCELLED' } },
      _sum: { total: true },
      _count: true,
    });
    if (grouped.length === 0) {
      return [];
    }

    const suppliers = await db.company.findMany({ where: { id: { in: grouped.map((g) => g.supplierId) } } });
    const supplierById = new Map(suppliers.map((s) => [s.id, s]));

    return grouped
      .map((g) => ({
        supplierId: g.supplierId,
        supplierName: supplierById.get(g.supplierId)?.name ?? 'Unknown',
        orderCount: g._count,
        totalPurchased: g._sum.total ?? new Prisma.Decimal(0),
      }))
      .sort((a, b) => b.totalPurchased.cmp(a.totalPurchased));
  }

  async getPurchasesByBuyer(from?: Date, to?: Date): Promise<BuyerPurchases[]> {
    const range = defaultRange(from, to);
    const db = getTenantDb();

    const grouped = await db.purchaseOrder.groupBy({
      by: ['createdByUserId'],
      where: { createdAt: { gte: range.from, lte: range.to }, status: { not: 'CANCELLED' } },
      _sum: { total: true },
      _count: true,
    });
    if (grouped.length === 0) {
      return [];
    }

    const users = await db.user.findMany({ where: { id: { in: grouped.map((g) => g.createdByUserId) } } });
    const userById = new Map(users.map((u) => [u.id, u]));

    return grouped
      .map((g) => {
        const user = userById.get(g.createdByUserId);
        return {
          userId: g.createdByUserId,
          userName: user?.name ?? user?.email ?? 'Usuario',
          avatarUrl: user?.avatarUrl ?? null,
          orderCount: g._count,
          totalPurchased: g._sum.total ?? new Prisma.Decimal(0),
        };
      })
      .sort((a, b) => b.totalPurchased.cmp(a.totalPurchased));
  }
}
