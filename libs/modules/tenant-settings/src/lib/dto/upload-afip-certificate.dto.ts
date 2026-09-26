import { AfipEnvironment } from '@plexo/database';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

/**
 * certPem/keyPem are pasted-in PEM text, not a binary file upload - the
 * frontend reads the file as text (FileReader) and sends its contents here.
 * No file-storage infra involved on purpose: these are secrets, so the only
 * place they land is encrypted in Postgres (see
 * TenantSettingsService.uploadAfipCertificate), never a shared disk path.
 *
 * keyPem es opcional: si la clave la generó Oplex ("Generar clave y
 * pedido"), se usa esa. env también: se deduce de quién emitió el
 * certificado ("Computadores Test" = homologación); si viene y no coincide,
 * se rechaza en vez de guardar un certificado que ARCA va a rechazar.
 */
export class UploadAfipCertificateDto {
  @IsString()
  @MinLength(1)
  certPem!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  keyPem?: string;

  @IsOptional()
  @IsEnum(AfipEnvironment)
  env?: AfipEnvironment;
}
