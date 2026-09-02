import { Module } from '@nestjs/common';
import { AccountingModule } from '@plexo/accounting';
import { BankReconciliationModule as BankReconciliationLibModule } from '@plexo/bank-reconciliation';
import { ReportsFinancialModule } from '@plexo/reports-financial';
import { BankReconciliationController } from './bank-reconciliation.controller.js';
import { BankReconciliationService } from './bank-reconciliation.service.js';

@Module({
  imports: [BankReconciliationLibModule, ReportsFinancialModule, AccountingModule],
  controllers: [BankReconciliationController],
  providers: [BankReconciliationService],
})
export class BankReconciliationModule {}
