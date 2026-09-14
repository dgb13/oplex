import { Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Roles } from '@plexo/auth';
import { SubscriptionService } from '@plexo/subscriptions';
import { ProductionService } from './production.service.js';

/**
 * Ruta separada del `ProductionController` de `@plexo/production` (que
 * maneja BOM/altas/confirmar/cancelar) porque completar una orden es lo
 * único de este módulo que necesita composición cross-module (ver
 * ProductionService) - mismo criterio que
 * apps/api/goods-receipts vs. las rutas propias de `@plexo/purchases`.
 */
@Controller('production/orders')
export class ProductionExecutionController {
  constructor(
    private readonly productionService: ProductionService,
    private readonly subscriptionService: SubscriptionService,
  ) {}

  @Roles('OWNER', 'ADMIN', 'INVENTORY')
  @Post(':id/complete')
  async completeOrder(@Param('id', ParseUUIDPipe) id: string) {
    await this.subscriptionService.assertCanUseProduction();
    return this.productionService.completeOrder(id);
  }
}
