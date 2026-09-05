import { Transform } from 'class-transformer';
import { IsBoolean, IsDateString, IsIn, IsOptional, IsUUID } from 'class-validator';

// Alimenta tanto "Facturas" (sin filtros, como hoy) como "Galería IA" (ver
// GaleriaIaTab) - un único endpoint de listado, no uno separado por
// pantalla. aiScannedOnly/confidenceLevel/edited sólo tienen sentido para
// facturas que vinieron de "Carga con IA" (PurchaseInvoice.aiScanConfidence
// no null) - ver PurchaseInvoiceService.list().
export class ListPurchaseInvoicesQueryDto {
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  aiScannedOnly?: boolean;

  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  // Mismos umbrales que overallConfidence() en CargaIaTab.tsx (0.85/0.6) -
  // implica aiScannedOnly (una factura cargada a mano no tiene confianza
  // que filtrar).
  @IsOptional()
  @IsIn(['alta', 'media', 'baja'])
  confidenceLevel?: 'alta' | 'media' | 'baja';

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  edited?: boolean;
}
