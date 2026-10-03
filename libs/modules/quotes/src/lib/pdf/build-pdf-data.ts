import { buildVariantLabel } from '@plexo/types';
import type {
  QuotePdfData,
  QuotePdfImage,
  QuotePdfLine,
  QuotePdfTotals,
  QuoteVatMode,
} from './pdf-data.js';

type Decimalish = { toString(): string };
type TaxKind = 'GRAVADO' | 'EXENTO' | 'NO_GRAVADO';
export type TenantTaxConditionValue = 'RESPONSABLE_INSCRIPTO' | 'MONOTRIBUTO' | 'EXENTO';

interface PdfSourceLine {
  quantity: Decimalish;
  unitPrice: Decimalish;
  discountPercent?: Decimalish | null;
  notes?: string | null;
  taxRate?: Decimalish | null;
  taxKind?: TaxKind | null;
  netAmount?: Decimalish | null;
  lineTotal?: Decimalish | null;
  articleVariant: {
    sku: string;
    color?: string | null;
    size?: string | null;
    brand?: string | null;
    attributes?: unknown;
    article: { name: string; unitOfMeasure?: string | null };
  };
}

export interface PdfSourceQuote {
  number: string;
  createdAt: Date;
  validUntil: Date | null;
  notes: string | null;
  paymentTerms?: string | null;
  deliveryTerms?: string | null;
  deliveryPlace?: string | null;
  warranty?: string | null;
  currency: { code: string };
  customer: {
    name: string;
    taxId: string | null;
    fiscalAddress: string | null;
    taxCondition?: string | null;
    email?: string | null;
    phone?: string | null;
  };
  contactPerson?: {
    firstName: string;
    lastName: string | null;
    email: string | null;
    whatsapp: string | null;
  } | null;
  createdBy?: { name: string | null } | null;
  lines: PdfSourceLine[];
}

export interface PdfSourceEmitter {
  name: string;
  taxId: string | null;
  ownTaxCondition: TenantTaxConditionValue;
  tradeName?: string | null;
  grossIncomeNumber?: string | null;
  activityStartDate?: Date | null;
  fiscalAddress?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  website?: string | null;
  brandColor?: string | null;
  bankName?: string | null;
  bankCbu?: string | null;
  bankAlias?: string | null;
  quoteShowBankDetails?: boolean;
}

/** Imágenes ya leídas de disco por QuoteService (este archivo no hace I/O). */
export interface PdfSourceImages {
  logo: QuotePdfImage | null;
  /** Por índice de línea. */
  lineImages: (QuotePdfImage | null)[];
}

const OPLEX_INDIGO = '#4f39f6';

const dateFormatter = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const dayOnlyFormatter = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'UTC',
});

const UNIT_LABELS: Record<string, string> = { UNIT: 'u.', KG: 'kg', LTR: 'l', MM: 'mm', M2: 'm²' };

const TAX_CONDITION_LABELS: Record<TenantTaxConditionValue, string> = {
  RESPONSABLE_INSCRIPTO: 'IVA Responsable Inscripto',
  MONOTRIBUTO: 'Responsable Monotributo',
  EXENTO: 'IVA Exento',
};

/** Misma regla que la letra de la factura (ver suggestDocumentLetter en la
 * web): A sólo con cliente RI con CUIT; ante la duda, B. */
export function resolveVatMode(
  ownTaxCondition: TenantTaxConditionValue,
  customerTaxId: string | null,
  customerTaxCondition: string | null | undefined,
): QuoteVatMode {
  if (ownTaxCondition !== 'RESPONSABLE_INSCRIPTO') return 'NONE';
  if (customerTaxId && (customerTaxCondition ?? '').toLowerCase().includes('responsable inscripto')) {
    return 'DISCRIMINATED';
  }
  return 'INCLUDED';
}

