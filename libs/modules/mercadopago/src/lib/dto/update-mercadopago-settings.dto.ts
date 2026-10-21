import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class UpdateMercadoPagoSettingsDto {
  @IsOptional()
  @IsBoolean()
  linksEnabled?: boolean;

  @IsOptional()
  @IsUUID()
  financialAccountId?: string;
}
