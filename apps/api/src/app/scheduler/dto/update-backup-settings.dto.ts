import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class UpdateBackupSettingsDto {
  @IsOptional()
  @IsIn([12, 24, 48, 168])
  frequencyHours?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  hour?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  keepLocal?: number;

  @IsOptional()
  @IsInt()
  @Min(7)
  @Max(365)
  keepOffsiteDays?: number;
}
