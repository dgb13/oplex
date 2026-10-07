import { IsString, MinLength } from 'class-validator';

/** Corregir el código (SKU) de una variante desde la ficha del artículo. El
 * precio va por su propio endpoint (deja historial de precios). */
export class UpdateArticleVariantDto {
  @IsString()
  @MinLength(1)
  sku!: string;
}
