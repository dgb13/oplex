import { Equals, IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class SignupDto {
  @IsString()
  @MinLength(1)
  tenantName!: string;

  @IsOptional()
  @IsString()
  taxId?: string;

  @IsOptional()
  @IsString()
  ownerName?: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  // Casilla obligatoria "Acepto los Términos y la Política de Privacidad" -
  // sin esto no hay alta (la aceptación queda registrada, ver LegalService).
  @Equals(true, { message: 'Tenés que aceptar los Términos y Condiciones y la Política de Privacidad' })
  acceptTerms!: boolean;
}
