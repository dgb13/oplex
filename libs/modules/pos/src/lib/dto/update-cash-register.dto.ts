import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

/** Renombrar y/o togglear `active` (Fase 2, /settings/pos). Desactivar con
 * un turno OPEN se rechaza en CashRegistersService.update - mismo criterio
 * de invariante que el resto del módulo (nunca dejar un estado ambiguo a
 * mitad de camino). */
export class UpdateCashRegisterDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
