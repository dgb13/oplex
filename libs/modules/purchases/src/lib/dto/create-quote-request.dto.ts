import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { QuoteRequestLineDto } from './quote-request-line.dto.js';

export class CreateQuoteRequestDto {
  @IsUUID()
  supplierId!: string;

  @IsUUID()
  currencyId!: string;

  @IsOptional()
  @IsUUID()
  transportModeId?: string;

  @IsOptional()
  @IsUUID()
  paymentTermId?: string;

  @IsOptional()
  @IsUUID()
  deliveryTimeId?: string;

  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  // Si los costos de las líneas se escribieron con IVA incluido (como los
  // pasó el proveedor) - ver PurchaseOrder.costsIncludeVat.
  @IsOptional()
  @IsBoolean()
  costsIncludeVat?: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => QuoteRequestLineDto)
  lines!: QuoteRequestLineDto[];
}
