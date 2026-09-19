import { UnitOfMeasure } from '@plexo/database';
import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min, MinLength } from 'class-validator';

export class UpdateArticleDto {
  @IsOptional()
  @IsBoolean()
  isService?: boolean;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;

  // null clears it (article has no preferred supplier); omitted leaves it
  // untouched. IsOptional treats both undefined and null as "skip
  // validation", so an explicit null still reaches the service layer.
  @IsOptional()
  @IsUUID()
  preferredSupplierId?: string | null;

  // null vuelve a "sin override" (usa TenantSettings.defaultMarkupPercent);
  // omitido deja el valor guardado sin tocar - misma convención que
  // preferredSupplierId de arriba.
  @IsOptional()
  @IsNumber()
  @Min(0)
  markupPercent?: number | null;

  // "Dato extra" - null lo vacía, omitido no lo toca (misma convención que
  // preferredSupplierId/markupPercent de arriba).
  @IsOptional()
  @IsString()
  description?: string | null;

  // "Eliminar"/reactivar un artículo (soft delete, ver Article.active).
  // InventoryService.updateArticle rechaza el pasaje a false si el
  // artículo está en producción.
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string | null;

  @IsOptional()
  @IsBoolean()
  isManufactured?: boolean;

  // Unidad "simple" (UNIT/KG/etc.) - distinta de measurementType, que
  // queda fija una vez creado el artículo (ver el comentario de ese campo
  // en schema.prisma). Esta sí se puede corregir después (típicamente un
  // error de carga, ej. cargaron "UNIT" y era "KG").
  @IsOptional()
  @IsEnum(UnitOfMeasure)
  unitOfMeasure?: UnitOfMeasure;
}
