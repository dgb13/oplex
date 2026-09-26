import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/**
 * Datos propios de la empresa (Tenant) que se editan en Preferencias →
 * "Conexión con ARCA", paso 1: el CUIT (a nombre del cual está el
 * certificado, ver AfipCredentialsService) y la razón social (Tenant.name,
 * que sale como emisor en los comprobantes y en el CSR que genera Oplex).
 * Ambos opcionales: se manda sólo lo que cambió. El CUIT se valida sólo en
 * formato - la validación real es ARCA rechazando uno inválido.
 */
export class UpdateTenantInfoDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{2}-?\d{8}-?\d{1}$/, { message: 'taxId debe ser un CUIT válido (11 dígitos)' })
  taxId?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  legalName?: string;
}
