import { DiscountType, DocumentLetter, TaxLineKind } from '@plexo/database';
import { Type } from 'class-transformer';
import { CreateInvoiceTaxLineDto } from './create-invoice-tax-line.dto.js';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class CreateInvoiceLineDto {
  @IsUUID()
  articleVariantId!: string;

  @IsNumber()
  @IsPositive()
  quantity!: number;

  @IsOptional()
  @IsEnum(DiscountType)
  discountType?: DiscountType;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discountValue?: number;

  // Anula el precio de catálogo (variant.unitPrice×exchangeRate) para esta
  // línea únicamente - en la moneda del comprobante, no se vuelve a
  // multiplicar por exchangeRate. Si CreateInvoiceDto.pricesIncludeTax es
  // true, este valor se interpreta como precio FINAL (con IVA) y se
  // desglosa a neto usando la alícuota ya resuelta de la línea (ver punto
  // 3 más abajo, o el catálogo si taxKind/taxRate no se anulan también).
  @IsOptional()
  @IsNumber()
  @IsPositive()
  unitPrice?: number;

  // Anula taxKind/taxRate del catálogo (Article.taxDefinition) para esta
  // línea únicamente - no cambia la clasificación fiscal del artículo,
  // sólo cómo se factura esta línea en particular.
  @IsOptional()
  @IsEnum(TaxLineKind)
  taxKind?: TaxLineKind;

  // Sólo tiene sentido con taxKind GRAVADO (u omitido, que resuelve a
  // GRAVADO si no hay catálogo) - EXENTO/NO_GRAVADO siempre son tasa 0,
  // ver InvoicingService.resolveLineTax.
  @ValidateIf((o) => o.taxKind === undefined || o.taxKind === 'GRAVADO')
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  taxRate?: number;
}

export class CreateInvoiceDto {
  @IsUUID()
  customerId!: string;

  @IsEnum(DocumentLetter)
  documentLetter!: DocumentLetter;

  @IsString()
  pointOfSale!: string;

  @IsUUID()
  currencyId!: string;

  // Override puntual de la cotización de ESTE comprobante - si no viene, se
  // resuelve del historial (ExchangeRateHistory) como siempre. No tiene
  // efecto para la moneda base (su cotización siempre es 1, ver
  // InvoicingService.resolveExchangeRate).
  @IsOptional()
  @IsNumber()
  @IsPositive()
  exchangeRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  globalDiscountPercent?: number;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  // Si es true, cualquier `unitPrice` override en las líneas se interpreta
  // como precio final (con IVA incluido) en vez de neto - se desglosa por
  // línea usando la alícuota ya resuelta de esa línea (ver InvoicingService).
  // No afecta líneas EXENTO/NO_GRAVADO (tasa 0, nada que desglosar) ni
  // líneas sin unitPrice override (siguen usando el precio de catálogo,
  // que siempre es neto).
  @IsOptional()
  @IsBoolean()
  pricesIncludeTax?: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateInvoiceLineDto)
  lines!: CreateInvoiceLineDto[];

  // Percepciones/otros tributos (ej. IIBB) - opcional, la mayoría de las
  // facturas no llevan ninguno. Ver CreateInvoiceTaxLineDto.
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateInvoiceTaxLineDto)
  otherTaxLines?: CreateInvoiceTaxLineDto[];
}
