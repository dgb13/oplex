import type { DocumentLetter, InvoiceConcept, Prisma } from '@plexo/database';

/** FACTURA selects AFIP's Factura CbteTipo family (1/6/11/51 for A/B/C/M),
 * NOTA_CREDITO selects the matching Nota de Crédito family (3/8/13/53) -
 * see CBTE_TIPO in afip-wsfe-client.ts. No Nota de Débito: nothing in this
 * app issues one. */
export type ElectronicVoucherKind = 'FACTURA' | 'NOTA_CREDITO';

/** One row per distinct IVA rate present on the voucher's lines - AFIP's
 * FECAESolicitar wants the tax discriminated by alicuota (Iva[]), not just
 * a single total. */
export interface ElectronicInvoiceTaxLine {
  rate: Prisma.Decimal;
  netAmount: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
}

/** One "otro tributo" (ej. Percepción IIBB) - AFIP's Tributos[] array in
 * FECAESolicitar. `id` is AFIP's own Tributo type code (1 Nacional/2
 * Provincial/3 Municipal/4 Interno/99 Otro - see AFIP_TRIBUTO_ID in
 * invoicing.service.ts), not InvoiceTaxLineKind itself. */
export interface ElectronicOtherTax {
  id: number;
  desc: string;
  baseImp: Prisma.Decimal;
  alic: Prisma.Decimal;
  importe: Prisma.Decimal;
}

/** invoiceLetter/pointOfSale/number of the ORIGINAL Invoice being credited -
 * only present for kind: 'NOTA_CREDITO', where AFIP requires the CbtesAsoc
 * association. Separate from this voucher's own documentLetter/pointOfSale/
 * number (the credit note's), even though pointOfSale is always the same
 * value in practice (same branch). */
export interface AssociatedVoucher {
  documentLetter: DocumentLetter;
  pointOfSale: string;
  number: string;
}

export interface ElectronicInvoiceRequest {
  kind: ElectronicVoucherKind;
  documentLetter: DocumentLetter;
  /** AFIP Concepto (1/2/3) - mapped in afip-wsfe-client.ts. Determines
   * whether FchServDesde/FchServHasta/FchVtoPago are sent at all (AFIP
   * rejects the request if they're present for PRODUCTOS, and requires them
   * for anything else). */
  concept: InvoiceConcept;
  pointOfSale: string;
  number: string;
  issueDate: Date;
  /** Only meaningful when concept !== 'PRODUCTOS' (→ FchVtoPago). This app
   * doesn't track a real service period (Article/InvoiceLine have no
   * "rendered from/to" dates) - v1 simplification: FchServDesde/FchServHasta
   * both use issueDate (service assumed same-day as the invoice), and
   * FchVtoPago uses this dueDate if set, else also issueDate. See
   * afip-wsfe-client.ts. */
  dueDate: Date | null;
  /** null = Consumidor Final (AFIP DocTipo 99/DocNro 0) - this app only
   * models Company.taxId as a CUIT, so anything else maps to DocTipo 80. */
  customerTaxId: string | null;
  /** Currency.code (e.g. "ARS"/"USD"), mapped to AFIP's own MonId vocabulary
   * in afip-wsfe-client.ts - not the same table as ISO 4217. */
  currencyCode: string;
  exchangeRate: Prisma.Decimal;
  /** GRAVADO-only net amount (→ AFIP's ImpNeto) - excludes exemptAmount/
   * nonTaxedAmount, which are reported separately. Before those two fields
   * existed this was the invoice's whole subtotal; now it's just the taxed
   * slice of it. */
  netAmount: Prisma.Decimal;
  /** Sum of EXENTO lines' netAmount (→ AFIP's ImpOpEx) - operations exempt
   * from VAT by law (see TaxCalculationType.EXENTO). Zero when the voucher
   * has no exempt lines. */
  exemptAmount: Prisma.Decimal;
  /** Sum of NO_GRAVADO lines' netAmount (→ AFIP's ImpTotConc) - operations
   * outside VAT's scope entirely, neither taxed nor exempt (see
   * TaxCalculationType.NO_GRAVADO). Zero when the voucher has no
   * non-taxed lines. */
  nonTaxedAmount: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  total: Prisma.Decimal;
  taxLines: ElectronicInvoiceTaxLine[];
  /** Percepciones/otros tributos (→ AFIP's Tributos[] + ImpTrib) - vacío u
   * omitido en la enorme mayoría de comprobantes, que no cobran ninguno. */
  otherTaxes?: ElectronicOtherTax[];
  associatedVoucher?: AssociatedVoucher;
}

export interface ElectronicInvoiceResult {
  cae: string;
  caeExpiry: Date;
}

/**
 * Stands in for AFIP's WSFE web service (real integration needs the
 * tenant's own AFIP certificates/CUIT and homologation testing - not
 * something to fake here). schema.afipCae/afipCaeExpiry already exist on
 * Invoice so wiring in a real implementation later is additive.
 */
export interface ElectronicInvoicingPort {
  requestCae(invoice: ElectronicInvoiceRequest): Promise<ElectronicInvoiceResult>;
}

export const ELECTRONIC_INVOICING = Symbol('ELECTRONIC_INVOICING');
