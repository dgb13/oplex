import { InvoiceTaxLineKind } from '@plexo/database';
import { IsEnum, IsNumber, IsOptional, IsPositive, Min, MinLength, IsString } from 'class-validator';

/** One "otro tributo" row (ej. Percepción IIBB) charged on a sales invoice -
 * unlike PurchaseInvoiceTaxLineDto (free-text transcription, never sent
 * anywhere), this one is mapped to a real AFIP Tributo and sent with the
 * FECAESolicitar request. baseAmount/rate are optional (not every tributo
 * is base*alícuota, e.g. a fixed municipal fee) - amount is always what's
 * actually charged. */
export class CreateInvoiceTaxLineDto {
  @IsEnum(InvoiceTaxLineKind)
  kind!: InvoiceTaxLineKind;

  @IsString()
  @MinLength(1)
  concept!: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  baseAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  rate?: number;

  @IsNumber()
  @IsPositive()
  amount!: number;
}
