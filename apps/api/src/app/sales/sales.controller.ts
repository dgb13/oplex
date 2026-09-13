import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Roles } from '@plexo/auth';
import { CreateCreditNoteDto, RecordReceiptDto } from '@plexo/invoicing';
import { CreateInvoiceFromQuoteDto } from './dto/create-invoice-from-quote.dto.js';
import { CreateSaleDto } from './dto/create-sale.dto.js';
import { SalesService } from './sales.service.js';

@Controller('sales')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Roles('OWNER', 'ADMIN', 'SALES')
  @Post('invoices')
  createSale(@Body() dto: CreateSaleDto) {
    return this.salesService.createSale(dto);
  }

  @Roles('OWNER', 'ADMIN', 'SALES')
  @Post('invoices/from-quote/:quoteId')
  createInvoiceFromQuote(
    @Param('quoteId', ParseUUIDPipe) quoteId: string,
    @Body() dto: CreateInvoiceFromQuoteDto,
  ) {
    return this.salesService.createInvoiceFromQuote(quoteId, dto);
  }

  @Roles('OWNER', 'ADMIN', 'SALES')
  @Post('credit-notes')
  voidSale(@Body() dto: CreateCreditNoteDto) {
    return this.salesService.voidSale(dto);
  }

  @Roles('OWNER', 'ADMIN', 'SALES')
  @Post('receipts')
  recordReceipt(@Body() dto: RecordReceiptDto) {
    return this.salesService.recordReceipt(dto);
  }
}
