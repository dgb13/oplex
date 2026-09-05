import { IsBoolean } from 'class-validator';

export class UpdateAiInvoiceScanSettingsDto {
  @IsBoolean()
  enabled!: boolean;
}
