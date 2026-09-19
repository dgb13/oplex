import { IsEmail, IsOptional, IsString } from 'class-validator';

// Todo opcional - sin body, sendEmail() sigue mandando al email
// institucional del proveedor exactamente como antes (comportamiento por
// defecto sin cambios). `to`/contactName llegan cuando el usuario elige un
// contacto puntual en SendPurchaseOrderDialog en vez de la casilla
// institucional - mismo criterio que MarkSentWhatsappDto.
export class SendPurchaseOrderEmailDto {
  @IsOptional()
  @IsEmail()
  to?: string;

  @IsOptional()
  @IsString()
  contactName?: string;

  @IsOptional()
  @IsString()
  contactAvatarUrl?: string;
}
