import { MeasurementType, UnitOfMeasure } from '@plexo/database';
import { IsBoolean, IsEnum, IsNumber, IsOptional, IsPositive, IsString, IsUUID, MinLength } from 'class-validator';

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

  // Discriminador de cómo se mide/consume el stock (ver el comentario del
  // campo en schema.prisma) - existe desde la Fase 4 de Producción pero
  // hasta ahora ningún endpoint lo dejaba cargar, siempre quedaba en el
  // default DISCRETE. Sin @ValidateIf cruzado a propósito: el front sólo
  // manda los campos del tipo elegido, y el resto de measurementTypes
  // simplemente ignoran los que no les corresponden (mismo criterio laxo
  // que CreateBomLineDto con width/length/cutsCount).
  @IsOptional()
  @IsEnum(MeasurementType)
  measurementType?: MeasurementType;

  // CONTINUO: tamaño de la presentación de compra en la unidad base de
  // consumo (ej. 35000 = bolsa de 35kg).
  @IsOptional()
  @IsNumber()
  @IsPositive()
  purchaseSize?: number;

  // CONTINUO: unidad base de consumo (gr, ml) - puramente informativo.
  @IsOptional()
  @IsString()
  baseUnit?: string;

  // LINEAL_1D: largo de la barra/rollo comercial (mm).
  @IsOptional()
  @IsNumber()
  @IsPositive()
  commercialLength?: number;

  // LINEAL_1D: umbral de merma (mm) - un recorte por debajo de esto se
  // marca SCRAP en vez de quedar disponible como sobrante reutilizable.
  @IsOptional()
  @IsNumber()
  @IsPositive()
  minUsableLength?: number;

  // SURFACE_2D: dimensiones de la plancha estándar (mm).
  @IsOptional()
  @IsNumber()
  @IsPositive()
  sheetWidth?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  sheetLength?: number;
}
