import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

// "Marcar como resuelto" un comprobante que ARCA autorizó y Oplex no tiene
// (ver InvoicingService.resolveUnregisteredVoucher). OTHER exige la nota.
export class ResolveUnregisteredVoucherDto {
  @IsIn(['OTHER_SYSTEM', 'TEST', 'OTHER'])
  reason!: 'OTHER_SYSTEM' | 'TEST' | 'OTHER';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
