import { Type } from 'class-transformer';
import { IsArray, IsNumber, IsOptional, IsPositive, IsUUID, ValidateNested } from 'class-validator';

export class StockCheckLineDto {
  @IsUUID()
  articleVariantId!: string;

  @IsNumber()
  @IsPositive()
  quantity!: number;
}

// Antes de emitir: qué líneas no tienen stock suficiente en el depósito.
// Las líneas vienen de Nueva factura, o de la cotización (quoteId) en
// "Convertir a factura".
export class StockCheckDto {
  @IsUUID()
  warehouseId!: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StockCheckLineDto)
  lines?: StockCheckLineDto[];

  @IsOptional()
  @IsUUID()
  quoteId?: string;
}
