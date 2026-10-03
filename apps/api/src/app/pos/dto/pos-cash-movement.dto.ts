import { MONEY_CONCEPTS, type MoneyConcept } from '@plexo/accounting';
import { CashMovementDto } from '@plexo/pos';
import { IsIn, IsOptional, IsUUID } from 'class-validator';

/**
 * Ingreso/egreso de efectivo de la Caja con lo que es, para asentarlo (ver
 * PosService.recordCashMovement):
 * - TRANSFER: la plata va a (o viene de) otra cuenta de dinero propia -
 *   financialAccountId.
 * - EXPENSE / INCOME: un gasto o un ingreso - concept.
 * - PARTNER: retiro (egreso) o aporte (ingreso) de un socio.
 */
export class PosCashMovementDto extends CashMovementDto {
  @IsIn(['TRANSFER', 'EXPENSE', 'PARTNER', 'INCOME'])
  kind!: 'TRANSFER' | 'EXPENSE' | 'PARTNER' | 'INCOME';

  @IsOptional()
  @IsUUID()
  financialAccountId?: string;

  @IsOptional()
  @IsIn(MONEY_CONCEPTS.map((c) => c.key))
  concept?: MoneyConcept;
}
