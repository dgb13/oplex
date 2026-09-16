import { IsDateString, IsOptional, IsString } from 'class-validator';

export class CalendarQueryDto {
  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;

  // CSV de CalendarEntrySource (ej. "tax,collect") - sin validar contra el
  // union acá, AgendaService descarta cualquier valor que no matchee.
  @IsOptional()
  @IsString()
  kinds?: string;
}
