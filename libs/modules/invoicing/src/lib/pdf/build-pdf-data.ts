import type { Company, Tenant, TenantSettings } from '@plexo/database';
import { buildVariantLabel } from '@plexo/types';
import { CBTE_TIPO } from '../afip-wsfe-client.js';
import type { InvoiceWithCurrencyAndLines } from '../invoicing.service.js';
import { buildAfipQrDataUri } from './qr.util.js';
import type { InvoicePdfData, InvoicePdfLine, InvoicePdfTotalRow, InvoiceVatMode } from './pdf-data.js';

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

const OTHER_TAX_LABEL: Record<string, string> = {
  NATIONAL: 'Impuesto nacional',
  PROVINCIAL: 'Percepción IIBB',
  MUNICIPAL: 'Tasa municipal',
  INTERNAL: 'Impuestos internos',
  OTHER: 'Otros tributos',
};

/** Percepciones/otros tributos de la factura (InvoiceTaxLine). */
export interface InvoicePdfOtherTax {
  kind: string;
  concept: string;
  amount: { toNumber(): number };
}

const DATE_FORMAT = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });

function formatFecha(date: Date): string {
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

/** Importes de la factura en los términos de su letra.
 *
 * InvoiceLine.netAmount es el neto con la bonificación de la línea pero
 * ANTES del descuento general; lineTotal ya tiene el descuento general y el
 * IVA (ver el orden de cálculo en InvoicingService.createInvoice). Por eso
 * el IVA de cada línea es lineTotal - neto con descuento general, no
 * lineTotal - netAmount (antes salía mal con descuento general). */
function buildAmounts(invoice: InvoiceWithCurrencyAndLines, otherTaxes: InvoicePdfOtherTax[]) {
  const vatMode = vatModeForLetter(invoice.documentLetter);
  const globalFactor = 1 - invoice.globalDiscountPercent.toNumber() / 100;

  let subtotal = 0;
  let afterGlobalTotal = 0;
  let netTaxed = 0;
  let netExempt = 0;
  let netUntaxed = 0;
  let vatTotal = 0;
  const vatByRate = new Map<number, number>();

  const lines = invoice.lines.map((line) => {
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
      unitPrice: formatMoney(toShown(line.unitPrice.toNumber())),
      discount:
        discountValue > 0
          ? line.discountType === 'PERCENTAGE'
            ? `${discountValue.toLocaleString('es-AR', { maximumFractionDigits: 2 })}%`
            : formatMoney(toShown(discountValue))
          : null,
      lineTotal: formatMoney(shownAmount),
    };
    return pdfLine;
  });

  const rows: InvoicePdfTotalRow[] = [];
  const globalDiscount = round2(subtotal - afterGlobalTotal);
  if (globalDiscount >= 0.005) {
    rows.push({ label: 'Subtotal', amount: formatMoney(subtotal) });
    rows.push({
      label: `Descuento ${invoice.globalDiscountPercent.toNumber().toLocaleString('es-AR')}%`,
      amount: `-${formatMoney(globalDiscount)}`,
    });
  }
  if (vatMode === 'DISCRIMINATED') {
    if (netTaxed) rows.push({ label: 'Importe Neto Gravado', amount: formatMoney(netTaxed) });
    for (const [rate, amount] of [...vatByRate.entries()].sort(([a], [b]) => b - a)) {
      rows.push({ label: `IVA ${rate.toLocaleString('es-AR')}%`, amount: formatMoney(amount) });
    }
    if (netExempt) rows.push({ label: 'Importe Exento', amount: formatMoney(netExempt) });
    if (netUntaxed) rows.push({ label: 'Importe No Gravado', amount: formatMoney(netUntaxed) });
  } else if (rows.length === 0 && otherTaxes.length > 0) {
    // Sin descuento general, el subtotal sólo hace falta si después vienen
    // percepciones: así la suma hasta el total se puede seguir.
    rows.push({ label: 'Subtotal', amount: formatMoney(subtotal) });
  }
  for (const tax of otherTaxes) {
    rows.push({ label: tax.concept?.trim() || OTHER_TAX_LABEL[tax.kind] || 'Otros tributos', amount: formatMoney(tax.amount.toNumber()) });
  }

  return {
    vatMode,
    lines,
    hasLineDiscounts: lines.some((line) => line.discount !== null),
    totalRows: rows,
    vatContained: vatMode === 'INCLUDED' && vatTotal >= 0.005 ? formatMoney(vatTotal) : null,
  };
}

export async function buildInvoicePdfData(
  invoice: InvoiceWithCurrencyAndLines,
  customer: Company,
  tenant: Tenant,
  tenantSettings: TenantSettings | null,
  otherTaxes: InvoicePdfOtherTax[] = [],
): Promise<InvoicePdfData> {
  const amounts = buildAmounts(invoice, otherTaxes);

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

  // La condición guardada al emitir; las facturas C viejas no la tienen y
  // caen a la actual (ver la migración invoice_tax_condition_snapshot).
  const issuerTaxCondition = invoice.issuerTaxCondition ?? tenantSettings?.ownTaxCondition ?? null;

  return {
    issuerName: tenant.name,
    issuerTaxId: tenant.taxId,
    issuerTaxConditionLabel: issuerTaxCondition ? (TAX_CONDITION_LABEL[issuerTaxCondition] ?? issuerTaxCondition) : null,
    issuerFiscalAddress: tenantSettings?.fiscalAddress ?? null,
    issuerGrossIncomeNumber: tenantSettings?.grossIncomeNumber ?? null,
    issuerActivityStartDate: tenantSettings?.activityStartDate ? formatFecha(tenantSettings.activityStartDate) : null,

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
    customerTaxConditionLabel: invoice.customerTaxCondition ?? customer.taxCondition,
    customerFiscalAddress: customer.fiscalAddress,

    currencyCode: invoice.currency.code,
    exchangeRate: invoice.exchangeRate.toString(),
    isBaseCurrency: invoice.currency.isBase,

    ...amounts,
    total: formatMoney(invoice.total.toNumber()),

    cae: invoice.afipCae ?? '',
    caeExpiry: invoice.afipCaeExpiry ? formatFecha(invoice.afipCaeExpiry) : '',

    qrDataUri,
  };
}
