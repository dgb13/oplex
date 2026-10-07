import { Type } from 'class-transformer';
import {
  IsBoolean,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { QuoteRequestLineDto } from './quote-request-line.dto.js';

/** Same shape as CreateQuoteRequestDto, but supplierIds (plural) instead of
 * a single supplierId - QuoteRequestService.createGroup fans this out into
 * one QuoteRequest per supplier (same lines/terms on each), tagged with a
 * shared rfqGroupId so they can be compared later. */
export class CreateQuoteRequestGroupDto {
  @IsArray()
  @ArrayMinSize(2)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  supplierIds!: string[];

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
