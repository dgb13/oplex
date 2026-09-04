import { Injectable } from '@nestjs/common';
import { getTenantDb } from '@plexo/database';
import { sumTotals, type VatBookEntry, type VatBookResult } from './vat-book.types.js';

/** Igual que reports-sales/reports-pnl (ver PROGRESS.md) - un "hasta" de
 * sólo la fecha calendario (el caso común de un date-picker) tiene que
 * llegar hasta el final de ese día, si no cualquier comprobante emitido
 * más tarde ese mismo día queda afuera. No se puede importar el
 * `defaultRange` de reports-sales (scope:reports-sales no es
 * scope:shared) - se duplica a propósito, mismo criterio que
 * QuoteSendChannel/PurchaseSendChannel en el schema. */
export function defaultRange(from?: string, to?: string): { from: Date; to: Date } {
  const rangeTo = to ? new Date(to) : new Date();
  rangeTo.setUTCHours(23, 59, 59, 999);
  const rangeFrom = from ? new Date(from) : new Date(Date.UTC(rangeTo.getUTCFullYear(), rangeTo.getUTCMonth(), 1));
  return { from: rangeFrom, to: rangeTo };
}

const ZERO_BUCKET = { vat21: 0, vat10_5: 0, vat27: 0, vatOther: 0 };

/** Un IVA del 21%/10.5%/27% cae en su columna propia - cualquier otra
 * alícuota (incluido 0%, "gravado al 0%" según TaxLineKind.GRAVADO) cae
 * en "otras", que en la práctica sólo suma algo distinto de 0 para
 * alícuotas fuera del set estándar argentino. */
function bucketRate(rate: number, amount: number, into: typeof ZERO_BUCKET): void {
  if (Math.abs(rate - 21) < 0.01) into.vat21 += amount;
  else if (Math.abs(rate - 10.5) < 0.01) into.vat10_5 += amount;
  else if (Math.abs(rate - 27) < 0.01) into.vat27 += amount;
  else into.vatOther += amount;
}

function counterpartyDocType(taxId: string | null): 'CUIT' | 'CF' {
  return taxId ? 'CUIT' : 'CF';
}

const DOCUMENT_LETTER_LABEL: Record<string, string> = { A: 'A', B: 'B', C: 'C', M: 'M' };

