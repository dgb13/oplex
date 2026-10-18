import { IsBoolean, IsInt, IsNumber, IsOptional, IsUUID, Min } from 'class-validator';

/** Stock inicial de un artículo por largo (alta guiada): N barras enteras
 * del largo comercial, a un costo por barra. */
export class RecordInitialBarsDto {
  @IsUUID()
  warehouseId!: string;

  @IsUUID()
  articleVariantId!: string;

  @IsInt()
  @Min(1)
  bars!: number;

  @IsNumber()
  @Min(0)
  costPerBar!: number;

  // Igual que RecordStockMovementDto.costIncludesVat: cómo lo escribió el usuario.
  @IsOptional()
  @IsBoolean()
  costIncludesVat?: boolean;
}
