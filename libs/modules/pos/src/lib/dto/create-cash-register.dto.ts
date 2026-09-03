import { IsString, IsUUID, MinLength } from 'class-validator';

export class CreateCashRegisterDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsUUID()
  branchId!: string;

  @IsUUID()
  warehouseId!: string;

  // Resuelto por la composición-root (apps/api's PosService.createRegister,
  // que crea la FinancialAccount vía ReportsFinancialService primero) - un
  // lib module nunca importa el Service de otro, así que este service no
  // puede crearla él mismo.
  @IsUUID()
  financialAccountId!: string;
}
