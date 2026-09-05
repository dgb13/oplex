import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import '@fastify/multipart';
import { Roles } from '@plexo/auth';
import { AuditEntity } from '@plexo/database';
import {
  CreatePurchaseInvoiceDto,
  ListPurchaseInvoicesQueryDto,
  PurchaseInvoiceAttachmentService,
  RecordSupplierPaymentDto,
} from '@plexo/purchases';
import { PurchaseInvoicesService } from './purchase-invoices.service.js';

// Same write-access roles as the rest of Compras (purchase-order.controller.ts,
// goods-receipts.controller.ts) - registering a Factura de Compra or a
// payment against it is an inventory/finance-affecting write.
const WRITE_ROLES = ['OWNER', 'ADMIN', 'INVENTORY'] as const;

@Controller('purchases/purchase-invoices')
export class PurchaseInvoicesController {
  constructor(
    private readonly purchaseInvoicesService: PurchaseInvoicesService,
    private readonly attachmentService: PurchaseInvoiceAttachmentService,
  ) {}

  @Get()
  list(@Query() query: ListPurchaseInvoicesQueryDto) {
    return this.purchaseInvoicesService.list(query);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.purchaseInvoicesService.get(id);
  }

  // idParam: null on both writes below - see PurchaseInvoicesService's own
  // doc comment. create() has no :id in the route at all; recordPayment()'s
  // :id belongs to the PurchaseInvoice, not the SupplierPayment being
  // created, same mismatch already found and fixed once for
  // QuoteRequestService.convert().
  @AuditEntity('purchaseInvoice', { labelFields: ['supplierInvoiceNumber'], idParam: null })
  @Roles(...WRITE_ROLES)
  @Post()
  create(@Body() dto: CreatePurchaseInvoiceDto) {
    return this.purchaseInvoicesService.createInvoice(dto);
  }

  @AuditEntity('supplierPayment', { labelFields: ['method'], idParam: null })
  @Roles(...WRITE_ROLES)
  @Post(':id/payments')
  recordPayment(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RecordSupplierPaymentDto) {
    return this.purchaseInvoicesService.recordPayment(id, dto);
  }

  @AuditEntity('purchaseInvoice', { labelFields: ['supplierInvoiceNumber'] })
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
