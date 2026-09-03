import { Type } from 'class-transformer';
import { IsArray, IsNumber, IsOptional, IsUUID, Min, ValidateNested } from 'class-validator';
import { DenominationBreakdownItemDto } from './close-cash-session.dto.js';

export class OpenCashSessionDto {
  @IsUUID()
  registerId!: string;

  @IsNumber()
  @Min(0)
  openingAmount!: number;

  // Opcional - sólo llega si el cajero entrante usó el modo "Desglose por
  // billetes" para contar el efectivo inicial (Fase 3, simétrico al mismo
  // modo ya existente en el cierre). Cuando llega, es la fuente de verdad
  // real de openingAmount: el servidor recalcula Σ(denomination × count) e
  // ignora el `openingAmount` de arriba (el front igual lo manda por
  // prolijidad de payload, pero nunca se confía en él) - ver
  // CashSessionsService.openSession, mismo criterio que closeSession ya
  // aplica para countedAmount.
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DenominationBreakdownItemDto)
  denominationBreakdown?: DenominationBreakdownItemDto[];
}
