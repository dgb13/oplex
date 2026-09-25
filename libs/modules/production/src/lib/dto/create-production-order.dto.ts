import { IsDateString, IsNumber, IsOptional, IsPositive, IsUUID } from 'class-validator';

export class CreateProductionOrderDto {
  @IsUUID()
  outputArticleVariantId!: string;

  // Unidades enteras de producto final a producir - se produce entera, no
  // por tandas (ver ProductionOrder.quantity en el schema).
  @IsNumber()
  @IsPositive()
  quantity!: number;

  // Cuándo se piensa empezar a fabricar (puede ser la semana que viene) -
  // los insumos se reservan igual al confirmar, no en esta fecha. Sin
  // valor, la orden queda sin programar (como las de antes del campo).
  @IsOptional()
  @IsDateString()
  scheduledStartAt?: string;
}
