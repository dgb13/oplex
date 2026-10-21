import { BadRequestException, Injectable } from '@nestjs/common';
import { getTenantDb, getUserId, takeDocumentNumber, type DocumentSeries } from '@plexo/database';

/**
 * "{prefix}-{n padded to 6}" per user - same pattern as
 * @plexo/purchases' PurchaseNumberingService, using
 * User.quotePrefix/quoteNextNumber instead. A separate series on purpose
 * (decision with the user, 2026-08-03), not shared with
 * quoteRequestPrefix even though both come from "cotización" in Spanish -
 * they're unrelated documents (see the schema comment on model Quote).
 * Assigned via an atomic `{ increment: 1 }`, race-free for the same reason
 * PurchaseNumberingService is; skips numbers another user with the same
 * prefix already took (see takeDocumentNumber).
 */
@Injectable()
export class QuoteNumberingService {
  async nextNumber(): Promise<string> {
    const userId = getUserId();
    if (!userId) {
      throw new BadRequestException('An authenticated user is required to number a quote');
    }

    const db = getTenantDb();
    return takeDocumentNumber({
      increment: async () => {
        const updated = await db.user.update({
          where: { id: userId },
          data: { quoteNextNumber: { increment: 1 } },
          select: { quoteNextNumber: true, quotePrefix: true },
        });
        return { prefix: updated.quotePrefix, next: updated.quoteNextNumber };
      },
      setNext: async (next) => {
        await db.user.update({ where: { id: userId }, data: { quoteNextNumber: next } });
      },
      ...quoteNumbers(),
    });
  }
}

/** Lookups over this tenant's Quote.number, shared with the preferences
 * preview. */
export function quoteNumbers(): Pick<DocumentSeries, 'exists' | 'numbersWithPrefix'> {
  const db = getTenantDb();
  return {
    exists: async (number) => !!(await db.quote.findFirst({ where: { number }, select: { id: true } })),
    numbersWithPrefix: async (prefix) =>
      (
        await db.quote.findMany({ where: { number: { startsWith: `${prefix}-` } }, select: { number: true } })
      ).map((row) => row.number),
  };
}
