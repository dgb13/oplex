import { Module } from '@nestjs/common';
import { ModuleEnabledGuard } from '../business-templates/module-enabled.guard.js';
import { CustomerAssetsModule } from '../customer-assets/customer-assets.module.js';
import { WorkOrderCostsController } from './work-order-costs.controller.js';
import { WorkOrderCostsService } from './work-order-costs.service.js';
import { WorkOrdersController } from './work-orders.controller.js';
import { WorkOrdersService } from './work-orders.service.js';

/** Órdenes de trabajo - etapa 4 de plan-rubros-fichas-ordenes-trabajo.md. */
@Module({
  imports: [CustomerAssetsModule],
  controllers: [WorkOrdersController, WorkOrderCostsController],
  providers: [WorkOrdersService, WorkOrderCostsService, ModuleEnabledGuard],
  exports: [WorkOrdersService],
})
export class WorkOrdersModule {}
