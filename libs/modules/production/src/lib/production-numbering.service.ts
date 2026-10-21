import { BadRequestException, Injectable } from '@nestjs/common';
import { getTenantDb, getUserId, takeDocumentNumber, type DocumentSeries } from '@plexo/database';

/**
 * "{prefix}-{n padded to 6}" per user - same pattern and same reasoning
 * as PurchaseNumberingService (a deliberately separate series per user,
 * assigned via an atomic `{ increment: 1 }`, race-free, skipping numbers
 * another user with the same prefix already took). See
 * User.productionOrderPrefix/productionOrderNextNumber.
 */
@Injectable()
export class ProductionNumberingService {
  async nextNumber(): Promise<string> {
    const userId = getUserId();
    if (!userId) {
      throw new BadRequestException('An authenticated user is required to number a production order');
    }
    const db = getTenantDb();
    return takeDocumentNumber({
      increment: async () => {
        const updated = await db.user.update({
          where: { id: userId },
          data: { productionOrderNextNumber: { increment: 1 } },
          select: { productionOrderNextNumber: true, productionOrderPrefix: true },
        });
        return { prefix: updated.productionOrderPrefix, next: updated.productionOrderNextNumber };
      },
      setNext: async (next) => {
        await db.user.update({ where: { id: userId }, data: { productionOrderNextNumber: next } });
      },
      ...productionOrderNumbers(),
    });
  }
}

/** Lookups over this tenant's ProductionOrder.number, shared with the
 * preferences preview. */
export function productionOrderNumbers(): Pick<DocumentSeries, 'exists' | 'numbersWithPrefix'> {
  const db = getTenantDb();
  return {
    exists: async (number) =>
      !!(await db.productionOrder.findFirst({ where: { number }, select: { id: true } })),
    numbersWithPrefix: async (prefix) =>
      (
        await db.productionOrder.findMany({
          where: { number: { startsWith: `${prefix}-` } },
          select: { number: true },
        })
      ).map((row) => row.number),
  };
}
