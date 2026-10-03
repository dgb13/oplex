import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { RequireModuleAccess } from '@plexo/auth';
import { CreateFinancialAccountDto } from './dto/create-financial-account.dto.js';
import { RecordFinancialTransactionDto } from './dto/record-financial-transaction.dto.js';
import { ReportsFinancialService } from './reports-financial.service.js';

const MODULE = 'reports-financial';

@Controller('reports/financial')
export class ReportsFinancialController {
  constructor(private readonly reportsFinancialService: ReportsFinancialService) {}

  @RequireModuleAccess(MODULE, 'write')
  @Post('accounts')
  createFinancialAccount(@Body() dto: CreateFinancialAccountDto) {
    return this.reportsFinancialService.createFinancialAccount(dto);
  }

  @RequireModuleAccess(MODULE, 'read')
  @Get('accounts')
  listFinancialAccounts() {
    return this.reportsFinancialService.listFinancialAccounts();
  }

  @RequireModuleAccess(MODULE, 'write')
  @Post('transactions')
  recordFinancialTransaction(@Body() dto: RecordFinancialTransactionDto) {
    return this.reportsFinancialService.recordFinancialTransaction(dto);
  }

  // POST transfers vive en apps/api (FinancialAccountTransferController):
  // además de mover los saldos, asienta la transferencia (AccountingService).

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
