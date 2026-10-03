import { Body, Controller, Get, Post } from '@nestjs/common';
import { RequireModuleAccess } from '@plexo/auth';
import { CreateFinancialAccountDto, TransferBetweenAccountsDto } from '@plexo/reports-financial';
import { RecordMoneyMovementDto } from './dto/record-money-movement.dto.js';
import { TreasuryService } from './treasury.service.js';

/**
 * Acciones de Tesorería sobre cuentas de dinero que también se asientan.
 * Mismas rutas y mismo permiso que tenían en ReportsFinancialController,
 * pero acá: desde que cada cuenta de dinero tiene su cuenta contable,
 * necesitan AccountingService (ver TreasuryService).
 */
@Controller('reports/financial')
export class FinancialAccountsController {
  constructor(private readonly treasuryService: TreasuryService) {}

  @RequireModuleAccess('reports-financial', 'write')
  @Post('accounts')
  createFinancialAccount(@Body() dto: CreateFinancialAccountDto) {
    return this.treasuryService.createFinancialAccount(dto);
  }

  @RequireModuleAccess('reports-financial', 'read')
  @Get('movement-concepts')
  listMovementConcepts() {
    return this.treasuryService.listMovementConcepts();
  }

  @RequireModuleAccess('reports-financial', 'write')
  @Post('transactions')
  recordManualMovement(@Body() dto: RecordMoneyMovementDto) {
    return this.treasuryService.recordManualMovement(dto);
  }

  @RequireModuleAccess('reports-financial', 'write')
  @Post('transfers')
  transferBetweenAccounts(@Body() dto: TransferBetweenAccountsDto) {
    return this.treasuryService.transferBetweenAccounts(dto);
  }
}
