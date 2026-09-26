import type { Company, Tenant, TenantSettings } from '@plexo/database';
import { buildVariantLabel } from '@plexo/types';
import { CBTE_TIPO } from '../afip-wsfe-client.js';
import type { InvoiceWithCurrencyAndLines } from '../invoicing.service.js';
import { buildAfipQrDataUri } from './qr.util.js';
import type { InvoicePdfData, InvoicePdfTaxBucket } from './pdf-data.js';

const TAX_CONDITION_LABEL: Record<string, string> = {
  RESPONSABLE_INSCRIPTO: 'Responsable Inscripto',
  MONOTRIBUTO: 'Monotributo',
  EXENTO: 'Exento',
};

const CONCEPT_LABEL: Record<string, string> = {
  PRODUCTOS: 'Productos',
  SERVICIOS: 'Servicios',
  PRODUCTOS_Y_SERVICIOS: 'Productos y Servicios',
};

function formatFecha(date: Date): string {
  return date.toLocaleDateString('es-AR', { timeZone: 'UTC' });
}

function formatMoney(amount: number): string {
  return amount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** null = no mostrar esta fila en el PDF (importe cero) - evita reconstruir
 * el número desde el string ya formateado en el template. */
function formatMoneyOrNull(amount: number): string | null {
  return amount === 0 ? null : formatMoney(amount);
}

/** Igual criterio que VatBookService.getSalesBook (libs/modules/taxes) -
 * duplicado a propósito, un lib module nunca importa el Service de otro.
 * `Invoice` no persiste netTaxed/netExempt/netUntaxed por separado, se
 * re-derivan de InvoiceLine.taxKind/netAmount/taxRate cada vez que se arma
 * el PDF. */
function bucketTaxes(lines: InvoiceWithCurrencyAndLines['lines']): {
  netTaxed: number;
  netExempt: number;
  netUntaxed: number;
  buckets: InvoicePdfTaxBucket[];
} {
  let netTaxed = 0;
  let netExempt = 0;
  let netUntaxed = 0;
  const rateBuckets = new Map<string, { net: number; tax: number }>();

  for (const line of lines) {
    const net = line.netAmount.toNumber();
    if (line.taxKind === 'EXENTO') {
      netExempt += net;
      continue;
    }
    if (line.taxKind === 'NO_GRAVADO') {
      netUntaxed += net;
      continue;
    }
    netTaxed += net;
    const rate = line.taxRate.toNumber();
    const key = rate.toFixed(1);
    const existing = rateBuckets.get(key) ?? { net: 0, tax: 0 };
    existing.net += net;
    existing.tax += line.lineTotal.toNumber() - net;
    rateBuckets.set(key, existing);
  }

  const buckets: InvoicePdfTaxBucket[] = [...rateBuckets.entries()]
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([rate, { net, tax }]) => ({
      label: `IVA ${rate.replace('.0', '')}%`,
      net: formatMoney(net),
      tax: formatMoney(tax),
    }));

  return { netTaxed, netExempt, netUntaxed, buckets };
}

export async function buildInvoicePdfData(
  invoice: InvoiceWithCurrencyAndLines,
  customer: Company,
  tenant: Tenant,
  tenantSettings: TenantSettings | null,
): Promise<InvoicePdfData> {
  const { netTaxed, netExempt, netUntaxed, buckets } = bucketTaxes(invoice.lines);

  const qrDataUri = await buildAfipQrDataUri({
    issueDate: invoice.issueDate,
    issuerCuit: tenant.taxId ?? '',
    pointOfSale: invoice.pointOfSale,
    documentLetter: invoice.documentLetter,
    number: invoice.number,
    total: invoice.total,
    currencyCode: invoice.currency.code,
    exchangeRate: invoice.exchangeRate,
    customerTaxId: invoice.customerTaxId,
    cae: invoice.afipCae ?? '',
  });

  return {
    issuerName: tenant.name,
    issuerTaxId: tenant.taxId,
    issuerTaxConditionLabel: tenantSettings?.ownTaxCondition
      ? (TAX_CONDITION_LABEL[tenantSettings.ownTaxCondition] ?? tenantSettings.ownTaxCondition)
      : null,
    issuerFiscalAddress: tenantSettings?.fiscalAddress ?? null,
    issuerGrossIncomeNumber: tenantSettings?.grossIncomeNumber ?? null,
    issuerActivityStartDate: tenantSettings?.activityStartDate
      ? formatFecha(tenantSettings.activityStartDate)
      : null,

    documentLetter: invoice.documentLetter,
    cbteTipoCode: CBTE_TIPO.FACTURA[invoice.documentLetter],
    pointOfSale: invoice.pointOfSale,
    number: invoice.number,
    fullNumber: `${invoice.pointOfSale}-${invoice.number}`,
    conceptLabel: CONCEPT_LABEL[invoice.concept] ?? invoice.concept,
    issueDate: formatFecha(invoice.issueDate),
    serviceDueDate: invoice.concept !== 'PRODUCTOS' && invoice.dueDate ? formatFecha(invoice.dueDate) : null,

    customerName: invoice.customerName,
    customerTaxIdLabel: invoice.customerTaxId
      ? 'CUIT'
      : invoice.customerName.trim().toLowerCase() === 'consumidor final'
        ? null
        : 'Consumidor Final',
    customerTaxId: invoice.customerTaxId,
    customerTaxConditionLabel: customer.taxCondition,
    customerFiscalAddress: customer.fiscalAddress,

    currencyCode: invoice.currency.code,
    exchangeRate: invoice.exchangeRate.toString(),
    isBaseCurrency: invoice.currency.isBase,

    lines: invoice.lines.map((line) => {
      const variantLabel = buildVariantLabel(line.articleVariant);
      return {
        description: variantLabel ? `${line.articleVariant.article.name} · ${variantLabel}` : line.articleVariant.article.name,
        sku: line.articleVariant.sku,
        quantity: line.quantity.toString(),
        unitPrice: formatMoney(line.unitPrice.toNumber()),
        lineTotal: formatMoney(line.lineTotal.toNumber()),
      };
    }),

    // Factura C no discrimina IVA (emisor Monotributo/Exento): ni "Neto
    // Gravado" ni "IVA 0%" - sólo subtotal y total.
    subtotalWithoutVat: invoice.documentLetter === 'C' ? formatMoney(netTaxed + netExempt + netUntaxed) : null,
    netTaxed: invoice.documentLetter === 'C' ? null : formatMoneyOrNull(netTaxed),
    netExempt: invoice.documentLetter === 'C' ? null : formatMoneyOrNull(netExempt),
    netUntaxed: invoice.documentLetter === 'C' ? null : formatMoneyOrNull(netUntaxed),
    taxBuckets: invoice.documentLetter === 'C' ? [] : buckets,
    taxTotal: formatMoney(invoice.taxTotal.toNumber()),
    total: formatMoney(invoice.total.toNumber()),

    cae: invoice.afipCae ?? '',
    caeExpiry: invoice.afipCaeExpiry ? formatFecha(invoice.afipCaeExpiry) : '',

    qrDataUri,
  };
}
