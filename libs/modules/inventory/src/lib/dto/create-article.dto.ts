import { UnitOfMeasure } from '@plexo/database';
import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateArticleDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(UnitOfMeasure)
  unitOfMeasure!: UnitOfMeasure;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsUUID()
  taxDefinitionId?: string;

  @IsOptional()
  @IsBoolean()
  isService?: boolean;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;

  @IsOptional()
  @IsBoolean()
  hasVariants?: boolean;

  // Marca manual de "este producto se fabrica" - sólo hace falta tildarlo acá
  // si se lo quiere elegir como "Producto a fabricar" en Recetas ANTES de
  // cargarle su primera receta. BomService.create() lo termina fijando en
  // true solo de cualquier forma en cuanto exista una receta.
  @IsOptional()
  @IsBoolean()
  isManufactured?: boolean;
}
