import { BadRequestException, Injectable } from '@nestjs/common';
import { getTenantDb, getUserId, takeDocumentNumber, type DocumentSeries } from '@plexo/database';

export type PurchaseDocumentKind = 'quoteRequest' | 'purchaseOrder';

/**
 * "{prefix}-{n padded to 6}" per user, per document kind - a deliberately
 * separate series per user (decision with the user, 2026-07-27), not one
 * shared tenant-wide series like Invoice.number. Assigned via an atomic
 * `{ increment: 1 }` on the user's own row (a single UPDATE statement),
 * which is race-free unlike nextInvoiceNumber's count()+1 approach in
 * invoicing.service.ts - see that method's docstring for the tradeoff this
 * improves on. Numbers another user with the same prefix already took are
 * skipped (see takeDocumentNumber).
 */
@Injectable()
export class PurchaseNumberingService {
  async nextNumber(kind: PurchaseDocumentKind): Promise<string> {
    const userId = getUserId();
    if (!userId) {
      throw new BadRequestException('An authenticated user is required to number a purchases document');
    }

    const db = getTenantDb();
    switch (kind) {
      case 'quoteRequest':
        return takeDocumentNumber({
          increment: async () => {
            const updated = await db.user.update({
              where: { id: userId },
              data: { quoteRequestNextNumber: { increment: 1 } },
              select: { quoteRequestNextNumber: true, quoteRequestPrefix: true },
            });
            return { prefix: updated.quoteRequestPrefix, next: updated.quoteRequestNextNumber };
          },
          setNext: async (next) => {
            await db.user.update({ where: { id: userId }, data: { quoteRequestNextNumber: next } });
          },
          ...purchaseDocumentNumbers('quoteRequest'),
        });
      case 'purchaseOrder':
        return takeDocumentNumber({
          increment: async () => {
            const updated = await db.user.update({
              where: { id: userId },
              data: { purchaseOrderNextNumber: { increment: 1 } },
              select: { purchaseOrderNextNumber: true, purchaseOrderPrefix: true },
            });
            return { prefix: updated.purchaseOrderPrefix, next: updated.purchaseOrderNextNumber };
          },
          setNext: async (next) => {
            await db.user.update({ where: { id: userId }, data: { purchaseOrderNextNumber: next } });
          },
          ...purchaseDocumentNumbers('purchaseOrder'),
        });
    }
  }
}

/** Lookups over this tenant's QuoteRequest.number / PurchaseOrder.number,
 * shared with the preferences preview. */
export function purchaseDocumentNumbers(
  kind: PurchaseDocumentKind,
): Pick<DocumentSeries, 'exists' | 'numbersWithPrefix'> {
  const db = getTenantDb();
  switch (kind) {
    case 'quoteRequest':
      return {
        exists: async (number) =>
          !!(await db.quoteRequest.findFirst({ where: { number }, select: { id: true } })),
        numbersWithPrefix: async (prefix) =>
          (
            await db.quoteRequest.findMany({
              where: { number: { startsWith: `${prefix}-` } },
              select: { number: true },
            })
          ).map((row) => row.number),
      };
    case 'purchaseOrder':
      return {
        exists: async (number) =>
          !!(await db.purchaseOrder.findFirst({ where: { number }, select: { id: true } })),
        numbersWithPrefix: async (prefix) =>
          (
            await db.purchaseOrder.findMany({
              where: { number: { startsWith: `${prefix}-` } },
              select: { number: true },
            })
          ).map((row) => row.number),
      };
  }
}
