import { IsString, MinLength } from 'class-validator';

export class UploadArcaPadronCertificateDto {
  @IsString()
  @MinLength(1)
  certPem!: string;

  @IsString()
  @MinLength(1)
  keyPem!: string;
}