export function buildQuotePdfData(
  quote: PdfSourceQuote,
  emitter: PdfSourceEmitter,
  images: PdfSourceImages,
): QuotePdfData {
  const vatMode = resolveVatMode(emitter.ownTaxCondition, quote.customer.taxId, quote.customer.taxCondition);

  let subtotal = 0;
  let discountTotal = 0;
  let netTaxed = 0;
  let netExempt = 0;
  let vatTotal = 0;
  let total = 0;
  const vatBuckets = new Map<number, number>();

  const lines: QuotePdfLine[] = quote.lines.map((line, index) => {
    const quantity = num(line.quantity);
    const netUnit = num(line.unitPrice);
    const discountPercent = line.discountPercent != null ? num(line.discountPercent) : 0;
    const taxRate = line.taxRate != null ? num(line.taxRate) : 0;
    const taxKind = line.taxKind ?? 'GRAVADO';
    const netAmount = line.netAmount != null ? num(line.netAmount) : round2(quantity * netUnit * (1 - discountPercent / 100));
    const lineTotal = line.lineTotal != null ? num(line.lineTotal) : netAmount;
    const vatAmount = round2(lineTotal - netAmount);

    // En DISCRIMINATED todo va en neto; en los otros dos modos, en final.
    const shownUnit = vatMode === 'DISCRIMINATED' ? netUnit : round2(netUnit * (1 + (taxKind === 'GRAVADO' ? taxRate : 0) / 100));
    const shownAmount = vatMode === 'DISCRIMINATED' ? netAmount : lineTotal;
    const shownGross = round2(quantity * shownUnit);

    subtotal += shownGross;
    discountTotal += Math.max(0, shownGross - shownAmount);
    vatTotal += vatAmount;
    total += lineTotal;
    if (taxKind === 'GRAVADO') {
      netTaxed += netAmount;
      if (vatAmount !== 0) vatBuckets.set(taxRate, (vatBuckets.get(taxRate) ?? 0) + vatAmount);
    } else {
      netExempt += netAmount;
    }

    return {
      articleName: line.articleVariant.article.name,
      variantLabel: buildVariantLabel(line.articleVariant),
      sku: line.articleVariant.sku,
      quantity: formatQuantity(quantity),
      unit: UNIT_LABELS[line.articleVariant.article.unitOfMeasure ?? 'UNIT'] ?? 'u.',
      unitPrice: money(shownUnit),
      discount: discountPercent > 0 ? `${formatQuantity(discountPercent)}%` : null,
      vatLabel: vatLabel(taxKind, taxRate),
      amount: money(shownAmount),
      note: line.notes?.trim() || null,
      image: images.lineImages[index] ?? null,
    };
  });

  total = round2(total);
  const totals: QuotePdfTotals = {
    subtotal: money(subtotal),
    discount: discountTotal >= 0.005 ? money(discountTotal) : null,
    netTaxed: vatMode === 'DISCRIMINATED' ? money(netTaxed) : null,
    netExempt: vatMode === 'DISCRIMINATED' && netExempt >= 0.005 ? money(netExempt) : null,
    vatByRate:
      vatMode === 'DISCRIMINATED'
        ? [...vatBuckets.entries()]
            .sort(([a], [b]) => b - a)
            .map(([rate, amount]) => ({ label: `IVA ${formatQuantity(rate)}%`, amount: money(amount) }))
        : [],
    vatTotal: vatMode === 'DISCRIMINATED' ? money(vatTotal) : null,
    vatContained: vatMode === 'INCLUDED' && vatTotal >= 0.005 ? money(vatTotal) : null,
    total: money(total),
    totalInWords: amountInWords(total, quote.currency.code),
  };

  const contact = quote.contactPerson;
  const showBank =
    emitter.quoteShowBankDetails !== false && Boolean(emitter.bankCbu || emitter.bankAlias);

  return {
    number: quote.number,
    issueDate: dateFormatter.format(quote.createdAt),
    validUntil: quote.validUntil ? dayOnlyFormatter.format(quote.validUntil) : null,
    validDays: quote.validUntil ? daysBetween(quote.createdAt, quote.validUntil) : null,
    sellerName: quote.createdBy?.name ?? null,
    currencyCode: quote.currency.code,
    emitter: {
      name: emitter.name,
      tradeName: emitter.tradeName?.trim() || null,
      taxId: emitter.taxId,
      taxConditionLabel: TAX_CONDITION_LABELS[emitter.ownTaxCondition],
      grossIncomeNumber: emitter.grossIncomeNumber ?? null,
      activityStart: emitter.activityStartDate ? monthYear(emitter.activityStartDate) : null,
      address: emitter.fiscalAddress ?? null,
      phone: emitter.contactPhone ?? null,
      email: emitter.contactEmail ?? null,
      website: emitter.website ?? null,
      logo: images.logo,
      initials: initialsOf(emitter.tradeName?.trim() || emitter.name),
      brandColor: emitter.brandColor && /^#[0-9a-fA-F]{6}$/.test(emitter.brandColor) ? emitter.brandColor : OPLEX_INDIGO,
    },
    customer: {
      name: quote.customer.name,
      taxId: quote.customer.taxId,
      taxCondition: quote.customer.taxCondition ?? null,
      address: quote.customer.fiscalAddress,
      email: quote.customer.email ?? null,
      phone: quote.customer.phone ?? null,
      contactName: contact ? [contact.firstName, contact.lastName].filter(Boolean).join(' ') : null,
      contactFirstName: contact?.firstName ?? null,
      contactEmail: contact?.email ?? null,
      contactPhone: contact?.whatsapp ?? null,
    },
    conditions: {
      payment: quote.paymentTerms?.trim() || null,
      delivery: quote.deliveryTerms?.trim() || null,
      place: quote.deliveryPlace?.trim() || null,
      warranty: quote.warranty?.trim() || null,
    },
    bank: showBank
      ? { name: emitter.bankName ?? null, cbu: emitter.bankCbu ? formatCbu(emitter.bankCbu) : null, alias: emitter.bankAlias ?? null }
      : null,
    vatMode,
    lines,
    totals,
    notes: quote.notes?.trim() || null,
  };
}

