import { IsDateString, IsOptional } from 'class-validator';

export class ScheduleProductionOrderDto {
  // null/ausente = sacar la programación.
  @IsOptional()
  @IsDateString()
  scheduledStartAt?: string | null;
}
