import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { Roles } from '@plexo/auth';
import { AuditEntity, PdfStyle, type PurchaseDocumentStatus } from '@plexo/database';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto.js';
import { MarkSentWhatsappDto } from './dto/mark-sent-whatsapp.dto.js';
import { SendFollowUpEmailDto } from './dto/send-follow-up-email.dto.js';
import { SendPurchaseOrderEmailDto } from './dto/send-purchase-order-email.dto.js';
import { UpdatePurchaseOrderDto } from './dto/update-purchase-order.dto.js';
import { PurchaseOrderService } from './purchase-order.service.js';

const WRITE_ROLES = ['OWNER', 'ADMIN', 'INVENTORY'] as const;

@Controller('purchases/purchase-orders')
export class PurchaseOrderController {
  constructor(private readonly purchaseOrderService: PurchaseOrderService) {}

  @Get()
  list(@Query('status') status?: PurchaseDocumentStatus, @Query('supplierId') supplierId?: string) {
    return this.purchaseOrderService.list(status, supplierId);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.purchaseOrderService.get(id);
  }

  // idParam: null - see the identical comment on QuoteRequestController.create().
  @AuditEntity('purchaseOrder', { labelFields: ['number'], idParam: null })
  @Roles(...WRITE_ROLES)
  @Post()
  create(@Body() dto: CreatePurchaseOrderDto) {
    return this.purchaseOrderService.create(dto);
  }

  @AuditEntity('purchaseOrder', { labelFields: ['number'] })
  @Roles(...WRITE_ROLES)
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePurchaseOrderDto) {
    return this.purchaseOrderService.update(id, dto);
  }

  @AuditEntity('purchaseOrder', { labelFields: ['number'] })
  @Roles(...WRITE_ROLES)
  @Patch(':id/cancel')
  cancel(@Param('id', ParseUUIDPipe) id: string) {
    return this.purchaseOrderService.cancel(id);
  }

  // Returns the updated PurchaseOrder itself (not a bare {sent:true}) so
  // the audit log's diff actually reflects what changed (status/sentAt/
  // sentVia) - the interceptor diffs the handler's return value as-is,
  // it doesn't re-query the entity on its own.
  @AuditEntity('purchaseOrder', { labelFields: ['number'] })
  @Roles(...WRITE_ROLES)
  @Post(':id/send-email')
  sendEmail(@Param('id', ParseUUIDPipe) id: string, @Body() dto?: SendPurchaseOrderEmailDto) {
    return this.purchaseOrderService.sendEmail(id, dto);
  }

  // No @AuditEntity: a follow-up nudge doesn't change anything on the
  // PurchaseOrder itself (no sentAt/sentVia update, see the service's
  // docstring), so there's nothing for the interceptor to diff.
  @Roles(...WRITE_ROLES)
  @Post(':id/follow-up-email')
  sendFollowUpEmail(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SendFollowUpEmailDto) {
    return this.purchaseOrderService.sendFollowUpEmail(id, dto);
  }

  @Get(':id/whatsapp-link')
  whatsappLink(@Param('id', ParseUUIDPipe) id: string, @Query('phone') phone: string) {
    return this.purchaseOrderService.buildWhatsappLink(id, phone);
  }

  @AuditEntity('purchaseOrder', { labelFields: ['number'] })
  @Roles(...WRITE_ROLES)
  @Post(':id/mark-sent-whatsapp')
  markSentWhatsapp(@Param('id', ParseUUIDPipe) id: string, @Body() dto: MarkSentWhatsappDto) {
    return this.purchaseOrderService.markSentWhatsapp(id, dto.phone, dto.contactName, dto.contactAvatarUrl);
  }

  @Get(':id/pdf')
  async downloadPdf(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('style', new ParseEnumPipe(PdfStyle, { optional: true })) style?: PdfStyle,
  ) {
    const { buffer, filename } = await this.purchaseOrderService.generatePdf(id, style);
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${filename}"`,
    });
  }
}
