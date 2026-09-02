import { IsDateString, IsOptional } from 'class-validator';

// A diferencia de InflationAdjustmentRangeDto, acá from/to son opcionales e
// independientes, y de granularidad diaria (no restringidos a principio de
// mes) - mismo criterio que ReportsPnlService.getIncomeStatement.
export class TrialBalanceQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
