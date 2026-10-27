import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ASSET_FIELD_TYPES, VEHICLE_KINDS, type AssetFieldType, type VehicleKind } from '../asset-fields.js';

export class AssetFieldDefDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  key!: string;

  @IsString()
  @MaxLength(60)
  label!: string;

  @IsIn(ASSET_FIELD_TYPES)
  type!: AssetFieldType;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  options?: string[];

  @IsOptional()
  @IsIn(VEHICLE_KINDS)
  vehicleKind?: VehicleKind;

  @IsOptional()
  @IsBoolean()
  hidden?: boolean;
}

export class CreateCustomerAssetTypeDto {
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  name!: string;
}

export class UpdateCustomerAssetTypeDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  pluralName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  notice?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => AssetFieldDefDto)
  fields?: AssetFieldDefDto[];
}

export class CreateCustomerAssetDto {
  @IsUUID()
  typeId!: string;

  @IsUUID()
  companyId!: string;

  // Validado contra los campos del tipo en CustomerAssetsService (cleanValues).
  @IsObject()
  values!: Record<string, unknown>;
}

export class UpdateCustomerAssetDto {
  @IsOptional()
  @IsObject()
  values?: Record<string, unknown>;

  /** Cambio de dueño (auto vendido): el historial va con la ficha. */
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class ListCustomerAssetsQuery {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;

  @IsOptional()
  @IsUUID()
  typeId?: string;

  @IsOptional()
  @IsUUID()
  companyId?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  includeInactive?: string;
}

export class CheckIdentifierQuery {
  @IsUUID()
  typeId!: string;

  @IsString()
  @MaxLength(80)
  identifier!: string;

  @IsOptional()
  @IsUUID()
  excludeId?: string;
}
