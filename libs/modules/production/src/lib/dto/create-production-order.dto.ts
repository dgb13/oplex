import { IsNumber, IsPositive, IsUUID } from 'class-validator';

export class CreateProductionOrderDto {
  @IsUUID()
  outputArticleVariantId!: string;

  // Unidades enteras de producto final a producir - se produce entera, no
  // por tandas (ver ProductionOrder.quantity en el schema).
  @IsNumber()
  @IsPositive()
  quantity!: number;
}
