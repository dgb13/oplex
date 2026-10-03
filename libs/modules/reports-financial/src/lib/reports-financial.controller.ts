import { Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { RequireModuleAccess } from '@plexo/auth';
import { ReportsFinancialService } from './reports-financial.service.js';

const MODULE = 'reports-financial';

@Controller('reports/financial')
export class ReportsFinancialController {
  constructor(private readonly reportsFinancialService: ReportsFinancialService) {}

  // POST accounts, POST transactions y POST transfers viven en apps/api
  // (FinancialAccountsController): además de mover los saldos, se asientan
  // (AccountingService).

  @RequireModuleAccess(MODULE, 'read')
  @Get('accounts')
  listFinancialAccounts() {
    return this.reportsFinancialService.listFinancialAccounts();
  }

  @RequireModuleAccess(MODULE, 'write')
  @Post('transactions/:id/reconcile')
  reconcileTransaction(@Param('id', ParseUUIDPipe) id: string) {
    return this.reportsFinancialService.reconcileTransaction(id);
  }

  @RequireModuleAccess(MODULE, 'read')
  @Get('transactions/unreconciled')
  listUnreconciledTransactions(@Query('financialAccountId') financialAccountId?: string) {
    return this.reportsFinancialService.listUnreconciledTransactions(financialAccountId);
  }

  @RequireModuleAccess(MODULE, 'read')
  @Get('accounts/:id/reconciliation')
  getReconciliationSummary(@Param('id', ParseUUIDPipe) id: string) {
    return this.reportsFinancialService.getReconciliationSummary(id);
  }
}
