import { IsString, Matches } from 'class-validator';

export class RequestWhatsAppLinkDto {
  // Validación laxa a propósito - la normalización real (a dígitos + "+"
  // adelante) la hace WhatsAppLinkService.normalizePhone(), esto sólo
  // rechaza basura obvia antes de llegar ahí.
  @IsString()
  @Matches(/^[0-9+\s()-]{6,20}$/, { message: 'Número de teléfono inválido' })
  phone!: string;
}
