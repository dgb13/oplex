import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { Roles } from '@plexo/auth';
import { BusinessModule, ModuleEnabledGuard } from '../business-templates/module-enabled.guard.js';
import {
  ChangeWorkOrderStatusDto,
  CreateWorkOrderDto,
  ListWorkOrdersQuery,
  UpdateWorkOrderDto,
  UpdateWorkOrderStatusesDto,
} from './dto/work-order.dto.js';
import { WorkOrdersService } from './work-orders.service.js';

// Cargar y mover órdenes: quien atiende clientes (mismos roles que Ventas).
const WRITE_ROLES = ['OWNER', 'ADMIN', 'SALES'] as const;
// Cambiar los estados es configuración del negocio.
const CONFIG_ROLES = ['OWNER', 'ADMIN'] as const;

/** Órdenes de trabajo. Sólo con el módulo "ordenes-trabajo" prendido. */
@BusinessModule('ordenes-trabajo')
@UseGuards(ModuleEnabledGuard)
@Controller('work-orders')
export class WorkOrdersController {
  constructor(private readonly orders: WorkOrdersService) {}

  /** Nombre del documento ("Orden de trabajo") y estados. */
  @Get('config')
  config() {
    return this.orders.getConfig();
  }

  @Roles(...CONFIG_ROLES)
  @Put('config')
  updateConfig(@Body() dto: UpdateWorkOrderStatusesDto) {
    return this.orders.updateConfig(dto);
  }

  @Get('assignees')
  assignees() {
    return this.orders.assignees();
  }

  @Get()
  list(@Query() query: ListWorkOrdersQuery) {
    return this.orders.list(query);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.orders.get(id);
  }

  @Get(':id/whatsapp-link')
  whatsappLink(@Param('id', ParseUUIDPipe) id: string, @Query('phone') phone?: string) {
    return this.orders.whatsappLink(id, phone);
  }

  @Roles(...WRITE_ROLES)
  @Post()
  create(@Body() dto: CreateWorkOrderDto) {
    return this.orders.create(dto);
  }

  @Roles(...WRITE_ROLES)
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateWorkOrderDto) {
    return this.orders.update(id, dto);
  }

  @Roles(...WRITE_ROLES)
  @Post(':id/status')
  changeStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ChangeWorkOrderStatusDto) {
    return this.orders.changeStatus(id, dto.statusId);
  }
}
