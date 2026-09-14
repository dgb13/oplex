import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Roles } from '@plexo/auth';
import { SubscriptionService } from '@plexo/subscriptions';
import { BomService } from './bom.service.js';
import { ConfirmProductionOrderDto } from './dto/confirm-production-order.dto.js';
import { CreateBomDto } from './dto/create-bom.dto.js';
import { CreateProductionOrderDto } from './dto/create-production-order.dto.js';
import { ProductionOrderService } from './production-order.service.js';
import { ProductionPlanningService } from './production-planning.service.js';

/**
 * Endpoints propios del módulo (BOM, órdenes, producible) - ver
 * docs/OPLEX-Produccion-Plan-Tecnico-14-9.md, Fase 4/decisión 4:
 * `GET /production/producible` queda abierto en cualquier plan (gancho
 * comercial), todo lo demás exige `assertCanUseProduction()` (BRONZE+).
 * `POST /production/orders/:id/complete` (el consumo real, que sí necesita
 * llamar a InventoryService) vive aparte, en apps/api - ver
 * ProductionOrderService para el porqué.
 */
@Controller('production')
export class ProductionController {
  constructor(
    private readonly bomService: BomService,
    private readonly orderService: ProductionOrderService,
    private readonly planningService: ProductionPlanningService,
    private readonly subscriptionService: SubscriptionService,
  ) {}

  @Roles('OWNER', 'ADMIN', 'INVENTORY')
  @Post('bom')
  async createBom(@Body() dto: CreateBomDto) {
    await this.subscriptionService.assertCanUseProduction();
    return this.bomService.create(dto);
  }

  @Get('bom/:articleVariantId')
  async getActiveBom(@Param('articleVariantId', ParseUUIDPipe) articleVariantId: string) {
    await this.subscriptionService.assertCanUseProduction();
    return this.bomService.getActiveBomOrThrow(articleVariantId);
  }

  @Get('bom/:articleVariantId/versions')
  async listBomVersions(@Param('articleVariantId', ParseUUIDPipe) articleVariantId: string) {
    await this.subscriptionService.assertCanUseProduction();
    return this.bomService.listVersions(articleVariantId);
  }

  // Abierto en cualquier plan (incluido BASIC) a propósito - ver decisión 4
  // del plan técnico: gancho comercial "probá antes de mejorar tu plan".
  @Get('producible')
  computeProducible(
    @Query('articleVariantId', ParseUUIDPipe) articleVariantId: string,
    @Query('warehouseId', ParseUUIDPipe) warehouseId: string,
  ) {
    return this.planningService.computeProducible(articleVariantId, warehouseId);
  }

  @Roles('OWNER', 'ADMIN', 'INVENTORY')
  @Post('orders')
  async createOrder(@Body() dto: CreateProductionOrderDto) {
    await this.subscriptionService.assertCanUseProduction();
    return this.orderService.create(dto);
  }

  @Get('orders')
  async listOrders() {
    await this.subscriptionService.assertCanUseProduction();
    return this.orderService.list();
  }

  @Get('orders/:id')
  async getOrder(@Param('id', ParseUUIDPipe) id: string) {
    await this.subscriptionService.assertCanUseProduction();
    return this.orderService.getById(id);
  }

  @Roles('OWNER', 'ADMIN', 'INVENTORY')
  @Post('orders/:id/confirm')
  async confirmOrder(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ConfirmProductionOrderDto) {
    await this.subscriptionService.assertCanUseProduction();
    return this.orderService.confirm(id, dto.warehouseId);
  }

  @Roles('OWNER', 'ADMIN', 'INVENTORY')
  @Post('orders/:id/cancel')
  async cancelOrder(@Param('id', ParseUUIDPipe) id: string) {
    await this.subscriptionService.assertCanUseProduction();
    return this.orderService.cancel(id);
  }
}
