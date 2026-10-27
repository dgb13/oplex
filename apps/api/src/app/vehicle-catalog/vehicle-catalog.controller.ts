import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { PlatformAdminGuard } from '@plexo/auth';
import {
  CreateVehicleBrandDto,
  CreateVehicleModelDto,
  MergeVehicleSuggestionDto,
  UpdateVehicleCatalogItemDto,
  VehicleKindQuery,
} from './vehicle-catalog.dto.js';
import { VehicleCatalogService } from './vehicle-catalog.service.js';

/** Marcas y modelos para cargar una ficha (cualquier usuario del negocio). */
@Controller('vehicle-catalog')
export class VehicleCatalogController {
  constructor(private readonly catalog: VehicleCatalogService) {}

  @Get()
  list(@Query() query: VehicleKindQuery) {
    return this.catalog.list(query.kind ?? 'AUTO');
  }
}

/** /admin › Marcas y modelos. */
@Controller('admin/vehicle-catalog')
@UseGuards(PlatformAdminGuard)
export class AdminVehicleCatalogController {
  constructor(private readonly catalog: VehicleCatalogService) {}

  @Get()
  list(@Query() query: VehicleKindQuery) {
    return this.catalog.adminList(query.kind ?? 'AUTO');
  }

  @Post('brands')
  createBrand(@Body() dto: CreateVehicleBrandDto) {
    return this.catalog.createBrand(dto.kind, dto.name);
  }

  @Patch('brands/:id')
  updateBrand(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateVehicleCatalogItemDto) {
    return this.catalog.updateBrand(id, dto);
  }

  @Post('brands/:id/models')
  createModel(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateVehicleModelDto) {
    return this.catalog.createModel(id, dto.name);
  }

  @Patch('models/:id')
  updateModel(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateVehicleCatalogItemDto) {
    return this.catalog.updateModel(id, dto);
  }

  @Get('suggestions')
  suggestions() {
    return this.catalog.suggestions();
  }

  @Post('suggestions/:id/add')
  add(@Param('id', ParseUUIDPipe) id: string) {
    return this.catalog.addSuggestion(id);
  }

  @Post('suggestions/:id/merge')
  merge(@Param('id', ParseUUIDPipe) id: string, @Body() dto: MergeVehicleSuggestionDto) {
    return this.catalog.mergeSuggestion(id, dto.targetId);
  }

  @Post('suggestions/:id/discard')
  discard(@Param('id', ParseUUIDPipe) id: string) {
    return this.catalog.discardSuggestion(id);
  }
}
