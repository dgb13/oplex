import { BadRequestException, Body, Controller, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import '@fastify/multipart';
import { Roles } from '@plexo/auth';
import { CreateGoodsReceiptDto, GoodsReceiptAttachmentService } from '@plexo/purchases';
import { GoodsReceiptsService } from './goods-receipts.service.js';

// Same write-access roles as the rest of Compras/Inventario
// (purchase-order.controller.ts, inventory.controller.ts) - receiving
// goods is an inventory-affecting write.
const WRITE_ROLES = ['OWNER', 'ADMIN', 'INVENTORY', 'PURCHASES'] as const;

@Controller('purchases/goods-receipts')
export class GoodsReceiptsController {
  constructor(
    private readonly goodsReceiptsService: GoodsReceiptsService,
    private readonly attachmentService: GoodsReceiptAttachmentService,
  ) {}

  @Roles(...WRITE_ROLES)
  @Post()
  create(@Body() dto: CreateGoodsReceiptDto) {
    return this.goodsReceiptsService.createReceipt(dto);
  }

  @Roles(...WRITE_ROLES)
  @Post(':id/attachment')
  async uploadAttachment(@Param('id', ParseUUIDPipe) id: string, @Req() req: FastifyRequest) {
    const data = await req.file();
    if (!data) {
      throw new BadRequestException('No se recibió ningún archivo');
    }
    const buffer = await data.toBuffer();
    return this.attachmentService.setAttachment(id, data.mimetype, buffer);
  }
}
