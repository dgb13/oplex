import { Module } from '@nestjs/common';
import { ModuleEnabledGuard } from '../business-templates/module-enabled.guard.js';
import { CustomerAssetsController } from './customer-assets.controller.js';
import { CustomerAssetsService } from './customer-assets.service.js';

/** Fichas del cliente - etapa 3 de plan-rubros-fichas-ordenes-trabajo.md. */
@Module({
  controllers: [CustomerAssetsController],
  providers: [CustomerAssetsService, ModuleEnabledGuard],
  exports: [CustomerAssetsService],
})
export class CustomerAssetsModule {}
