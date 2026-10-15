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

  // Facturar aunque falte stock: lo que hay se entrega y el resto queda en
  // Ventas → Pendientes de entrega (ver SalesService.createSale). Sólo lo
  // manda Nueva factura / Convertir a factura después de que la persona
  // confirma el aviso; la Caja nunca (ahí no se vende sin stock).
  @IsOptional()
  @IsBoolean()
  allowPendingDelivery?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  globalDiscountPercent?: number;
}
