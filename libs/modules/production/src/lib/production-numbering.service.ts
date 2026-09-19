import { BadRequestException, Injectable } from '@nestjs/common';
import { getTenantDb, getUserId } from '@plexo/database';

/**
 * "{prefix}-{n padded to 6}" per user - same pattern and same reasoning
 * as PurchaseNumberingService (a deliberately separate series per user,
 * assigned via an atomic `{ increment: 1 }`, race-free). See
 * User.productionOrderPrefix/productionOrderNextNumber.
 */
@Injectable()
export class ProductionNumberingService {
  async nextNumber(): Promise<string> {
    const userId = getUserId();
    if (!userId) {
      throw new BadRequestException('An authenticated user is required to number a production order');
    }
    const updated = await getTenantDb().user.update({
      where: { id: userId },
      data: { productionOrderNextNumber: { increment: 1 } },
      select: { productionOrderNextNumber: true, productionOrderPrefix: true },
    });
    return `${updated.productionOrderPrefix}-${String(updated.productionOrderNextNumber - 1).padStart(6, '0')}`;
  }
}
