/**
 * Shared logic for the per-user "{prefix}-{n padded to 6}" series
 * (Cotizaciones, Compras, Producción). The counter lives on the user's row
 * but the document number is unique per tenant, and every user starts on
 * the same default prefix ("PRE", "PED", "OC", "OP") - so a second user's
 * first document would repeat 000001 and fail with P2002. When the number is
 * already taken the user's counter jumps past the highest one in use with
 * that prefix: users sharing a prefix end up sharing one series, users with
 * their own prefix keep their own.
 */
export interface DocumentSeries {
  /** Atomic `{ increment: 1 }` on the user's counter - returns the prefix
   * and the POST-increment value. */
  increment(): Promise<{ prefix: string; next: number }>;
  /** Moves the user's counter to `next`. */
  setNext(next: number): Promise<void>;
  /** Whether this tenant already has a document with this number. */
  exists(number: string): Promise<boolean>;
  /** Every number this tenant uses that starts with "{prefix}-". */
  numbersWithPrefix(prefix: string): Promise<string[]>;
}

export function formatDocumentNumber(prefix: string, n: number): string {
  return `${prefix}-${String(n).padStart(6, '0')}`;
}

/** Highest n among numbers shaped "{prefix}-n", 0 if none. */
export function highestDocumentNumber(prefix: string, numbers: string[]): number {
  return numbers.reduce((max, number) => {
    const n = Number(number.slice(prefix.length + 1));
    return Number.isInteger(n) && n > max ? n : max;
  }, 0);
}

export async function takeDocumentNumber(series: DocumentSeries): Promise<string> {
  for (;;) {
    const { prefix, next } = await series.increment();
    const number = formatDocumentNumber(prefix, next - 1);
    if (!(await series.exists(number))) return number;

    const highest = highestDocumentNumber(prefix, await series.numbersWithPrefix(prefix));
    if (highest >= next) await series.setNext(highest + 1);
  }
}

/** The number takeDocumentNumber will actually hand out next, for the
 * "próximo número" previews - read-only, the counter only moves when a
 * document is created. */
export async function effectiveNextDocumentNumber(
  prefix: string,
  next: number,
  series: Pick<DocumentSeries, 'exists' | 'numbersWithPrefix'>,
): Promise<number> {
  if (!(await series.exists(formatDocumentNumber(prefix, next)))) return next;
  return Math.max(next, highestDocumentNumber(prefix, await series.numbersWithPrefix(prefix)) + 1);
}
