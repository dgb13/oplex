import { InvoicePdfFormat, PdfStyle } from '@plexo/database';
import { IsEnum, IsOptional } from 'class-validator';

export class UpdateInvoicingPreferencesDto {
  @IsOptional()
  @IsEnum(InvoicePdfFormat)
  invoicePdfFormat?: InvoicePdfFormat;

  @IsOptional()
  @IsEnum(PdfStyle)
  invoicePdfStyle?: PdfStyle;
}
