import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import { PurchaseOrderLineDto } from './purchase-order-line.dto.js';

/** Standalone creation - no QuoteRequest involved (see
 * QuoteRequestService.convert for the other way a PurchaseOrder is born). */
export class CreatePurchaseOrderDto {
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
  @Type(() => PurchaseOrderLineDto)
  lines!: PurchaseOrderLineDto[];
}
