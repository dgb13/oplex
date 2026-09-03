import { IsDateString, IsOptional, IsUUID } from 'class-validator';

/** Filtros de `/pos/history` (Fase 2) - compartido entre `GET /pos/sessions`
 * y `GET /pos/sessions/export`, mismo `@IsOptional()`/`@IsDateString()` que
 * VatBookQueryDto (libs/modules/taxes). `from`/`to` son fechas de calendario
 * (yyyy-mm-dd) filtradas contra `closedAt`, no timestamps completos - ver
 * CashSessionsService.listSessions para el criterio de "hasta fin del día".
 */
export class ListSessionsQueryDto {
  @IsOptional()
  @IsUUID()
  registerId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
