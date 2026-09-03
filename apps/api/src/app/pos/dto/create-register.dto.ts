import { IsString, IsUUID, MinLength } from 'class-validator';

// Sin financialAccountId acá (a diferencia de CreateCashRegisterDto de
// @plexo/pos) - PosService.createRegister la crea vía ReportsFinancialService
// antes de delegar en CashRegistersService.create, así el caller nunca tiene
// que crear la cuenta financiera a mano primero.
export class CreateRegisterDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsUUID()
  branchId!: string;

  @IsUUID()
  warehouseId!: string;
}