@Injectable()
export class VatBookService {
  /** Libro IVA Ventas: una fila por Factura + una fila por Nota de
   * Crédito (con todos los importes negados), en el mismo rango. El
   * desglose por alícuota se deriva de `InvoiceLine.taxRate`/`lineTotal-
   * netAmount` (nunca recalculando `netAmount*rate/100` a mano - eso
   * arriesgaría un redondeo distinto al centavo ya persistido por
   * InvoicingService, que tiene su propia batería de tests de redondeo).
   * `CreditNoteLine.taxAmount` ya viene calculado, se usa tal cual. */
  async getSalesBook(from?: string, to?: string): Promise<VatBookResult> {
    const range = defaultRange(from, to);
    const db = getTenantDb();

    const invoices = await db.invoice.findMany({
      where: { issueDate: { gte: range.from, lte: range.to }, status: { not: 'CANCELLED' } },
      include: {
        lines: true,
        taxLines: true,
        customer: { select: { taxCondition: true } },
        currency: { select: { code: true } },
      },
      orderBy: { issueDate: 'asc' },
    });

    const creditNotes = await db.creditNote.findMany({
      where: { issueDate: { gte: range.from, lte: range.to } },
      include: {
        lines: { include: { invoiceLine: { select: { taxKind: true, taxRate: true } } } },
        invoice: { select: { customerName: true, customerTaxId: true, customer: { select: { taxCondition: true } } } },
        currency: { select: { code: true } },
      },
      orderBy: { issueDate: 'asc' },
    });

    const entries: VatBookEntry[] = [];

    for (const invoice of invoices) {
      let netTaxed = 0;
      let netExempt = 0;
      let netUntaxed = 0;
      const buckets = { ...ZERO_BUCKET };
      for (const line of invoice.lines) {
        const net = line.netAmount.toNumber();
        if (line.taxKind === 'EXENTO') netExempt += net;
        else if (line.taxKind === 'NO_GRAVADO') netUntaxed += net;
        else {
          netTaxed += net;
          bucketRate(line.taxRate.toNumber(), line.lineTotal.sub(line.netAmount).toNumber(), buckets);
        }
      }
      const vatTotal = buckets.vat21 + buckets.vat10_5 + buckets.vat27 + buckets.vatOther;
      // Notas de Crédito no tienen InvoiceTaxLine propias todavía (v1 -
      // percepciones sólo se cargan al facturar, no se acreditan) - las
      // filas de abajo (isCreditNote: true) siguen en 0 a propósito.
      const perceptions = invoice.taxLines.reduce((sum, line) => sum + line.amount.toNumber(), 0);
      entries.push({
        id: invoice.id,
        date: invoice.issueDate.toISOString().slice(0, 10),
        documentType: `Factura ${DOCUMENT_LETTER_LABEL[invoice.documentLetter] ?? invoice.documentLetter}`,
        documentLetter: invoice.documentLetter,
        pointOfSale: invoice.pointOfSale,
        number: invoice.number,
        counterpartyName: invoice.customerName,
        counterpartyTaxId: invoice.customerTaxId,
        counterpartyDocType: counterpartyDocType(invoice.customerTaxId),
        taxCondition: invoice.customer.taxCondition,
        currencyCode: invoice.currency.code,
        netTaxed,
        netExempt,
        netUntaxed,
        ...buckets,
        perceptions,
        vatTotal,
        total: invoice.total.toNumber(),
        isCreditNote: false,
      });
    }

    for (const creditNote of creditNotes) {
      let netTaxed = 0;
      let netExempt = 0;
      let netUntaxed = 0;
      const buckets = { ...ZERO_BUCKET };
      for (const line of creditNote.lines) {
        const net = line.netAmount.toNumber();
        const kind = line.invoiceLine.taxKind;
        if (kind === 'EXENTO') netExempt += net;
        else if (kind === 'NO_GRAVADO') netUntaxed += net;
        else {
          netTaxed += net;
          bucketRate(line.invoiceLine.taxRate.toNumber(), line.taxAmount.toNumber(), buckets);
        }
      }
      const vatTotal = buckets.vat21 + buckets.vat10_5 + buckets.vat27 + buckets.vatOther;
      entries.push({
        id: creditNote.id,
        date: creditNote.issueDate.toISOString().slice(0, 10),
        documentType: `Nota de Crédito ${DOCUMENT_LETTER_LABEL[creditNote.documentLetter] ?? creditNote.documentLetter}`,
        documentLetter: creditNote.documentLetter,
        pointOfSale: creditNote.pointOfSale,
        number: creditNote.number,
        counterpartyName: creditNote.invoice.customerName,
        counterpartyTaxId: creditNote.invoice.customerTaxId,
        counterpartyDocType: counterpartyDocType(creditNote.invoice.customerTaxId),
        taxCondition: creditNote.invoice.customer.taxCondition,
        currencyCode: creditNote.currency.code,
        netTaxed: -netTaxed,
        netExempt: -netExempt,
        netUntaxed: -netUntaxed,
        vat21: -buckets.vat21,
        vat10_5: -buckets.vat10_5,
        vat27: -buckets.vat27,
        vatOther: -buckets.vatOther,
        perceptions: 0,
        vatTotal: -vatTotal,
        total: -creditNote.total.toNumber(),
        isCreditNote: true,
      });
    }

    entries.sort((a, b) => a.date.localeCompare(b.date));

    return {
      kind: 'sales',
      from: range.from.toISOString().slice(0, 10),
      to: range.to.toISOString().slice(0, 10),
      entries,
      totals: sumTotals(entries),
    };
  }

