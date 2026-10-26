import type { DocumentLetter, InvoiceConcept, Tenant, TenantSettings } from '@plexo/database';
import { buildVariantLabel } from '@plexo/types';
import { CBTE_TIPO, classifyTaxId, resolveCondicionIvaReceptor } from '../afip-wsfe-client.js';
import { amountInWords } from './amount-in-words.js';
import { buildAfipQrDataUri } from './qr.util.js';
import type {
  InvoicePdfData,
  InvoicePdfImage,
  InvoicePdfKind,
  InvoicePdfLine,
  InvoicePdfTotalRow,
  InvoiceVatMode,
} from './pdf-data.js';

type Decimalish = { toNumber(): number };

/** Una línea de factura, o la parte acreditada de una (ver
 * InvoicingService.generateCreditNotePdf): mismo shape que InvoiceLine.
 * netAmount es el neto con la bonificación de la línea pero ANTES del
 * descuento general; lineTotal ya tiene el descuento general y el IVA. */
export interface PdfSourceLine {
  quantity: Decimalish;
  unitPrice: Decimalish;
  discountType: string;
  discountValue: Decimalish;
  netAmount: Decimalish;
  taxRate: Decimalish;
  taxKind: string;
  lineTotal: Decimalish;
  articleVariant: {
    sku: string;
    color?: string | null;
    size?: string | null;
    brand?: string | null;
    attributes?: unknown;
    // imageUrl lo lee InvoicingService para el estilo Natural.
    article: { name: string; unitOfMeasure?: string | null; imageUrl?: string | null };
  };
}

/** Factura o nota de crédito, con los datos del cliente ya resueltos (los
 * guardados al emitir o, en comprobantes viejos, los de la ficha). */
export interface PdfSourceDocument {
  kind: InvoicePdfKind;
  documentLetter: DocumentLetter;
  pointOfSale: string;
  number: string;
  concept: InvoiceConcept;
  issueDate: Date;
  dueDate: Date | null;
  customerName: string;
  customerTaxId: string | null;
  customerTaxCondition: string | null;
  customerFiscalAddress: string | null;
  /** La condición del emisor guardada al emitir (null en C viejas). */
  issuerTaxCondition: string | null;
  globalDiscountPercent: Decimalish;
  total: Decimalish & { toString(): string };
  exchangeRate: Decimalish & { toString(): string };
  currency: { code: string; isBase: boolean };
  afipCae: string | null;
  afipCaeExpiry: Date | null;
  notes: string | null;
  lines: PdfSourceLine[];
  saleCondition: string;
  associatedDocument?: string | null;
  reason?: string | null;
}

/** Imágenes ya leídas de disco por InvoicingService (este archivo no hace I/O). */
export interface PdfSourceImages {
  logo: InvoicePdfImage | null;
  /** Por índice de línea. */
  lineImages: (InvoicePdfImage | null)[];
}

/** Percepciones/otros tributos de la factura (InvoiceTaxLine). */
export interface InvoicePdfOtherTax {
  kind: string;
  concept: string;
  amount: Decimalish;
}

const TAX_CONDITION_LABEL: Record<string, string> = {
  RESPONSABLE_INSCRIPTO: 'IVA Responsable Inscripto',
  MONOTRIBUTO: 'Responsable Monotributo',
  EXENTO: 'IVA Exento',
};

const CONCEPT_LABEL: Record<string, string> = {
  PRODUCTOS: 'Productos',
  SERVICIOS: 'Servicios',
  PRODUCTOS_Y_SERVICIOS: 'Productos y servicios',
};

const OTHER_TAX_LABEL: Record<string, string> = {
  NATIONAL: 'Impuesto nacional',
  PROVINCIAL: 'Percepción IIBB',
  MUNICIPAL: 'Tasa municipal',
  INTERNAL: 'Impuestos internos',
  OTHER: 'Otros tributos',
};

const UNIT_LABELS: Record<string, string> = { UNIT: 'u.', KG: 'kg', LTR: 'l', MM: 'mm', M2: 'm²' };

