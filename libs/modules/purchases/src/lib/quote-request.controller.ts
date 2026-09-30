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
import { CreateQuoteRequestDto } from './dto/create-quote-request.dto.js';
import { CreateQuoteRequestGroupDto } from './dto/create-quote-request-group.dto.js';
import { SelectQuoteRequestWinnerDto } from './dto/select-quote-request-winner.dto.js';
import { UpdateQuoteRequestDto } from './dto/update-quote-request.dto.js';
import { QuoteRequestService } from './quote-request.service.js';

const WRITE_ROLES = ['OWNER', 'ADMIN', 'INVENTORY', 'PURCHASES'] as const;

@Controller('purchases/quote-requests')
export class QuoteRequestController {
  constructor(private readonly quoteRequestService: QuoteRequestService) {}

  @Get()
  list(@Query('status') status?: PurchaseDocumentStatus, @Query('supplierId') supplierId?: string) {
    return this.quoteRequestService.list(status, supplierId);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.quoteRequestService.get(id);
  }

  // idParam: null - a bare POST has no :id in the route, and
  // ActivityLogInterceptor never fetches a "before" snapshot for POST
  // requests anyway (there's nothing to diff against on a create). With
  // idParam left at its default ('id'), entityId would resolve against a
  // route param that doesn't exist here and come out undefined - null
  // makes it fall back to the created row's own id instead (see
  // ActivityLogInterceptor.record).
  @AuditEntity('quoteRequest', { labelFields: ['number'], idParam: null })
  @Roles(...WRITE_ROLES)
  @Post()
  create(@Body() dto: CreateQuoteRequestDto) {
    return this.quoteRequestService.create(dto);
  }

  // "Pedir cotización a varios proveedores" - creates N QuoteRequest (one
  // per supplier), see QuoteRequestService.createGroup. idParam: null, same
  // reasoning as create() above - and the response isn't a single entity
  // anyway (it's { rfqGroupId, quoteRequests }), so entityId/entityLabel
  // just come out empty here, which is fine for a bulk create.
  @AuditEntity('quoteRequest', { idParam: null })
  @Roles(...WRITE_ROLES)
  @Post('groups')
  createGroup(@Body() dto: CreateQuoteRequestGroupDto) {
    return this.quoteRequestService.createGroup(dto);
  }

  @Get('groups/:rfqGroupId/compare')
  compareGroup(@Param('rfqGroupId') rfqGroupId: string) {
    return this.quoteRequestService.compareGroup(rfqGroupId);
  }

  // Audited as a `purchaseOrder` create, same reasoning as convert() below
  // - selectWinner's real effect from the composition root's point of view
  // is "a new PurchaseOrder exists", the sibling cancellations are a side
  // effect (mirrors convert()'s own comment on this exact tradeoff).
  @AuditEntity('purchaseOrder', { labelFields: ['number'], idParam: null })
  @Roles(...WRITE_ROLES)
  @Post('groups/:rfqGroupId/select-winner')
  selectWinner(
    @Param('rfqGroupId') rfqGroupId: string,
    @Body() dto: SelectQuoteRequestWinnerDto,
  ) {
    return this.quoteRequestService.selectWinner(rfqGroupId, dto.winningQuoteRequestId);
  }

  @AuditEntity('quoteRequest', { labelFields: ['number'] })
  @Roles(...WRITE_ROLES)
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateQuoteRequestDto) {
    return this.quoteRequestService.update(id, dto);
  }

  // idParam: null, same reasoning as create() above - clone() doesn't
  // mutate the original quote request at all (nothing to diff there), it
  // creates a brand new one. The interceptor's "after" snapshot is
  // whatever the handler returns, which here is the NEW clone - auditing
  // this as a create of that clone (not an update of the :id in the URL)
  // is what actually matches what happened.
  @AuditEntity('quoteRequest', { labelFields: ['number'], idParam: null })
  @Roles(...WRITE_ROLES)
  @Post(':id/clone')
  clone(@Param('id', ParseUUIDPipe) id: string) {
    return this.quoteRequestService.clone(id);
  }

  // Audited as a `purchaseOrder` create, not a `quoteRequest` update -
  // convert() returns the newly-created PurchaseOrder, not the source
  // quote request (whose only change, status -> CONVERTED, is a side
  // effect here). Tagging this as `quoteRequest` would make
  // ActivityLogInterceptor diff/label a PurchaseOrder's fields (wrong
  // shape entirely - e.g. its `number` uses the purchaseOrderPrefix
  // series, not quoteRequestPrefix) under a `quoteRequest` entityType,
  // which is exactly the mismatch this comment is here to prevent
  // reintroducing. idParam: null for the same reason as create()/clone().
  @AuditEntity('purchaseOrder', { labelFields: ['number'], idParam: null })
  @Roles(...WRITE_ROLES)
  @Post(':id/convert')
  convert(@Param('id', ParseUUIDPipe) id: string) {
    return this.quoteRequestService.convert(id);
  }

  @AuditEntity('quoteRequest', { labelFields: ['number'] })
  @Roles(...WRITE_ROLES)
  @Patch(':id/cancel')
  cancel(@Param('id', ParseUUIDPipe) id: string) {
    return this.quoteRequestService.cancel(id);
  }

  @Get(':id/pdf')
  async downloadPdf(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('style', new ParseEnumPipe(PdfStyle, { optional: true })) style?: PdfStyle,
  ) {
    const { buffer, filename } = await this.quoteRequestService.generatePdf(id, style);
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${filename}"`,
    });
  }
}
