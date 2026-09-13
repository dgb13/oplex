import { Body, Controller, Get, Param, ParseEnumPipe, ParseUUIDPipe, Post, Query, StreamableFile } from '@nestjs/common';
import { Roles } from '@plexo/auth';
import { InvoicePdfFormat } from '@plexo/database';
import { CreateCurrencyDto } from './dto/create-currency.dto.js';
import { RecordExchangeRateDto } from './dto/record-exchange-rate.dto.js';
import { InvoicingService } from './invoicing.service.js';

@Controller('invoicing')
export class InvoicingController {
  constructor(private readonly invoicingService: InvoicingService) {}

  // Customers are managed via POST/GET /companies (role=CUSTOMER) now -
  // see @plexo/companies. A Company can be a customer, a supplier, and/or
  // one of the tenant's own branches, so that CRUD doesn't belong to
  // Invoicing specifically anymore.

  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT')
  @Post('currencies')
  createCurrency(@Body() dto: CreateCurrencyDto) {
    return this.invoicingService.createCurrency(dto);
  }

  @Get('currencies')
  listCurrencies() {
    return this.invoicingService.listCurrencies();
  }

  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT')
  @Post('currencies/:id/set-base')
  setBaseCurrency(@Param('id', ParseUUIDPipe) id: string) {
    return this.invoicingService.setBaseCurrency(id);
  }

  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT')
  @Post('exchange-rates')
  recordExchangeRate(@Body() dto: RecordExchangeRateDto) {
    return this.invoicingService.recordExchangeRate(dto);
  }

  @Get('exchange-rates')
  listExchangeRateHistory(@Query('currencyId', ParseUUIDPipe) currencyId: string) {
    return this.invoicingService.listExchangeRateHistory(currencyId);
  }

  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT')
  @Post('exchange-rates/sync-bna')
  syncBnaRate() {
    return this.invoicingService.syncBnaRate();
  }

  @Get('invoices')
  listInvoices() {
    return this.invoicingService.listInvoices();
  }

  @Get('invoices/:id')
  getInvoice(@Param('id', ParseUUIDPipe) id: string) {
    return this.invoicingService.getInvoice(id);
  }

  @Get('invoices/:id/pdf')
  async downloadPdf(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('format', new ParseEnumPipe(InvoicePdfFormat, { optional: true })) format?: InvoicePdfFormat,
  ) {
    const { buffer, filename } = await this.invoicingService.generatePdf(id, format);
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${filename}"`,
    });
  }

  // Credit notes are created via POST /sales/credit-notes (SalesService),
  // not here - that's the composition that also reverses the invoice's
  // journal entry. InvoicingService.createCreditNote() stays on this
  // service for that composition to call; it's just not exposed as its
  // own route anymore, so there's no path that credits an invoice
  // without also closing out its GL entry.

  // Receipts are recorded via POST /sales/receipts (SalesService), same
  // reasoning as credit notes above - that's the composition that also
  // posts the collection's journal entry (Dr Caja / Cr Deudores por
  // Ventas). InvoicingService.recordReceipt() stays on this service for
  // that composition to call; it's just not exposed as its own route
  // anymore, so there's no path that collects a payment without also
  // posting it to the ledger.
}