/** RG 5003/2021 (Ley 27.618): factura A de un RI a un monotributista. */
export const MONOTRIBUTO_CREDIT_LEGEND =
  'El crédito fiscal discriminado en el presente comprobante, sólo podrá ser computado a efectos del Régimen de Sostenimiento e Inclusión Fiscal para Pequeños Contribuyentes de la Ley Nº 27.618.';

const OPLEX_INDIGO = '#4f39f6';

const DATE_FORMAT = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });

export function formatFecha(date: Date): string {
  return DATE_FORMAT.format(date);
}

function formatMoney(amount: number): string {
  return amount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function round2(amount: number): number {
  return Math.round(amount * 100) / 100;
}

/** A y M discriminan IVA, B lo incluye en el precio, C no lo lleva. */
export function vatModeForLetter(letter: string): InvoiceVatMode {
  if (letter === 'B') return 'INCLUDED';
  if (letter === 'C') return 'NONE';
  return 'DISCRIMINATED';
}

function vatLabel(taxKind: string, rate: number): string {
  if (taxKind === 'EXENTO') return 'Exento';
  if (taxKind === 'NO_GRAVADO') return 'No grav.';
  return `${rate.toLocaleString('es-AR')}%`;
}

/** Importes del comprobante en los términos de su letra. El IVA de cada
 * línea es lineTotal - neto con descuento general, no lineTotal - netAmount
 * (antes salía mal con descuento general). */
function buildAmounts(doc: PdfSourceDocument, otherTaxes: InvoicePdfOtherTax[], lineImages: (InvoicePdfImage | null)[]) {
  const vatMode = vatModeForLetter(doc.documentLetter);
  const globalFactor = 1 - doc.globalDiscountPercent.toNumber() / 100;

  let subtotal = 0;
  let afterGlobalTotal = 0;
  let netTaxed = 0;
  let netExempt = 0;
  let netUntaxed = 0;
  let vatTotal = 0;
  const vatByRate = new Map<number, number>();

  const lines = doc.lines.map((line, index) => {
    const net = line.netAmount.toNumber();
    const rate = line.taxKind === 'GRAVADO' ? line.taxRate.toNumber() : 0;
    const afterGlobal = round2(net * globalFactor);
    const lineTotal = line.lineTotal.toNumber();
    const vat = round2(lineTotal - afterGlobal);
    // En B (precio final) cada importe se lleva a final con su alícuota.
    const toShown = vatMode === 'INCLUDED' ? (amount: number) => round2(amount * (1 + rate / 100)) : (amount: number) => amount;

    const shownAmount = toShown(net);
    subtotal += shownAmount;
    afterGlobalTotal += vatMode === 'INCLUDED' ? lineTotal : afterGlobal;
    vatTotal += vat;
    if (line.taxKind === 'EXENTO') netExempt += afterGlobal;
    else if (line.taxKind === 'NO_GRAVADO') netUntaxed += afterGlobal;
    else {
      netTaxed += afterGlobal;
      if (vat !== 0) vatByRate.set(rate, (vatByRate.get(rate) ?? 0) + vat);
    }

    const discountValue = line.discountValue.toNumber();
    const variantLabel = buildVariantLabel(line.articleVariant);
    const pdfLine: InvoicePdfLine = {
      description: variantLabel ? `${line.articleVariant.article.name} · ${variantLabel}` : line.articleVariant.article.name,
      sku: line.articleVariant.sku,
      quantity: line.quantity.toNumber().toLocaleString('es-AR', { maximumFractionDigits: 3 }),
      unit: UNIT_LABELS[line.articleVariant.article.unitOfMeasure ?? 'UNIT'] ?? 'u.',
      unitPrice: formatMoney(toShown(line.unitPrice.toNumber())),
      discount:
        discountValue > 0
          ? line.discountType === 'PERCENTAGE'
            ? `${discountValue.toLocaleString('es-AR', { maximumFractionDigits: 2 })}%`
            : formatMoney(toShown(discountValue))
          : null,
      vatLabel: vatLabel(line.taxKind, rate),
      lineTotal: formatMoney(shownAmount),
      image: lineImages[index] ?? null,
    };
    return pdfLine;
  });

  const rows: InvoicePdfTotalRow[] = [];
  const globalDiscount = round2(subtotal - afterGlobalTotal);
  if (globalDiscount >= 0.005) {
    rows.push({ label: 'Subtotal', amount: formatMoney(subtotal) });
    rows.push({
      label: `Descuento ${doc.globalDiscountPercent.toNumber().toLocaleString('es-AR')}%`,
      amount: `-${formatMoney(globalDiscount)}`,
    });
  }
  if (vatMode === 'DISCRIMINATED') {
    if (netTaxed) rows.push({ label: 'Importe neto gravado', amount: formatMoney(netTaxed) });
    for (const [rate, amount] of [...vatByRate.entries()].sort(([a], [b]) => b - a)) {
      rows.push({ label: `IVA ${rate.toLocaleString('es-AR')}%`, amount: formatMoney(amount) });
    }
    if (netExempt) rows.push({ label: 'Importe exento', amount: formatMoney(netExempt) });
    if (netUntaxed) rows.push({ label: 'Importe no gravado', amount: formatMoney(netUntaxed) });
  } else if (rows.length === 0 && otherTaxes.length > 0) {
    // Sin descuento general, el subtotal sólo hace falta si después vienen
    // percepciones: así la suma hasta el total se puede seguir.
    rows.push({ label: 'Subtotal', amount: formatMoney(subtotal) });
  }
  for (const tax of otherTaxes) {
    rows.push({ label: tax.concept?.trim() || OTHER_TAX_LABEL[tax.kind] || 'Otros tributos', amount: formatMoney(tax.amount.toNumber()) });
  }

  // RG 5614: "IVA contenido" y "Otros impuestos nacionales indirectos" (los
  // internos son los únicos de esos que Oplex registra) en las B, que son
  // las que van a consumidores finales y exentos.
  const internalTaxes = otherTaxes.filter((tax) => tax.kind === 'INTERNAL').reduce((sum, tax) => sum + tax.amount.toNumber(), 0);
  const transparency =
    vatMode === 'INCLUDED' ? { vatContained: formatMoney(round2(vatTotal)), otherIndirectTaxes: formatMoney(round2(internalTaxes)) } : null;

  return {
    vatMode,
    lines,
    hasLineDiscounts: lines.some((line) => line.discount !== null),
    totalRows: rows,
    transparency,
  };
}

function isMonotributoCustomer(taxId: string | null, taxCondition: string | null): boolean {
  if (!taxId) return false;
  try {
    const id = resolveCondicionIvaReceptor(taxId, taxCondition);
    return id === 6 || id === 13;
  } catch {
    return false;
  }
}

function initialsOf(name: string): string {
  const words = name
    .replace(/\b(S\.?R\.?L|S\.?A|S\.?A\.?S|S\.?H)\.?$/i, '')
    .split(/\s+/)
    .filter((word) => /^[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(word));
  return (words.slice(0, 2).map((word) => word[0]).join('') || 'O').toUpperCase();
}

function formatCbu(cbu: string): string {
  const digits = cbu.replace(/\D/g, '');
  return digits.length === 22 ? `${digits.slice(0, 8)} ${digits.slice(8)}` : cbu;
}

export async function buildInvoicePdfData(
  doc: PdfSourceDocument,
  tenant: Pick<Tenant, 'name' | 'taxId'>,
  tenantSettings: TenantSettings | null,
  images: PdfSourceImages = { logo: null, lineImages: [] },
  otherTaxes: InvoicePdfOtherTax[] = [],
): Promise<InvoicePdfData> {
  const amounts = buildAmounts(doc, otherTaxes, images.lineImages);
  const cbteTipo = CBTE_TIPO[doc.kind][doc.documentLetter];

  const qrDataUri = await buildAfipQrDataUri({
    kind: doc.kind,
    issueDate: doc.issueDate,
    issuerCuit: tenant.taxId ?? '',
    pointOfSale: doc.pointOfSale,
    documentLetter: doc.documentLetter,
    number: doc.number,
    total: doc.total,
    currencyCode: doc.currency.code,
    exchangeRate: doc.exchangeRate,
    customerTaxId: doc.customerTaxId,
    cae: doc.afipCae ?? '',
  });

  // La condición guardada al emitir; las facturas C viejas no la tienen y
  // caen a la actual (ver la migración invoice_tax_condition_snapshot).
  const issuerTaxCondition = doc.issuerTaxCondition ?? tenantSettings?.ownTaxCondition ?? null;
  const tradeName = tenantSettings?.tradeName?.trim() || null;
  const brandColor = tenantSettings?.brandColor;
  const total = doc.total.toNumber();
  const showBank =
    doc.kind === 'FACTURA' &&
    tenantSettings?.invoiceShowBankDetails !== false &&
    Boolean(tenantSettings?.bankCbu || tenantSettings?.bankAlias);

  const legends: string[] = [];
  if (doc.documentLetter === 'A' && isMonotributoCustomer(doc.customerTaxId, doc.customerTaxCondition)) {
    legends.push(MONOTRIBUTO_CREDIT_LEGEND);
  }

  const servicePeriod =
    doc.concept !== 'PRODUCTOS'
      ? {
          from: formatFecha(doc.issueDate),
          to: formatFecha(doc.issueDate),
          paymentDue: formatFecha(doc.dueDate ?? doc.issueDate),
        }
      : null;

  return {
    kind: doc.kind,
    title: doc.kind === 'NOTA_CREDITO' ? 'Nota de crédito' : 'Factura',
    emitter: {
      name: tenant.name,
      tradeName,
      taxId: tenant.taxId,
      taxConditionLabel: issuerTaxCondition ? (TAX_CONDITION_LABEL[issuerTaxCondition] ?? issuerTaxCondition) : null,
      grossIncomeNumber: tenantSettings?.grossIncomeNumber ?? null,
      activityStart: tenantSettings?.activityStartDate ? formatFecha(tenantSettings.activityStartDate) : null,
      address: tenantSettings?.fiscalAddress ?? null,
      phone: tenantSettings?.contactPhone ?? null,
      email: tenantSettings?.contactEmail ?? null,
      website: tenantSettings?.website ?? null,
      logo: images.logo,
      initials: initialsOf(tradeName ?? tenant.name),
      brandColor: brandColor && /^#[0-9a-fA-F]{6}$/.test(brandColor) ? brandColor : OPLEX_INDIGO,
    },
    customer: {
      name: doc.customerName,
      docLabel: doc.customerTaxId ? (classifyTaxId(doc.customerTaxId) === 'DNI' ? 'DNI' : 'CUIT') : null,
      docNumber: doc.customerTaxId,
      taxConditionLabel:
        doc.customerTaxCondition?.trim() ||
        (doc.customerTaxId && classifyTaxId(doc.customerTaxId) !== 'DNI' ? 'Sin informar' : 'Consumidor Final'),
      address: doc.customerFiscalAddress?.trim() || null,
    },

    documentLetter: doc.documentLetter,
    cbteTipoCode: String(cbteTipo).padStart(2, '0'),
    pointOfSale: doc.pointOfSale,
    number: doc.number,
    fullNumber: `${doc.pointOfSale}-${doc.number}`,
    conceptLabel: CONCEPT_LABEL[doc.concept] ?? doc.concept,
    issueDate: formatFecha(doc.issueDate),
    servicePeriod,
    saleCondition: doc.saleCondition,
    associatedDocument: doc.associatedDocument ?? null,
    reason: doc.reason?.trim() || null,

    currencyCode: doc.currency.code,
    exchangeRate: doc.exchangeRate.toString(),
    isBaseCurrency: doc.currency.isBase,

    ...amounts,
    total: formatMoney(total),
    totalInWords: amountInWords(total, doc.currency.code),
    legends,

    bank: showBank
      ? {
          name: tenantSettings?.bankName ?? null,
          cbu: tenantSettings?.bankCbu ? formatCbu(tenantSettings.bankCbu) : null,
          alias: tenantSettings?.bankAlias ?? null,
        }
      : null,
    notes: doc.notes?.trim() || null,

    cae: doc.afipCae ?? '',
    caeExpiry: doc.afipCaeExpiry ? formatFecha(doc.afipCaeExpiry) : '',
    qrDataUri,
  };
}
