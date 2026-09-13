import { Module } from '@nestjs/common';
import { AccountingModule } from '@plexo/accounting';
import { InvoicingModule } from '@plexo/invoicing';
import { ReportsFinancialModule } from '@plexo/reports-financial';
import { TreasuryModule as TreasuryLibModule } from '@plexo/treasury';
import { FinancialAccountRevaluationController } from './financial-account-revaluation.controller.js';
import { TreasuryController } from './treasury.controller.js';
import { TreasuryService } from './treasury.service.js';

@Module({
  imports: [TreasuryLibModule, ReportsFinancialModule, InvoicingModule, AccountingModule],
  controllers: [TreasuryController, FinancialAccountRevaluationController],
  providers: [TreasuryService],
})
export class TreasuryModule {}
