import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CreateBomLineDto {
  @IsUUID()
  inputArticleVariantId!: string;

  // Se interpreta según el measurementType del insumo (ver
  // ProductionPlanningService.computeProducible): DISCRETO=unidades,
  // CONTINUO=gr/ml, 1D=largo del corte (mm) x cutsCount, 2D=área.
  @IsNumber()
  @IsPositive()
  quantity!: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  width?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  length?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  cutsCount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  expectedWastePercent?: number;
}

export class CreateBomByproductDto {
  @IsUUID()
  outputArticleVariantId!: string;

  @IsNumber()
  @IsPositive()
  quantity!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  costSharePercent?: number;
}

export class CreateBomDto {
  @IsUUID()
  outputArticleVariantId!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateBomLineDto)
  lines!: CreateBomLineDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateBomByproductDto)
  byproducts?: CreateBomByproductDto[];
}
