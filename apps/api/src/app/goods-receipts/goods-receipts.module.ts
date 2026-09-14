import { Module } from '@nestjs/common';
import { AccountingModule } from '@plexo/accounting';
import { InventoryModule } from '@plexo/inventory';
import { ProductionModule } from '@plexo/production';
import { PurchasesModule } from '@plexo/purchases';
import { GoodsReceiptsController } from './goods-receipts.controller.js';
import { GoodsReceiptsService } from './goods-receipts.service.js';

@Module({
  imports: [PurchasesModule, InventoryModule, ProductionModule, AccountingModule],
  controllers: [GoodsReceiptsController],
  providers: [GoodsReceiptsService],
})
export class GoodsReceiptsModule {}
