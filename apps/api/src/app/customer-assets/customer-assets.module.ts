import { Module } from '@nestjs/common';
import { ModuleEnabledGuard } from '../business-templates/module-enabled.guard.js';
import { VehicleCatalogModule } from '../vehicle-catalog/vehicle-catalog.module.js';
import { CustomerAssetsController } from './customer-assets.controller.js';
import { CustomerAssetsService } from './customer-assets.service.js';

/** Fichas del cliente - etapa 3 de plan-rubros-fichas-ordenes-trabajo.md. */
@Module({
  imports: [VehicleCatalogModule],
  controllers: [CustomerAssetsController],
  providers: [CustomerAssetsService, ModuleEnabledGuard],
  exports: [CustomerAssetsService],
})
export class CustomerAssetsModule {}
