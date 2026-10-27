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
import { ASSET_FIELD_TYPES, VEHICLE_KINDS, type VehicleKind } from '../../customer-assets/asset-fields.js';
import { BUSINESS_FAMILIES, BUSINESS_MODULE_KEYS } from '../business-modules.js';
import { QUOTE_OUTCOMES, type QuoteOutcome } from '../../work-orders/dto/work-order.dto.js';

export class TemplateAssetFieldDto {
  /** Vacío en un campo nuevo: se arma a partir del nombre. */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  key?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(60)
  label!: string;

  @IsIn(ASSET_FIELD_TYPES)
  type!: (typeof ASSET_FIELD_TYPES)[number];

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsBoolean()
  isIdentifier?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  options?: string[];

  @IsOptional()
  @IsIn(VEHICLE_KINDS)
  vehicleKind?: VehicleKind;
}

export class TemplateAssetTypeDto {
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  notice?: string;

  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => TemplateAssetFieldDto)
  fields!: TemplateAssetFieldDto[];
}

export class TemplateStatusDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  name!: string;

  @IsOptional()
  @IsBoolean()
  final?: boolean;

  @IsOptional()
  @IsBoolean()
  notifiesCustomer?: boolean;

  @IsOptional()
  @IsIn(QUOTE_OUTCOMES)
  quoteOutcome?: QuoteOutcome;
}

export class TemplateWorkOrderDto {
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  docName!: string;

  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => TemplateStatusDto)
  statuses!: TemplateStatusDto[];
}

/** Config de un rubro que se edita desde /admin/rubros. assetType y
 * workOrder: undefined = se conservan como estaban; null = el rubro deja de
 * traer ficha / órdenes de trabajo. */
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

  @IsOptional()
  @ValidateNested()
  @Type(() => TemplateAssetTypeDto)
  assetType?: TemplateAssetTypeDto | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => TemplateWorkOrderDto)
  workOrder?: TemplateWorkOrderDto | null;
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

export class ApplyTemplateUpdatesDto {
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  ids!: string[];
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
