import { IsNumber, IsOptional, IsPositive } from 'class-validator';

export class RevalueFinancialAccountDto {
  // Opcional: si no viene, usa el último ExchangeRateHistory cargado para
  // la moneda de la cuenta - ver TreasuryService.revalueFinancialAccount.
  @IsOptional()
  @IsNumber()
  @IsPositive()
  rate?: number;
}
