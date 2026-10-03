import { Body, Controller, Post } from '@nestjs/common';
import { RequireModuleAccess } from '@plexo/auth';
import { TransferBetweenAccountsDto } from '@plexo/reports-financial';
import { TreasuryService } from './treasury.service.js';

/**
 * "Transferencia entre cuentas" de Tesorería. Misma ruta y mismo permiso que
 * tenía en ReportsFinancialController, pero acá: desde que cada cuenta de
 * dinero tiene su cuenta contable, la transferencia también se asienta, y
 * eso necesita AccountingService (ver TreasuryService.transferBetweenAccounts).
 */
@Controller('reports/financial')
export class FinancialAccountTransferController {
  constructor(private readonly treasuryService: TreasuryService) {}

  @RequireModuleAccess('reports-financial', 'write')
  @Post('transfers')
  transferBetweenAccounts(@Body() dto: TransferBetweenAccountsDto) {
    return this.treasuryService.transferBetweenAccounts(dto);
  }
}
