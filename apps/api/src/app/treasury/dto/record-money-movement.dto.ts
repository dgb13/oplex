import { MONEY_CONCEPTS, type MoneyConcept } from '@plexo/accounting';
import { IsDateString, IsIn, IsNumber, IsOptional, IsPositive, IsString, IsUUID } from 'class-validator';

// "Nuevo movimiento" de Tesorería. Contra qué va: concept (uno de los
// frecuentes) o accountingAccountId (otra cuenta del plan) - exactamente uno,
// se valida en TreasuryService.recordManualMovement.
export class RecordMoneyMovementDto {
  @IsUUID()
  financialAccountId!: string;

  @IsIn(['IN', 'OUT'])
  direction!: 'IN' | 'OUT';

  // Siempre positivo: el signo lo pone direction.
  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsOptional()
  @IsIn(MONEY_CONCEPTS.map((c) => c.key))
  concept?: MoneyConcept;

  @IsOptional()
  @IsUUID()
  accountingAccountId?: string;

  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  @IsOptional()
  @IsString()
  externalRef?: string;
}
