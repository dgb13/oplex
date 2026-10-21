import { BadRequestException, Injectable } from '@nestjs/common';
import { effectiveNextDocumentNumber, getTenantDb, getUserId, type PdfStyle } from '@plexo/database';
import type { UpdateQuotePreferencesDto } from './dto/update-quote-preferences.dto.js';
import { quoteNumbers } from './quote-numbering.service.js';

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

/** Shows the number the next quote will really get, not a counter value
 * another user with the same prefix already used. */
async function withEffectiveNextNumber(prefs: QuotePreferencesView): Promise<QuotePreferencesView> {
  const quoteNextNumber = await effectiveNextDocumentNumber(prefs.quotePrefix, prefs.quoteNextNumber, quoteNumbers());
  return { ...prefs, quoteNextNumber };
}

function requireUserId(): string {
  const userId = getUserId();
  if (!userId) {
    throw new BadRequestException('An authenticated user is required');
  }
  return userId;
}
