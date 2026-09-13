import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Roles } from '@plexo/auth';
import { RevalueFinancialAccountDto } from './dto/revalue-financial-account.dto.js';
import { TreasuryService } from './treasury.service.js';

/**
 * Vive junto a TreasuryService (composición-root que ya junta
 * ReportsFinancialService + AccountingService) pero cuelga de
 * /reports/financial/accounts, no de /treasury/checks - es la acción
 * "Actualizar cotización" sobre una FinancialAccount, no sobre un cheque.
 * Mismo prefijo que ReportsFinancialController ya usa para el resto de las
 * acciones sobre cuentas financieras.
 */
@Controller('reports/financial/accounts')
export class FinancialAccountRevaluationController {
  constructor(private readonly treasuryService: TreasuryService) {}

  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT')
  @Post(':id/revalue')
  revalue(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RevalueFinancialAccountDto) {
    return this.treasuryService.revalueFinancialAccount(id, dto.rate);
  }
}