  /** Libro IVA Compras: una fila por Factura de compra + una por Nota de
   * Crédito de compra (negada). `PurchaseInvoiceTaxLine` guarda
   * `taxRate`/`netAmount` por fila de IVA Crédito desde el desglose por
   * alícuota (ver schema.prisma) - se bucketiza con el mismo `bucketRate`
   * que Ventas. Filas sin `taxRate` (comprobantes cargados antes de este
   * cambio, o cualquier fila vieja sin tasa) caen en `vatOther`, nunca se
   * pierden. `netTaxed` se deriva de la suma de `netAmount` de esas
   * filas cuando está disponible; si ninguna fila lo tiene (comprobante
   * viejo) cae a `subtotal` del comprobante completo, igual que antes. No
   * hay Neto Exento/No Gravado por línea (Compras no modela eso todavía).
   * Las retenciones que el propio tenant practica a
   * proveedores (`SupplierPaymentWithholding`) NO entran acá a propósito
   * - cuelgan de `SupplierPayment`, no de `PurchaseInvoice` (se practican
   * al pagar, no al facturar - ver decisión de arquitectura en
   * PROGRESS.md), así que mezclarlas en un libro fechado por comprobante
   * desalinearía el período. Sólo entran las Percepciones que el
   * proveedor ya cargó en su propia factura (`type: PERCEPCION`),
   * correctamente fechadas. */
  async getPurchasesBook(from?: string, to?: string): Promise<VatBookResult> {
    const range = defaultRange(from, to);
    const db = getTenantDb();

    const invoices = await db.purchaseInvoice.findMany({
      where: { supplierInvoiceDate: { gte: range.from, lte: range.to }, status: { not: 'CANCELLED' } },
      include: {
        taxLines: true,
        supplier: { select: { taxCondition: true } },
        currency: { select: { code: true } },
      },
      orderBy: { supplierInvoiceDate: 'asc' },
    });

    const creditNotes = await db.purchaseCreditNote.findMany({
      where: { supplierCreditNoteDate: { gte: range.from, lte: range.to }, status: { not: 'CANCELLED' } },
      include: {
        taxLines: true,
        supplier: { select: { taxCondition: true } },
        currency: { select: { code: true } },
      },
      orderBy: { supplierCreditNoteDate: 'asc' },
    });

    const entries: VatBookEntry[] = [];

    for (const invoice of invoices) {
      const ivaCreditoLines = invoice.taxLines.filter((l) => l.type === 'IVA_CREDITO');
      const buckets = { ...ZERO_BUCKET };
      let netTaxed = 0;
      let anyNetAmount = false;
      for (const l of ivaCreditoLines) {
        const amount = l.amount.toNumber();
        if (l.taxRate != null) bucketRate(l.taxRate.toNumber(), amount, buckets);
        else buckets.vatOther += amount;
        if (l.netAmount != null) {
          anyNetAmount = true;
          netTaxed += l.netAmount.toNumber();
        }
      }
      if (!anyNetAmount) netTaxed = invoice.subtotal.toNumber();
      const ivaCredito = buckets.vat21 + buckets.vat10_5 + buckets.vat27 + buckets.vatOther;
      const perceptions = invoice.taxLines
        .filter((l) => l.type === 'PERCEPCION')
        .reduce((sum, l) => sum + l.amount.toNumber(), 0);
      entries.push({
        id: invoice.id,
        date: invoice.supplierInvoiceDate.toISOString().slice(0, 10),
        documentType: 'Factura de compra',
        documentLetter: null,
        pointOfSale: null,
        number: invoice.supplierInvoiceNumber,
        counterpartyName: invoice.supplierName,
        counterpartyTaxId: invoice.supplierTaxId,
        counterpartyDocType: counterpartyDocType(invoice.supplierTaxId),
        taxCondition: invoice.supplier.taxCondition,
        currencyCode: invoice.currency.code,
        netTaxed,
        netExempt: 0,
        netUntaxed: 0,
        ...buckets,
        perceptions,
        vatTotal: ivaCredito,
        total: invoice.total.toNumber(),
        isCreditNote: false,
      });
    }

    for (const creditNote of creditNotes) {
      const ivaCreditoLines = creditNote.taxLines.filter((l) => l.type === 'IVA_CREDITO');
      const buckets = { ...ZERO_BUCKET };
      let netTaxed = 0;
      let anyNetAmount = false;
      for (const l of ivaCreditoLines) {
        const amount = l.amount.toNumber();
        if (l.taxRate != null) bucketRate(l.taxRate.toNumber(), amount, buckets);
        else buckets.vatOther += amount;
        if (l.netAmount != null) {
          anyNetAmount = true;
          netTaxed += l.netAmount.toNumber();
        }
      }
      if (!anyNetAmount) netTaxed = creditNote.subtotal.toNumber();
      const ivaCredito = buckets.vat21 + buckets.vat10_5 + buckets.vat27 + buckets.vatOther;
      const perceptions = creditNote.taxLines
        .filter((l) => l.type === 'PERCEPCION')
        .reduce((sum, l) => sum + l.amount.toNumber(), 0);
      entries.push({
        id: creditNote.id,
        date: creditNote.supplierCreditNoteDate.toISOString().slice(0, 10),
        documentType: 'Nota de Crédito de compra',
        documentLetter: null,
        pointOfSale: null,
        number: creditNote.supplierCreditNoteNumber,
        counterpartyName: creditNote.supplierName,
        counterpartyTaxId: creditNote.supplierTaxId,
        counterpartyDocType: counterpartyDocType(creditNote.supplierTaxId),
        taxCondition: creditNote.supplier.taxCondition,
        currencyCode: creditNote.currency.code,
        netTaxed: -netTaxed,
        netExempt: 0,
        netUntaxed: 0,
        vat21: -buckets.vat21,
        vat10_5: -buckets.vat10_5,
        vat27: -buckets.vat27,
        vatOther: -buckets.vatOther,
        perceptions: -perceptions,
        vatTotal: -ivaCredito,
        total: -creditNote.total.toNumber(),
        isCreditNote: true,
      });
    }

    entries.sort((a, b) => a.date.localeCompare(b.date));

    return {
      kind: 'purchases',
      from: range.from.toISOString().slice(0, 10),
      to: range.to.toISOString().slice(0, 10),
      entries,
      totals: sumTotals(entries),
    };
  }
}
