import { BadRequestException, Injectable } from '@nestjs/common';
import { effectiveNextDocumentNumber, getTenantDb, getUserId, type PdfStyle } from '@plexo/database';
import type { UpdatePurchasePreferencesDto } from './dto/update-purchase-preferences.dto.js';
import { purchaseDocumentNumbers } from './purchase-numbering.service.js';

export interface PurchasePreferencesView {
  quoteRequestPrefix: string;
  quoteRequestNextNumber: number;
  purchaseOrderPrefix: string;
  purchaseOrderNextNumber: number;
  purchaseDocumentPdfStyle: PdfStyle;
}

/** Personal preferences for the current user (numbering prefixes + default
 * PDF style) - same "GET/PATCH on the authenticated user, no id in the
 * route" shape as /auth/me. */
@Injectable()
export class PurchasePreferencesService {
  async getPreferences(): Promise<PurchasePreferencesView> {
    const userId = requireUserId();
    const user = await getTenantDb().user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        quoteRequestPrefix: true,
        quoteRequestNextNumber: true,
        purchaseOrderPrefix: true,
        purchaseOrderNextNumber: true,
        purchaseDocumentPdfStyle: true,
      },
    });
    return withEffectiveNextNumbers(user);
  }

  async updatePreferences(dto: UpdatePurchasePreferencesDto): Promise<PurchasePreferencesView> {
    const userId = requireUserId();
    const user = await getTenantDb().user.update({
      where: { id: userId },
      data: {
        quoteRequestPrefix: dto.quoteRequestPrefix,
        purchaseOrderPrefix: dto.purchaseOrderPrefix,
        purchaseDocumentPdfStyle: dto.purchaseDocumentPdfStyle,
      },
      select: {
        quoteRequestPrefix: true,
        quoteRequestNextNumber: true,
        purchaseOrderPrefix: true,
        purchaseOrderNextNumber: true,
        purchaseDocumentPdfStyle: true,
      },
    });
    return withEffectiveNextNumbers(user);
  }
}

/** Shows the numbers the next documents will really get, not counter
 * values another user with the same prefix already used. */
async function withEffectiveNextNumbers(prefs: PurchasePreferencesView): Promise<PurchasePreferencesView> {
  // Sequential, not Promise.all - these run on the request's tenant
  // transaction client.
  const quoteRequestNextNumber = await effectiveNextDocumentNumber(
    prefs.quoteRequestPrefix,
    prefs.quoteRequestNextNumber,
    purchaseDocumentNumbers('quoteRequest'),
  );
  const purchaseOrderNextNumber = await effectiveNextDocumentNumber(
    prefs.purchaseOrderPrefix,
    prefs.purchaseOrderNextNumber,
    purchaseDocumentNumbers('purchaseOrder'),
  );
  return { ...prefs, quoteRequestNextNumber, purchaseOrderNextNumber };
}

function requireUserId(): string {
  const userId = getUserId();
  if (!userId) {
    throw new BadRequestException('An authenticated user is required');
  }
  return userId;
}
