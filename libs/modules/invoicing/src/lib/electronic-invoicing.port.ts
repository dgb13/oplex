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
  /** Company.taxCondition del cliente (texto del padrón, p. ej.
   * "Responsable Inscripto") - se mapea a CondicionIVAReceptorId (RG 5616).
   * Irrelevante sin CUIT (va Consumidor Final). */
  customerTaxCondition: string | null;
  /** CondicionIVAReceptorId ya resuelto (p. ej. copiado de lo que ARCA
   * informa del comprobante que se anula) - tiene prioridad sobre
   * customerTaxCondition. */
  condicionIvaReceptorId?: number;
  /** Sólo para el mensaje de error si falta la condición IVA. */
  customerName?: string;
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

/** Lo que ARCA informa de un comprobante ya autorizado (FECompConsultar). */
export interface AuthorizedVoucher {
  cae: string | null;
  issueDate: Date | null;
  /** Tal cual lo devuelve ARCA (ImpTotal), sin convertir a Decimal acá. */
  total: string | null;
  customerDocNumber: string | null;
  /** Todo lo necesario para emitir una nota de crédito que lo anule con los
   * mismos importes (InvoicingService.cancelUnregisteredVoucher). null si
   * ARCA usó algo que Oplex no sabe mapear de vuelta (otra moneda, otra
   * alícuota, otro tipo de documento). */
  detail: AuthorizedVoucherDetail | null;
}

export interface AuthorizedVoucherDetail {
  concept: InvoiceConcept;
  /** null = Consumidor Final (DocTipo 99); si no, el CUIT (DocTipo 80). */
  customerTaxId: string | null;
  /** Si ARCA lo informa; si no, se resuelve con la ficha del cliente. */
  condicionIvaReceptorId: number | null;
  currencyCode: string;
  exchangeRate: Prisma.Decimal;
  netAmount: Prisma.Decimal;
  exemptAmount: Prisma.Decimal;
  nonTaxedAmount: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  total: Prisma.Decimal;
  taxLines: ElectronicInvoiceTaxLine[];
  otherTaxes: ElectronicOtherTax[];
}

/** Comprobante a numerar/consultar: tipo + letra resuelven el CbteTipo de
 * ARCA (ver CBTE_TIPO en afip-wsfe-client.ts). */
export interface VoucherSequence {
  kind: ElectronicVoucherKind;
  documentLetter: DocumentLetter;
  pointOfSale: string;
}

/**
 * Stands in for AFIP's WSFE web service (real integration needs the
 * tenant's own AFIP certificates/CUIT and homologation testing - not
 * something to fake here). schema.afipCae/afipCaeExpiry already exist on
 * Invoice so wiring in a real implementation later is additive.
 */
export interface ElectronicInvoicingPort {
  requestCae(invoice: ElectronicInvoiceRequest): Promise<ElectronicInvoiceResult>;
  /** Último número autorizado por ARCA en esa secuencia (0 si ninguno) -
   * la fuente de verdad de la numeración, no lo que Oplex tiene guardado. */
  lastAuthorizedNumber(sequence: VoucherSequence): Promise<number>;
  getAuthorizedVoucher(sequence: VoucherSequence, number: number): Promise<AuthorizedVoucher>;
}

export const ELECTRONIC_INVOICING = Symbol('ELECTRONIC_INVOICING');
