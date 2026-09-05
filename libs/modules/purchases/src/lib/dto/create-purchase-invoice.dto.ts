import { DocumentLetter } from '@plexo/database';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PurchaseInvoiceTaxLineDto } from './purchase-invoice-tax-line.dto.js';

/**
 * Factura de Compra - the supplier's own fiscal document. Two modes (see
 * PurchaseInvoiceService.create): tied to a PurchaseOrder (article-level
 * cost detail lives on PurchaseOrderLine), or a direct expense with no OC -
 * in that second mode, supplierId/currencyId must be sent directly (no PO
 * to derive them from) and goodsReceiptIds must be empty. Header-level on
 * purpose, no article-level lines: the user (or the AI scan) is
 * transcribing what's already priced and taxed on a piece of paper, not
 * recalculating per-article amounts again.
 */
export class CreatePurchaseInvoiceDto {
  @IsOptional()
  @IsUUID()
  purchaseOrderId?: string;

  // Requeridos sólo cuando no hay purchaseOrderId (validados en el service,
  // no acá - class-validator no tiene una forma limpia de expresar "A o B
  // pero no ninguno de los dos"). Con purchaseOrderId presente, se ignoran
  // si vienen (siempre se derivan de la orden, igual que hoy).
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @IsOptional()
  @IsUUID()
  currencyId?: string;

  // The supplier's own invoice number - free text, not a Plexo-generated
  // series (see GoodsReceipt.supplierDocNumber for the same convention).
  @IsString()
  @MinLength(1)
  supplierInvoiceNumber!: string;

  @IsDateString()
  supplierInvoiceDate!: string;

  // Estructurados y opcionales, sólo para el export Libro de IVA Digital
  // (RG 4597, ver CitiExportService en @plexo/taxes) - no reemplazan
  // supplierInvoiceNumber. Sin esto, el comprobante queda afuera de ese
  // export en vez de adivinar un código de comprobante ARCA.
  @IsOptional()
  @IsEnum(DocumentLetter)
  documentLetter?: DocumentLetter;

  @IsOptional()
  @IsString()
  pointOfSale?: string;

  @IsOptional()
  @IsString()
  number?: string;

  // Optional - see PurchaseInvoice.dueDate. Only invoices with one set show
  // up bucketed in the Cuentas a Pagar aging report.
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  // Net amount, pre-tax, as written on the supplier's invoice.
  @IsNumber()
  @IsPositive()
  subtotal!: number;

  // Remitos (GoodsReceipt) of this PurchaseOrder that this invoice clears
  // from the GRNI bridge - v1 is whole-receipt only (see
  // PurchaseInvoiceReceipt's @@unique). Optional/empty for a pure-services
  // order (Article.isService never gets a remito).
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  goodsReceiptIds?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseInvoiceTaxLineDto)
  taxLines?: PurchaseInvoiceTaxLineDto[];

  @IsOptional()
  @IsString()
  notes?: string;

  // Ambos ausentes = cargada a mano. Ambos presentes = vino de "Carga con
  // IA" (CargaIaTab), alimenta "Galería IA" - ver PurchaseInvoice.aiScanConfidence/
  // aiScanEdited en schema.prisma.
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  aiScanConfidence?: number;

  @IsOptional()
  @IsBoolean()
  aiScanEdited?: boolean;
}
