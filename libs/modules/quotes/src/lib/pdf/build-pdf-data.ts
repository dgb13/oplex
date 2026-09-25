import { buildVariantLabel } from '@plexo/types';
import type { QuotePdfData, QuotePdfLine, QuotePdfVatSummary } from './pdf-data.js';

interface PdfSourceLine {
  quantity: { toString(): string };
  unitPrice: { toString(): string };
  // Nullable - ver el comentario de QuoteLine en schema.prisma.
  taxRate?: { toString(): string } | null;
  taxKind?: 'GRAVADO' | 'EXENTO' | 'NO_GRAVADO' | null;
  netAmount?: { toString(): string } | null;
  lineTotal?: { toString(): string } | null;
  articleVariant: {
    sku: string;
    color?: string | null;
    size?: string | null;
    brand?: string | null;
    attributes?: unknown;
    article: { name: string };
  };
}

interface PdfSourceQuote {
  number: string;
  createdAt: Date;
  validUntil: Date | null;
  notes: string | null;
  total: { toString(): string };
  currency: { code: string };
  customer: { name: string; taxId: string | null; fiscalAddress: string | null };
  lines: PdfSourceLine[];
}

const dateFormatter = new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium' });
// validUntil es una fecha "de día" guardada a medianoche UTC - formateada en
// la zona del server (UTC-3) salía un día antes en el PDF.
const dayOnlyFormatter = new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeZone: 'UTC' });

const ZERO_BUCKET = { vat21: 0, vat10_5: 0, vat27: 0, vatOther: 0 };

function bucketRate(rate: number, amount: number, into: typeof ZERO_BUCKET): void {
  if (Math.abs(rate - 21) < 0.01) into.vat21 += amount;
  else if (Math.abs(rate - 10.5) < 0.01) into.vat10_5 += amount;
  else if (Math.abs(rate - 27) < 0.01) into.vat27 += amount;
  else into.vatOther += amount;
}

function vatLabel(taxKind: 'GRAVADO' | 'EXENTO' | 'NO_GRAVADO' | null | undefined, taxRate: number | null): string | null {
  if (taxKind === 'EXENTO') return 'Exento';
  if (taxKind === 'NO_GRAVADO') return 'No Grav.';
  if (taxRate == null) return null;
  return `${taxRate.toString().replace('.', ',')}%`;
}

export function buildQuotePdfData(
  quote: PdfSourceQuote,
  tenant: { name: string; taxId: string | null },
): QuotePdfData {
  // Sólo suma al resumen si la línea tiene taxRate propio - una fila de una
  // cotización vieja (sin desglose de IVA) no aporta ningún bucket, no se
  // inventa una alícuota que nunca se cargó.
  let anyTax = false;
  let netTaxed = 0;
  let netExempt = 0;
  const buckets = { ...ZERO_BUCKET };

  const lines: QuotePdfLine[] = quote.lines.map((line) => {
    const quantity = Number(line.quantity.toString());
    const unitPrice = Number(line.unitPrice.toString());
    const netAmount = line.netAmount != null ? Number(line.netAmount.toString()) : quantity * unitPrice;
    const lineTotal = line.lineTotal != null ? Number(line.lineTotal.toString()) : quantity * unitPrice;
    const taxRate = line.taxRate != null ? Number(line.taxRate.toString()) : null;

    if (taxRate != null || line.taxKind === 'EXENTO' || line.taxKind === 'NO_GRAVADO') {
      anyTax = true;
      if (line.taxKind === 'GRAVADO' || line.taxKind === undefined || line.taxKind === null) {
        netTaxed += netAmount;
        bucketRate(taxRate ?? 0, lineTotal - netAmount, buckets);
      } else {
        netExempt += netAmount;
      }
    }

    return {
      articleName: line.articleVariant.article.name,
      variantLabel: buildVariantLabel(line.articleVariant),
      sku: line.articleVariant.sku,
      quantity: formatNumber(quantity),
      unitPrice: formatNumber(unitPrice),
      lineTotal: formatNumber(lineTotal),
      vatLabel: vatLabel(line.taxKind, taxRate),
    };
  });

  const vatTotal = buckets.vat21 + buckets.vat10_5 + buckets.vat27 + buckets.vatOther;
  const vatSummary: QuotePdfVatSummary | null = anyTax
    ? {
        netTaxed: formatNumber(netTaxed),
        netExempt: formatNumber(netExempt),
        vat21: formatNumber(buckets.vat21),
        vat10_5: formatNumber(buckets.vat10_5),
        vat27: formatNumber(buckets.vat27),
        vatOther: formatNumber(buckets.vatOther),
        vatTotal: formatNumber(vatTotal),
      }
    : null;

  return {
    number: quote.number,
    issueDate: dateFormatter.format(quote.createdAt),
    validUntil: quote.validUntil ? dayOnlyFormatter.format(quote.validUntil) : null,
    tenantName: tenant.name,
    tenantTaxId: tenant.taxId,
    customerName: quote.customer.name,
    customerTaxId: quote.customer.taxId,
    customerAddress: quote.customer.fiscalAddress,
    currencyCode: quote.currency.code,
    lines,
    total: formatNumber(Number(quote.total.toString())),
    vatSummary,
    notes: quote.notes,
  };
}

function formatNumber(value: number): string {
  return value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
