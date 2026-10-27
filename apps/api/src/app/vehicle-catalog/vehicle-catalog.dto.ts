import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { VEHICLE_KINDS, type VehicleKind } from '../customer-assets/asset-fields.js';

export class VehicleKindQuery {
  @IsOptional()
  @IsIn(VEHICLE_KINDS)
  kind?: VehicleKind;
}

export class CreateVehicleBrandDto {
  @IsIn(VEHICLE_KINDS)
  kind!: VehicleKind;

  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name!: string;
}

export class CreateVehicleModelDto {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name!: string;
}

export class UpdateVehicleCatalogItemDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsBoolean()
  reviewed?: boolean;
}

export class MergeVehicleSuggestionDto {
  @IsUUID()
  targetId!: string;
}
