import { DocumentLetter } from '@plexo/database';
import { IsBoolean, IsDateString, IsEnum, IsNumber, IsOptional, IsUUID, Max, Min } from 'class-validator';

// Los campos que "Convertir a factura" no puede sacar de la Cotización
// (customerId/lines/currencyId sí salen de ahí, ver
// SalesService.createInvoiceFromQuote) - mismos campos que CreateSaleDto
// pide hoy en NewInvoiceModal.tsx para una venta directa.
export class CreateInvoiceFromQuoteDto {
  @IsUUID()
  warehouseId!: string;

  @IsEnum(DocumentLetter)
  documentLetter!: DocumentLetter;

  @IsUUID()
  branchId!: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsBoolean()
  pricesIncludeTax?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  globalDiscountPercent?: number;
}
