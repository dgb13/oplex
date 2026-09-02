import { IsDateString } from 'class-validator';

// `from`/`to` deben ser el primer día de un mes (ej. "2026-01-01") - el
// motor de reexpresión trabaja a granularidad mensual, igual que
// PriceIndexEntry.period. La validación de que efectivamente sean
// principio de mes queda del lado del servicio (mensaje más claro que lo
// que class-validator puede dar por sí solo).
export class InflationAdjustmentRangeDto {
  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;
}
