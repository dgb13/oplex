import { BadRequestException, Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import '@fastify/multipart';
import { Roles } from '@plexo/auth';
import { SubscriptionService } from '@plexo/subscriptions';
import { BomAttachmentService } from './bom-attachment.service.js';
import { BomService } from './bom.service.js';
import { ConfirmProductionOrderDto } from './dto/confirm-production-order.dto.js';
import { CreateBomDto } from './dto/create-bom.dto.js';
import { CreateProductionOrderDto } from './dto/create-production-order.dto.js';
import { ProductionOrderService } from './production-order.service.js';
import { ProductionPlanningService } from './production-planning.service.js';
import { StockPieceService } from './stock-piece.service.js';

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
    private readonly bomAttachmentService: BomAttachmentService,
    private readonly orderService: ProductionOrderService,
    private readonly planningService: ProductionPlanningService,
    private readonly stockPieceService: StockPieceService,
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

  // Documentación (PDF/ZIP) de una versión puntual de receta - ver
  // BomAttachmentService. bomId es la fila puntual de BillOfMaterials
  // (no el articleVariantId), a diferencia del resto de las rutas de BOM
  // de arriba.
  @Get('bom/attachments/:bomId')
  async listBomAttachments(@Param('bomId', ParseUUIDPipe) bomId: string) {
    await this.subscriptionService.assertCanUseProduction();
    return this.bomAttachmentService.list(bomId);
  }

  @Roles('OWNER', 'ADMIN', 'INVENTORY')
  @Post('bom/attachments/:bomId')
  async uploadBomAttachment(@Param('bomId', ParseUUIDPipe) bomId: string, @Req() req: FastifyRequest) {
    await this.subscriptionService.assertCanUseProduction();
    const data = await req.file();
    if (!data) {
      throw new BadRequestException('No se recibió ningún archivo');
    }
    const buffer = await data.toBuffer();
    return this.bomAttachmentService.upload(bomId, data.mimetype, data.filename, buffer);
  }

  // Mismo path que GET/POST arriba, sin colisión: el método HTTP alcanza
  // para distinguirlos, esto no necesita ningún segmento extra - el
  // parámetro es el id del adjunto, no el del bomId (que sólo GET/POST
  // usan).
  @Roles('OWNER', 'ADMIN', 'INVENTORY')
  @Delete('bom/attachments/:attachmentId')
  async removeBomAttachment(@Param('attachmentId', ParseUUIDPipe) attachmentId: string) {
    await this.subscriptionService.assertCanUseProduction();
    await this.bomAttachmentService.remove(attachmentId);
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
  @Post('orders/:id/retry-reservation')
  async retryReservation(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ConfirmProductionOrderDto) {
    await this.subscriptionService.assertCanUseProduction();
    return this.orderService.retryReservation(id, dto.warehouseId);
  }

  @Roles('OWNER', 'ADMIN', 'INVENTORY')
  @Post('orders/:id/cancel')
  async cancelOrder(@Param('id', ParseUUIDPipe) id: string) {
    await this.subscriptionService.assertCanUseProduction();
    return this.orderService.cancel(id);
  }

  // Historial completo de piezas 1D de un artículo - pantalla "Piezas /
  // recortes" (Fase 6, UI). warehouseId es opcional (ver
  // StockPieceService.listByArticleVariant) para poder ver la trazabilidad
  // completa entre depósitos, no sólo la de uno.
  @Get('pieces')
  async listPieces(
    @Query('articleVariantId', ParseUUIDPipe) articleVariantId: string,
    @Query('warehouseId') warehouseId?: string,
  ) {
    await this.subscriptionService.assertCanUseProduction();
    return this.stockPieceService.listByArticleVariant({ articleVariantId, warehouseId });
  }
}
