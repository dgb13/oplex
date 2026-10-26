import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { BUSINESS_FAMILIES, BUSINESS_MODULE_KEYS } from '../business-modules.js';

/** La parte de la config que se edita desde /admin/rubros en esta etapa.
 * assetType y workOrder (fichas y órdenes de trabajo, etapas 3 y 4) no se
 * reciben acá: el servicio los conserva tal cual estaban. */
export class BusinessTemplateConfigDto {
  @IsArray()
  @IsIn(BUSINESS_MODULE_KEYS, { each: true })
  modules!: string[];

  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  suggestedCategories!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  defaultWarranty?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  notice?: string;
}

// Nombre de un ícono de lucide-react ("Car", "PawPrint").
const ICON_KEY = /^[A-Z][A-Za-z0-9]{1,40}$/;

export class CreateBusinessTemplateDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @IsIn(BUSINESS_FAMILIES)
  family!: string;

  @Matches(ICON_KEY)
  iconKey!: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @ValidateNested()
  @Type(() => BusinessTemplateConfigDto)
  config!: BusinessTemplateConfigDto;
}

export class UpdateBusinessTemplateDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsIn(BUSINESS_FAMILIES)
  family?: string;

  @IsOptional()
  @Matches(ICON_KEY)
  iconKey?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => BusinessTemplateConfigDto)
  config?: BusinessTemplateConfigDto;
}

export class ChooseBusinessTemplateDto {
  @IsString()
  @MaxLength(80)
  key!: string;
}

export class UpdateEnabledModulesDto {
  @IsArray()
  @IsIn(BUSINESS_MODULE_KEYS, { each: true })
  enabledModules!: string[];
}

export class CreateBusinessTemplateRequestDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  text!: string;
}

export class UpdateBusinessTemplateRequestDto {
  @IsIn(['NEW', 'DONE', 'DISCARDED'])
  status!: string;
}
