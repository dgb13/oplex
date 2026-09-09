import { IsInt, IsOptional, IsString, Min, ValidateIf } from 'class-validator';

export class UpdateAssistantSettingsDto {
  /** null limpia el nombre (cae al genérico "Asistente Oplex" en el
   * frontend) - mismo criterio que TenantSettings.reminderCcEmail. Omitido
   * (undefined) deja el nombre actual sin tocar - permite que el form de
   * rate limit se guarde solo, sin pisar el nombre. */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  assistantDisplayName?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  assistantRateLimitWindowMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  assistantRateLimitMaxMessages?: number;
}
