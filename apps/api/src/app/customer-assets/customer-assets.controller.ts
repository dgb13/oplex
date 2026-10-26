import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Roles } from '@plexo/auth';
import { BusinessModule, ModuleEnabledGuard } from '../business-templates/module-enabled.guard.js';
import { CustomerAssetsService } from './customer-assets.service.js';
import {
  CheckIdentifierQuery,
  CreateCustomerAssetDto,
  CreateCustomerAssetTypeDto,
  ListCustomerAssetsQuery,
  UpdateCustomerAssetDto,
  UpdateCustomerAssetTypeDto,
} from './dto/customer-asset.dto.js';

// Cargar/editar fichas: quien atiende clientes (mismos roles que Ventas).
const WRITE_ROLES = ['OWNER', 'ADMIN', 'SALES'] as const;
// Cambiar los campos de la ficha es configuración del negocio.
const CONFIG_ROLES = ['OWNER', 'ADMIN'] as const;

/** Fichas del cliente (vehículos, equipos, mascotas...). Sólo con el
 * módulo "fichas" prendido (ModuleEnabledGuard). */
@BusinessModule('fichas')
@UseGuards(ModuleEnabledGuard)
@Controller('customer-assets')
export class CustomerAssetsController {
  constructor(private readonly assets: CustomerAssetsService) {}

  @Get('types')
  listTypes() {
    return this.assets.listTypes();
  }

  @Roles(...CONFIG_ROLES)
  @Post('types')
  createType(@Body() dto: CreateCustomerAssetTypeDto) {
    return this.assets.createType(dto.name);
  }

  @Roles(...CONFIG_ROLES)
  @Patch('types/:id')
  updateType(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCustomerAssetTypeDto) {
    return this.assets.updateType(id, dto);
  }

  /** Otras fichas con el mismo dato principal (aviso antes de guardar). */
  @Get('check-identifier')
  checkIdentifier(@Query() query: CheckIdentifierQuery) {
    return this.assets.findDuplicates(query.typeId, query.identifier, query.excludeId);
  }

  @Get()
  list(@Query() query: ListCustomerAssetsQuery) {
    return this.assets.list(query);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.assets.get(id);
  }

  @Roles(...WRITE_ROLES)
  @Post()
  create(@Body() dto: CreateCustomerAssetDto) {
    return this.assets.create(dto);
  }

  @Roles(...WRITE_ROLES)
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCustomerAssetDto) {
    return this.assets.update(id, dto);
  }
}
