import { Module } from '@nestjs/common';
import { ModuleEnabledGuard } from '../business-templates/module-enabled.guard.js';
import { CustomerAssetsModule } from '../customer-assets/customer-assets.module.js';
import { WorkOrdersController } from './work-orders.controller.js';
import { WorkOrdersService } from './work-orders.service.js';

/** Órdenes de trabajo - etapa 4 de plan-rubros-fichas-ordenes-trabajo.md. */
@Module({
  imports: [CustomerAssetsModule],
  controllers: [WorkOrdersController],
  providers: [WorkOrdersService, ModuleEnabledGuard],
  exports: [WorkOrdersService],
})
export class WorkOrdersModule {}
