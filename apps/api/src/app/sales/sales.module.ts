import { Module } from '@nestjs/common';
import { AccountingModule } from '@plexo/accounting';
import { InventoryModule } from '@plexo/inventory';
import { InvoicingModule } from '@plexo/invoicing';
import { QuotesModule } from '@plexo/quotes';
import { ReportsFinancialModule } from '@plexo/reports-financial';
import { TenantSettingsModule } from '@plexo/tenant-settings';
import { TreasuryModule } from '@plexo/treasury';
import { SalesController } from './sales.controller.js';
import { SalesService } from './sales.service.js';

@Module({
  imports: [
    InventoryModule,
    InvoicingModule,
    AccountingModule,
    ReportsFinancialModule,
    QuotesModule,
    TenantSettingsModule,
    TreasuryModule,
  ],
  controllers: [SalesController],
  providers: [SalesService],
  // Exported for MercadoPagoWebhookModule - the webhook's whole reason to
  // reuse this (rather than posting a Receipt+JournalEntry itself) is to
  // never have a second path that collects a payment without also
  // crediting Deudores por Ventas, see SalesService.recordReceipt's own
  // doc comment.
  exports: [SalesService],
})
export class SalesModule {}
