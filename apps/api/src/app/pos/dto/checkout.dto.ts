import { DocumentLetter } from '@plexo/database';
import { CreateInvoiceLineDto, ReceiptCheckDto } from '@plexo/invoicing';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

// Sin invoiceId (a diferencia de RecordReceiptDto) - todavía no existe
// hasta que PosService.checkout crea la venta; método libre, mismo dominio
// que Receipt.method (ver ReceiptModal.tsx: 'CASH' | 'BANK_TRANSFER' |
// 'CARD' | 'CHECK', acá se suma 'MERCADOPAGO'). PosService detecta la
// porción en efectivo comparando contra 'CASH' literal.
export class CheckoutPaymentDto {
  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsString()
  method!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ReceiptCheckDto)
  check?: ReceiptCheckDto;
}

export class CheckoutDto {
  @IsUUID()
  registerId!: string;

  // Si no llega, PosService la resuelve (y crea si hace falta) contra
  // "Consumidor Final" - ver PosService.resolveDefaultCustomer.
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsEnum(DocumentLetter)
  documentLetter!: DocumentLetter;

  @IsUUID()
  currencyId!: string;

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
  @IsBoolean()
  pricesIncludeTax?: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateInvoiceLineDto)
  lines!: CreateInvoiceLineDto[];

  // Pago dividido: la suma tiene que calzar exacto con Invoice.total
  // (PosService la valida DESPUÉS de crear la venta, no antes - el total
  // real recién se conoce una vez que InvoicingService calculó impuestos/
  // descuentos; si no calza, el throw revierte toda la transacción,
  // incluida la factura recién creada, mismo criterio de atomicidad que el
  // resto del sistema vía getTenantDb()).
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CheckoutPaymentDto)
  payments!: CheckoutPaymentDto[];
}
