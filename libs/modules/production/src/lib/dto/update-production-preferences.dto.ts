import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class UpdateProductionPreferencesDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(12)
  @Matches(/^[A-Za-z0-9]+$/, { message: 'productionOrderPrefix must be letters/numbers only' })
  productionOrderPrefix?: string;
}
