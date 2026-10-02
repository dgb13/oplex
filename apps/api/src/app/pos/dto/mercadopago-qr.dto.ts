import { Type } from 'class-transformer';
import {
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { CheckoutSaleDto } from './checkout.dto.js';

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

  // La venta que paga este cobro, para retomarla desde "Cobros con QR sin
  // venta" si el pago se acredita y la venta no se confirma. Opcional para
  // no romper a un front viejo abierto en otra pestaña.
  @IsOptional()
  @ValidateNested()
  @Type(() => CheckoutSaleDto)
  sale?: CheckoutSaleDto;
}
