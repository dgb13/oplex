import { Module } from '@nestjs/common';
import { AccountingModule } from '@plexo/accounting';
import { PurchasesModule } from '@plexo/purchases';
import { ReportsFinancialModule } from '@plexo/reports-financial';
import { TreasuryModule } from '@plexo/treasury';
import { PurchaseInvoicesController } from './purchase-invoices.controller.js';
import { PurchaseInvoicesService } from './purchase-invoices.service.js';

@Module({
  imports: [PurchasesModule, AccountingModule, ReportsFinancialModule, TreasuryModule],
  controllers: [PurchaseInvoicesController],
  providers: [PurchaseInvoicesService],
})
export class PurchaseInvoicesModule {}
