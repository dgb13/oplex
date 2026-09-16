import { CalendarEventKind, CalendarEventStatus } from '@plexo/database';
import { IsBoolean, IsDateString, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateCalendarEventDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @IsOptional()
  @IsBoolean()
  allDay?: boolean;

  @IsOptional()
  @IsEnum(CalendarEventKind)
  kind?: CalendarEventKind;

  @IsOptional()
  @IsEnum(CalendarEventStatus)
  status?: CalendarEventStatus;

  @IsOptional()
  @IsString()
  linkType?: string;

  @IsOptional()
  @IsString()
  linkId?: string;

  @IsOptional()
  @IsString()
  assignedTo?: string;
}