function num(value: Decimalish): number {
  return Number(value.toString());
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function money(value: number): string {
  return value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatQuantity(value: number): string {
  return value.toLocaleString('es-AR', { maximumFractionDigits: 3 });
}

function vatLabel(taxKind: TaxKind, taxRate: number): string {
  if (taxKind === 'EXENTO') return 'Exento';
  if (taxKind === 'NO_GRAVADO') return 'No Grav.';
  return `${formatQuantity(taxRate)}%`;
}

/** "03/2015" - Intl con month: '2-digit' igual devuelve "3/2015" en es-AR. */
function monthYear(date: Date): string {
  return `${String(date.getUTCMonth() + 1).padStart(2, '0')}/${date.getUTCFullYear()}`;
}

function daysBetween(from: Date, to: Date): number {
  const start = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const end = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.max(0, Math.round((end - start) / 86_400_000));
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

const CURRENCY_WORDS: Record<string, string> = {
  ARS: 'pesos',
  USD: 'dólares estadounidenses',
  EUR: 'euros',
};

/** "Son pesos ..." - el importe en letras de los presupuestos argentinos. */
export function amountInWords(amount: number, currencyCode: string): string {
  const whole = Math.floor(amount);
  const cents = Math.round((amount - whole) * 100);
  const currency = CURRENCY_WORDS[currencyCode] ?? currencyCode;
  return `${currency} ${integerInWords(whole)} con ${String(cents).padStart(2, '0')}/100`;
}

const UNITS = [
  '', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece',
  'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidós',
  'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve',
];
const TENS = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const HUNDREDS = [
  '', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos',
  'ochocientos', 'novecientos',
];

function belowHundred(n: number): string {
  return n < 30 ? UNITS[n] : TENS[Math.floor(n / 10)] + (n % 10 ? ` y ${UNITS[n % 10]}` : '');
}

function belowThousand(n: number): string {
  if (n === 100) return 'cien';
  const hundreds = HUNDREDS[Math.floor(n / 100)];
  const rest = n % 100 ? belowHundred(n % 100) : '';
  return [hundreds, rest].filter(Boolean).join(' ');
}

/** "uno" pasa a "un" delante de "mil"/"millones" ("veintiún mil"). */
function apocope(words: string): string {
  return words.replace(/veintiuno$/, 'veintiún').replace(/uno$/, 'un');
}

function integerInWords(n: number): string {
  if (n === 0) return 'cero';
  const parts: string[] = [];
  // Hasta 999.999 millones: "mil quinientos millones" sale de la recursión.
  const millions = Math.floor(n / 1e6);
  const thousands = Math.floor((n % 1e6) / 1e3);
  const rest = n % 1e3;
  if (millions) parts.push(millions === 1 ? 'un millón' : `${apocope(integerInWords(millions))} millones`);
  if (thousands) parts.push(thousands === 1 ? 'mil' : `${apocope(belowThousand(thousands))} mil`);
  if (rest) parts.push(belowThousand(rest));
  return parts.join(' ');
}
