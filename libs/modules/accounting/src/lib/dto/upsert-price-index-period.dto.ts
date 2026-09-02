import { IsDateString, IsNumber } from 'class-validator';

export class UpsertPriceIndexPeriodDto {
  // Primer día del mes, ej. "2026-08-01".
  @IsDateString()
  period!: string;

  // % de variación mensual (ej. 2.8 = 2,8%). Puede ser negativo (deflación).
  @IsNumber()
  variationPct!: number;
}
