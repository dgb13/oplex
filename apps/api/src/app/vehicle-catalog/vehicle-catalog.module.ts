import { Module } from '@nestjs/common';
import { AdminVehicleCatalogController, VehicleCatalogController } from './vehicle-catalog.controller.js';
import { VehicleCatalogService } from './vehicle-catalog.service.js';

/** Marcas y modelos de vehículos para los campos de las fichas. */
@Module({
  controllers: [VehicleCatalogController, AdminVehicleCatalogController],
  providers: [VehicleCatalogService],
  exports: [VehicleCatalogService],
})
export class VehicleCatalogModule {}
