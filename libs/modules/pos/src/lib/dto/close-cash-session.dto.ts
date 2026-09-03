import { Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { ARS_DENOMINATION_VALUES, type DenominationKind } from '../ars-denominations.js';

/** Una fila del desglose de billetes/monedas (Fase 2, estilo Odoo). `kind`
 * además de `denomination` porque $100 existe como billete y como moneda a
 * la vez - ver el comentario en ars-denominations.ts. La validación aquí es
 * sólo de forma (denomination es un valor ARS válido en general); que
 * kind+denomination formen un par real (p.ej. no "moneda de $2000") lo
 * valida CashSessionsService.closeSession contra ARS_DENOMINATIONS, la
 * misma fuente de verdad que usa para recalcular el total. */
export class DenominationBreakdownItemDto {
  @IsIn(['BILL', 'COIN'])
  kind!: DenominationKind;

  @IsNumber()
  @IsIn(ARS_DENOMINATION_VALUES)
  denomination!: number;

  @IsInt()
  @Min(0)
  count!: number;
}

export class CloseCashSessionDto {
  @IsNumber()
  @Min(0)
  countedAmount!: number;

  @IsOptional()
  @IsString()
  notes?: string;

  // Opcional - sólo llega si el cajero usó el modo "Desglose por billetes"
  // en vez de tipear un total a mano (modo simple, sin cambios). Cuando
  // llega, es la fuente de verdad real de countedAmount: el servidor
  // recalcula Σ(denomination × count) e ignora el `countedAmount` de arriba
  // (que el front igual manda, por prolijidad de payload, pero nunca se
  // confía en él) - ver CashSessionsService.closeSession.
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DenominationBreakdownItemDto)
  denominationBreakdown?: DenominationBreakdownItemDto[];
}
