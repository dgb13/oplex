import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import { PurchaseOrderLineDto } from './purchase-order-line.dto.js';

/** Only allowed while the PurchaseOrder is still DRAFT (see
 * PurchaseOrderService.update). */
export class UpdatePurchaseOrderDto {
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @IsOptional()
  @IsUUID()
  currencyId?: string;

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

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderLineDto)
  lines?: PurchaseOrderLineDto[];
}
