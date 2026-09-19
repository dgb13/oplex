import { BadRequestException, Injectable } from '@nestjs/common';
import { getTenantDb, getUserId } from '@plexo/database';
import type { UpdateProductionPreferencesDto } from './dto/update-production-preferences.dto.js';

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
    return getTenantDb().user.findUniqueOrThrow({
      where: { id: userId },
      select: { productionOrderPrefix: true, productionOrderNextNumber: true },
    });
  }

  async updatePreferences(dto: UpdateProductionPreferencesDto): Promise<ProductionPreferencesView> {
    const userId = requireUserId();
    return getTenantDb().user.update({
      where: { id: userId },
      data: { productionOrderPrefix: dto.productionOrderPrefix },
      select: { productionOrderPrefix: true, productionOrderNextNumber: true },
    });
  }
}

function requireUserId(): string {
  const userId = getUserId();
  if (!userId) {
    throw new BadRequestException('An authenticated user is required');
  }
  return userId;
}
