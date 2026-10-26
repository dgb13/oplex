import { Module } from '@nestjs/common';
import { CustomerAssetsModule } from '../customer-assets/customer-assets.module.js';
import { WorkOrdersModule } from '../work-orders/work-orders.module.js';
import { BusinessProfileService } from './business-profile.service.js';
import {
  AdminBusinessTemplatesController,
  BusinessProfileController,
  BusinessTemplatesController,
} from './business-templates.controller.js';
import { BusinessTemplatesService } from './business-templates.service.js';

/** Rubros: catálogo en /admin/rubros + rubro y módulos de cada negocio.
 * Plan: docs/planesdemodulos/plan-rubros-fichas-ordenes-trabajo.md. */
@Module({
  imports: [CustomerAssetsModule, WorkOrdersModule],
  controllers: [BusinessTemplatesController, BusinessProfileController, AdminBusinessTemplatesController],
  providers: [BusinessTemplatesService, BusinessProfileService],
})
export class BusinessTemplatesModule {}
