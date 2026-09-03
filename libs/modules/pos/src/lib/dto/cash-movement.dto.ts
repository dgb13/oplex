import { IsNumber, IsPositive, IsString, MinLength } from 'class-validator';

// amount siempre una magnitud positiva - el signo real (ingreso/egreso) lo
// decide el endpoint (POST .../cash-in vs .../cash-out), no este DTO. Mismo
// criterio que PostBankStatementAdjustmentJournalEntryInput.amount.
export class CashMovementDto {
  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsString()
  @MinLength(1)
  reason!: string;
}
