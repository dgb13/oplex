import { BadRequestException, Injectable } from '@nestjs/common';
import { getTenantDb, getUserId } from '@plexo/database';

/**
 * "{prefix}-{n padded to 6}" per user - same pattern as
 * @plexo/purchases' PurchaseNumberingService, using
 * User.quotePrefix/quoteNextNumber instead. A separate series on purpose
 * (decision with the user, 2026-08-03), not shared with
 * quoteRequestPrefix even though both come from "cotización" in Spanish -
 * they're unrelated documents (see the schema comment on model Quote).
 * Assigned via an atomic `{ increment: 1 }`, race-free for the same reason
 * PurchaseNumberingService is.
 *
 * The counter is per user but Quote.number is unique per tenant, and every
 * user starts on the same default prefix ("PRE") - so a second user's first
 * quote would be PRE-000001 again and fail with P2002. When the number is
 * already taken the user's counter jumps past the highest one in use with
 * that prefix: users sharing a prefix end up sharing one series, users with
 * their own prefix keep their own.
 */
@Injectable()
export class QuoteNumberingService {
  async nextNumber(): Promise<string> {
    const userId = getUserId();
    if (!userId) {
      throw new BadRequestException('An authenticated user is required to number a quote');
    }

    const db = getTenantDb();
    for (;;) {
      const updated = await db.user.update({
        where: { id: userId },
        data: { quoteNextNumber: { increment: 1 } },
        select: { quoteNextNumber: true, quotePrefix: true },
      });
      const number = formatQuoteNumber(updated.quotePrefix, updated.quoteNextNumber - 1);
      const taken = await db.quote.findFirst({ where: { number }, select: { id: true } });
      if (!taken) return number;

      const highest = await highestQuoteNumber(updated.quotePrefix);
      if (highest >= updated.quoteNextNumber) {
        await db.user.update({ where: { id: userId }, data: { quoteNextNumber: highest + 1 } });
      }
    }
  }
}

export function formatQuoteNumber(prefix: string, number: number): string {
  return `${prefix}-${String(number).padStart(6, '0')}`;
}

/** Highest n among this tenant's quotes numbered "{prefix}-n", 0 if none. */
export async function highestQuoteNumber(prefix: string): Promise<number> {
  const rows = await getTenantDb().quote.findMany({
    where: { number: { startsWith: `${prefix}-` } },
    select: { number: true },
  });
  return rows.reduce((max, row) => {
    const n = Number(row.number.slice(prefix.length + 1));
    return Number.isInteger(n) && n > max ? n : max;
  }, 0);
}
