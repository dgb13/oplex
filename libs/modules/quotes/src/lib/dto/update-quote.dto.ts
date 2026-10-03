import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { QuoteLineDto } from './quote-line.dto.js';

/** Only allowed while the Quote is still DRAFT (see QuoteService.update). */
export class UpdateQuoteDto {
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsUUID()
  currencyId?: string;

  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  pricesIncludeTax?: boolean;

  // Condiciones comerciales del PDF. En una cotización nueva, lo que no
  // venga sale de TenantSettings.quoteDefault* (ver QuoteService.create).
  @IsOptional()
  @IsString()
  @MaxLength(300)
  paymentTerms?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  deliveryTerms?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  deliveryPlace?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  warranty?: string;

  // Persona de la empresa cliente a quien va dirigida. null la quita.
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsUUID()
  contactPersonId?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => QuoteLineDto)
  lines?: QuoteLineDto[];
}
