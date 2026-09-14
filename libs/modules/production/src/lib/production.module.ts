import { Module } from '@nestjs/common';
import { SubscriptionModule } from '@plexo/subscriptions';
import { BomAttachmentService } from './bom-attachment.service.js';
import { BomService } from './bom.service.js';
import { ProductionController } from './production.controller.js';
import { ProductionOrderService } from './production-order.service.js';
import { ProductionPlanningService } from './production-planning.service.js';
import { StockPieceService } from './stock-piece.service.js';

@Module({
  imports: [SubscriptionModule],
  controllers: [ProductionController],
  providers: [
    BomService,
    BomAttachmentService,
    StockPieceService,
    ProductionPlanningService,
    ProductionOrderService,
  ],
  exports: [BomService, BomAttachmentService, StockPieceService, ProductionPlanningService, ProductionOrderService],
})
export class ProductionModule {}
