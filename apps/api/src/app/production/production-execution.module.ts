import { Module } from '@nestjs/common';
import { AccountingModule } from '@plexo/accounting';
import { InventoryModule } from '@plexo/inventory';
import { ProductionModule } from '@plexo/production';
import { SubscriptionModule } from '@plexo/subscriptions';
import { ProductionExecutionController } from './production-execution.controller.js';
import { ProductionService } from './production.service.js';

@Module({
  imports: [ProductionModule, InventoryModule, SubscriptionModule, AccountingModule],
  controllers: [ProductionExecutionController],
  providers: [ProductionService],
})
export class ProductionExecutionModule {}
