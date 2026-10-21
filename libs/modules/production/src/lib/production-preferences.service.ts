import { BadRequestException, Injectable } from '@nestjs/common';
import { effectiveNextDocumentNumber, getTenantDb, getUserId } from '@plexo/database';
import type { UpdateProductionPreferencesDto } from './dto/update-production-preferences.dto.js';
import { productionOrderNumbers } from './production-numbering.service.js';

export interface ProductionPreferencesView {
  productionOrderPrefix: string;
  productionOrderNextNumber: number;
}

/** Personal preferences for the current user (numbering prefix for
 * ProductionOrder.number) - same "GET/PATCH on the authenticated user, no
 * id in the route" shape as PurchasePreferencesService. */
@Injectable()
export class ProductionPreferencesService {
  async getPreferences(): Promise<ProductionPreferencesView> {
    const userId = requireUserId();
    const prefs = await getTenantDb().user.findUniqueOrThrow({
      where: { id: userId },
      select: { productionOrderPrefix: true, productionOrderNextNumber: true },
    });
    return withEffectiveNextNumber(prefs);
  }

  async updatePreferences(dto: UpdateProductionPreferencesDto): Promise<ProductionPreferencesView> {
    const userId = requireUserId();
    const prefs = await getTenantDb().user.update({
      where: { id: userId },
      data: { productionOrderPrefix: dto.productionOrderPrefix },
      select: { productionOrderPrefix: true, productionOrderNextNumber: true },
    });
    return withEffectiveNextNumber(prefs);
  }
}

/** Shows the number the next order will really get, not a counter value
 * another user with the same prefix already used. */
async function withEffectiveNextNumber(prefs: ProductionPreferencesView): Promise<ProductionPreferencesView> {
  const productionOrderNextNumber = await effectiveNextDocumentNumber(
    prefs.productionOrderPrefix,
    prefs.productionOrderNextNumber,
    productionOrderNumbers(),
  );
  return { ...prefs, productionOrderNextNumber };
}

function requireUserId(): string {
  const userId = getUserId();
  if (!userId) {
    throw new BadRequestException('An authenticated user is required');
  }
  return userId;
}
