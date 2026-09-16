import { CalendarEventKind } from '@plexo/database';
import { IsBoolean, IsDateString, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateCalendarEventDto {
  @IsString()
  @MinLength(1)
  title!: string;

  @IsDateString()
  startsAt!: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @IsOptional()
  @IsBoolean()
  allDay?: boolean;

  @IsOptional()
  @IsEnum(CalendarEventKind)
  kind?: CalendarEventKind;

  // Sin FK real a propósito (ver comentario del modelo en schema.prisma) -
  // el mismo par apunta a tablas distintas según linkType, ninguna
  // verificada acá.
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
