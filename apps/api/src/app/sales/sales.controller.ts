import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Roles } from '@plexo/auth';
import { LongRunningTransaction } from '@plexo/database';
import { CreateCreditNoteDto, RecordReceiptDto } from '@plexo/invoicing';
import { CreateInvoiceFromQuoteDto } from './dto/create-invoice-from-quote.dto.js';
import { CreateSaleDto } from './dto/create-sale.dto.js';
import { SalesService } from './sales.service.js';

// Pedir CAE a ARCA (WSAA + WSFE) puede tardar bastante más que el
// timeout por defecto de la transacción por request (5 s) - en
// homologación se vieron ~10 s. Sin esto la transacción aborta a mitad de
// camino aunque ARCA haya respondido bien.
const ARCA_TIMEOUT_MS = 45_000;

@Controller('sales')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Roles('OWNER', 'ADMIN', 'SALES')
  @Post('invoices')
  @LongRunningTransaction(ARCA_TIMEOUT_MS)
  createSale(@Body() dto: CreateSaleDto) {
    return this.salesService.createSale(dto);
  }

  @Roles('OWNER', 'ADMIN', 'SALES')
  @Post('invoices/from-quote/:quoteId')
  @LongRunningTransaction(ARCA_TIMEOUT_MS)
  createInvoiceFromQuote(
    @Param('quoteId', ParseUUIDPipe) quoteId: string,
    @Body() dto: CreateInvoiceFromQuoteDto,
  ) {
    return this.salesService.createInvoiceFromQuote(quoteId, dto);
  }

  @Roles('OWNER', 'ADMIN', 'SALES')
  @Post('credit-notes')
  @LongRunningTransaction(ARCA_TIMEOUT_MS)
  voidSale(@Body() dto: CreateCreditNoteDto) {
    return this.salesService.voidSale(dto);
  }

  @Roles('OWNER', 'ADMIN', 'SALES')
  @Post('receipts')
  recordReceipt(@Body() dto: RecordReceiptDto) {
    return this.salesService.recordReceipt(dto);
  }
}
