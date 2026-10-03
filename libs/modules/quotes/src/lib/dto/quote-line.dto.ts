import { TaxLineKind } from '@plexo/database';
import { IsEnum, IsNumber, IsOptional, IsPositive, IsString, IsUUID, Max, Min, ValidateIf } from 'class-validator';

export class QuoteLineDto {
  @IsUUID()
  articleVariantId!: string;

  @IsNumber()
  @IsPositive()
  quantity!: number;

  @IsNumber()
  @Min(0)
  unitPrice!: number;

  @IsOptional()
  @IsString()
  notes?: string;

  // Anula taxKind/taxRate del catálogo (Article.taxDefinition) para esta
  // línea únicamente - mismo criterio que CreateInvoiceLineDto. Sin esto,
  // la alícuota se resuelve del artículo (ver QuoteService.resolveLineTax).
  @IsOptional()
  @IsEnum(TaxLineKind)
  taxKind?: TaxLineKind;

  @ValidateIf((o) => o.taxKind === undefined || o.taxKind === 'GRAVADO')
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  taxRate?: number;

  // Bonificación de la línea en %, sobre precio × cantidad.
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  discountPercent?: number;
}
