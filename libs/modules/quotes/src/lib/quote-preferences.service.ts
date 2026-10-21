import { BadRequestException, Injectable } from '@nestjs/common';
import { getTenantDb, getUserId, type PdfStyle } from '@plexo/database';
import type { UpdateQuotePreferencesDto } from './dto/update-quote-preferences.dto.js';
import { formatQuoteNumber, highestQuoteNumber } from './quote-numbering.service.js';

export interface QuotePreferencesView {
  quotePrefix: string;
  quoteNextNumber: number;
  quotePdfStyle: PdfStyle;
}

/** Personal preferences for the current user - same "GET/PATCH on the
 * authenticated user, no id in the route" shape as
 * PurchasePreferencesService. */
@Injectable()
export class QuotePreferencesService {
  async getPreferences(): Promise<QuotePreferencesView> {
    const userId = requireUserId();
    const prefs = await getTenantDb().user.findUniqueOrThrow({
      where: { id: userId },
      select: { quotePrefix: true, quoteNextNumber: true, quotePdfStyle: true },
    });
    return withEffectiveNextNumber(prefs);
  }

  async updatePreferences(dto: UpdateQuotePreferencesDto): Promise<QuotePreferencesView> {
    const userId = requireUserId();
    const prefs = await getTenantDb().user.update({
      where: { id: userId },
      data: { quotePrefix: dto.quotePrefix, quotePdfStyle: dto.quotePdfStyle },
      select: { quotePrefix: true, quoteNextNumber: true, quotePdfStyle: true },
    });
    return withEffectiveNextNumber(prefs);
  }
}

/** The number QuoteNumberingService will actually hand out next - the
 * stored counter, or past the highest quote already using this prefix
 * (another user's), so the "next number" preview doesn't promise a taken
 * one. Read-only: the counter itself only moves when a quote is created. */
async function withEffectiveNextNumber(prefs: QuotePreferencesView): Promise<QuotePreferencesView> {
  const taken = await getTenantDb().quote.findFirst({
    where: { number: formatQuoteNumber(prefs.quotePrefix, prefs.quoteNextNumber) },
    select: { id: true },
  });
  if (!taken) return prefs;
  const highest = await highestQuoteNumber(prefs.quotePrefix);
  return { ...prefs, quoteNextNumber: Math.max(prefs.quoteNextNumber, highest + 1) };
}

function requireUserId(): string {
  const userId = getUserId();
  if (!userId) {
    throw new BadRequestException('An authenticated user is required');
  }
  return userId;
}
