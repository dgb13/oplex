import { IsLatitude, IsLongitude, IsNotEmpty, IsNumber, IsPositive, IsString, IsUUID, MaxLength } from 'class-validator';

// Lo que Mercado Pago pide para dar de alta la sucursal (POST
// /users/{id}/stores) - la publica en el mapa de su app.
export class ActivateRegisterQrDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  streetName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  streetNumber!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  cityName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  stateName!: string;

  @IsLatitude()
  latitude!: number;

  @IsLongitude()
  longitude!: number;
}

export class CreateQrChargeDto {
  @IsUUID()
  registerId!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount!: number;
}
