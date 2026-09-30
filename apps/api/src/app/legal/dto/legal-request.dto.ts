import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** Botón de arrepentimiento (público): datos mínimos para identificar la
 * contratación que se revoca. */
export class WithdrawalRequestDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @IsEmail()
  @MaxLength(200)
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  taxId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;
}

/** Baja desde la app: nombre y email salen de la sesión. */
export class CancellationRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;
}
