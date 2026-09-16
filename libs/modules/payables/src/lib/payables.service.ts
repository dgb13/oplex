import { Injectable, NotFoundException } from '@nestjs/common';
import { getTenantDb, Prisma, type Company, type PurchaseInvoice } from '@plexo/database';
import type { CalendarEntry } from '@plexo/types';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface AgingBuckets {
  current: Prisma.Decimal;
  days1to30: Prisma.Decimal;
  days31to60: Prisma.Decimal;
  days61to90: Prisma.Decimal;
  days90Plus: Prisma.Decimal;
}

export interface SupplierAging extends AgingBuckets {
  supplierId: string;
  supplierName: string;
  totalOutstanding: Prisma.Decimal;
}

export interface SupplierBalance {
  supplierId: string;
  supplierName: string;
  outstanding: Prisma.Decimal;
}

export type StatementEntryType = 'INVOICE' | 'CREDIT_NOTE' | 'PAYMENT';

export interface SupplierStatementEntry {
  id: string;
  date: Date;
  type: StatementEntryType;
  documentNumber: string;
  dueDate: Date | null;
  debe: Prisma.Decimal;
  haber: Prisma.Decimal;
  /** Saldo Acumulado - corrido sobre TODO el historial (no sólo lo
   * visible si se filtra por fecha/pendingOnly), mismo criterio que un
   * extracto bancario real: el saldo de una fila no cambia según qué
   * ventana estés mirando. */
  balance: Prisma.Decimal;
  /** Sólo en filas INVOICE - las de CREDIT_NOTE/PAYMENT quedan
   * completamente aplicadas al crearse, no tienen saldo propio. */
  status: string | null;
  pendingBalance: Prisma.Decimal | null;
}

export interface SupplierStatement {
  supplierId: string;
  supplierName: string;
  /** Métricas de "cuánto le debo ahora" - siempre sobre el saldo abierto
   * completo del proveedor, sin importar el rango de fechas de `entries`
   * (mismo criterio que ya tenía totalOutstanding). "Total a favor" queda
   * deliberadamente afuera: pagos/NC nunca pueden superar el balanceDue de
   * la factura que cancelan (ver recordPayment/PurchaseCreditNoteService),
   * así que hoy no existe ningún saldo a favor que mostrar. */
  totalOutstanding: Prisma.Decimal;
  totalOverdue: Prisma.Decimal;
  totalNotYetDue: Prisma.Decimal;
  entries: SupplierStatementEntry[];
}

export interface GetSupplierStatementOptions {
  from?: Date;
  to?: Date;
  /** Sólo deja visibles las filas INVOICE con saldo pendiente > 0 (oculta
   * NC/Pagos y facturas ya saldadas) - el saldo acumulado de cada fila
   * visible sigue siendo el real, calculado sobre el historial completo. */
  pendingOnly?: boolean;
}

function emptyBuckets(): AgingBuckets {
  return {
    current: new Prisma.Decimal(0),
    days1to30: new Prisma.Decimal(0),
    days31to60: new Prisma.Decimal(0),
    days61to90: new Prisma.Decimal(0),
    days90Plus: new Prisma.Decimal(0),
  };
}

/** No dueDate at all -> can't establish overdue-ness, treat as current -
 * same criterion as ReceivablesService.bucketFor (the AR equivalent). */
function bucketFor(daysOverdue: number): keyof AgingBuckets {
  if (daysOverdue <= 0) return 'current';
  if (daysOverdue <= 30) return 'days1to30';
  if (daysOverdue <= 60) return 'days31to60';
  if (daysOverdue <= 90) return 'days61to90';
  return 'days90Plus';
}

const INVOICE_STATUS_LABELS: Record<PurchaseInvoice['status'], string> = {
  ISSUED: 'Impago',
  PARTIALLY_PAID: 'Pago parcial',
  PAID: 'Totalmente imputado',
  CANCELLED: 'Cancelada',
};

/**
 * Pure reporting on top of PurchaseInvoice/SupplierPayment (created by
 * @plexo/purchases' PurchaseInvoiceService) - never imports that Service
 * directly (this repo's rule: a lib module never imports another module's
 * Service), reads the tables straight via getTenantDb() instead, same
 * relationship ReceivablesService already has with InvoicingService's
 * Invoice/Receipt.
 */
@Injectable()
export class PayablesService {
  /** Mirrors ReceivablesService.getAgingReport() field-for-field, customer
   * -> supplier. Computed on read from dueDate/balanceDue directly, not
   * from PurchaseInvoice.status. */
  async getAgingReport(asOf: Date = new Date()): Promise<SupplierAging[]> {
    const invoices = await getTenantDb().purchaseInvoice.findMany({
      where: { balanceDue: { gt: 0 } },
      include: { supplier: true },
    });

    const bySupplier = new Map<string, SupplierAging>();
    for (const invoice of invoices) {
      const daysOverdue = invoice.dueDate
        ? Math.floor((asOf.getTime() - invoice.dueDate.getTime()) / DAY_MS)
        : -1;
      const bucket = bucketFor(daysOverdue);

      let entry = bySupplier.get(invoice.supplierId);
      if (!entry) {
        entry = {
          supplierId: invoice.supplierId,
          supplierName: invoice.supplier.name,
          totalOutstanding: new Prisma.Decimal(0),
          ...emptyBuckets(),
        };
        bySupplier.set(invoice.supplierId, entry);
      }

      entry[bucket] = entry[bucket].add(invoice.balanceDue);
      entry.totalOutstanding = entry.totalOutstanding.add(invoice.balanceDue);
    }

    return [...bySupplier.values()].sort((a, b) => b.totalOutstanding.cmp(a.totalOutstanding));
  }

  /** Función pura de la Agenda (ver docs/plan-agenda.md) - sólo toca su
   * propia tabla, nunca importa otro módulo de negocio. Sólo facturas con
   * saldo pendiente y dueDate cargado (PurchaseInvoice.dueDate es opcional -
   * sin fecha de vencimiento no hay nada que agendar, mismo criterio que
   * getAgingReport la trata como "corriente" en vez de excluirla ahí). */
  async getCalendarEntries(from: Date, to: Date): Promise<CalendarEntry[]> {
    const invoices = await getTenantDb().purchaseInvoice.findMany({
      where: { balanceDue: { gt: 0 }, dueDate: { gte: from, lte: to } },
    });
    return invoices.map((invoice) => ({
      id: invoice.id,
      source: 'pay',
      title: invoice.supplierName,
      date: (invoice.dueDate as Date).toISOString(),
      amount: invoice.balanceDue.toNumber(),
      flow: 'out',
      ref: invoice.supplierInvoiceNumber,
      editable: false,
      link: { module: 'purchase-invoice', id: invoice.id },
    }));
  }

  /** Mirrors ReceivablesService.listCustomerBalances() - no credit-limit
   * column on the purchases side (Company.creditLimit is meaningful for a
   * CUSTOMER extending US credit, not the other way around), so this is
   * just outstanding balance per supplier. */
  async listSupplierBalances(): Promise<SupplierBalance[]> {
    const db = getTenantDb();
    const grouped = await db.purchaseInvoice.groupBy({
      by: ['supplierId'],
      where: { balanceDue: { gt: 0 } },
      _sum: { balanceDue: true },
    });
    if (grouped.length === 0) {
      return [];
    }

    const suppliers = await db.company.findMany({
      where: { id: { in: grouped.map((g) => g.supplierId) } },
    });
    const supplierById = new Map<string, Company>(suppliers.map((s) => [s.id, s]));

    return grouped
      .map((g) => ({
        supplierId: g.supplierId,
        supplierName: supplierById.get(g.supplierId)?.name ?? 'Unknown',
        outstanding: g._sum.balanceDue ?? new Prisma.Decimal(0),
      }))
      .sort((a, b) => b.outstanding.cmp(a.outstanding));
  }

  /** Mayor de Auxiliares del proveedor: Facturas (Haber) + Notas de
   * Crédito (Debe) + Órdenes de Pago (Debe, incluidas sus retenciones - ver
   * PurchaseInvoiceService.recordPayment, lo que realmente extingue la
   * deuda es amount + Σwithholdings, no sólo amount) mergeadas en orden
   * cronológico con Saldo Acumulado. Se excluye status CANCELLED en
   * facturas/NC, mismo criterio que CitiExportService/VatBookService. */
  async getSupplierStatement(
    supplierId: string,
    options: GetSupplierStatementOptions = {},
  ): Promise<SupplierStatement> {
    const db = getTenantDb();
    const supplier = await db.company.findUnique({ where: { id: supplierId } });
    if (!supplier) {
      throw new NotFoundException('Supplier not found');
    }

    const openInvoices = await db.purchaseInvoice.findMany({
      where: { supplierId, balanceDue: { gt: 0 } },
    });
    const now = new Date();
    let totalOutstanding = new Prisma.Decimal(0);
    let totalOverdue = new Prisma.Decimal(0);
    for (const invoice of openInvoices) {
      totalOutstanding = totalOutstanding.add(invoice.balanceDue);
      if (invoice.dueDate && invoice.dueDate < now) {
        totalOverdue = totalOverdue.add(invoice.balanceDue);
      }
    }
    const totalNotYetDue = totalOutstanding.sub(totalOverdue);

    // `to` es inclusivo del día completo - sin esto, un movimiento cargado
    // más tarde el mismo día que `to` quedaría afuera (mismo ajuste que
    // VatBookService.defaultRange ya hace para su propio rango).
    const inclusiveTo = options.to ? new Date(options.to.getTime() + DAY_MS - 1) : undefined;
    const dateRange =
      options.from || options.to ? { gte: options.from, lte: inclusiveTo } : undefined;

    const [invoices, creditNotes, payments] = await Promise.all([
      db.purchaseInvoice.findMany({
        where: {
          supplierId,
          status: { not: 'CANCELLED' },
          ...(dateRange ? { supplierInvoiceDate: dateRange } : {}),
        },
      }),
      db.purchaseCreditNote.findMany({
        where: {
          supplierId,
          status: { not: 'CANCELLED' },
          ...(dateRange ? { supplierCreditNoteDate: dateRange } : {}),
        },
        include: { purchaseInvoice: { select: { supplierInvoiceNumber: true } } },
      }),
      db.supplierPayment.findMany({
        where: {
          purchaseInvoice: { supplierId },
          ...(dateRange ? { paidAt: dateRange } : {}),
        },
        include: { withholdings: true, purchaseInvoice: { select: { supplierInvoiceNumber: true } } },
      }),
    ]);

    type Draft = Omit<SupplierStatementEntry, 'balance'> & { sortPriority: number };

    const drafts: Draft[] = [
      ...invoices.map(
        (invoice): Draft => ({
          id: invoice.id,
          date: invoice.supplierInvoiceDate,
          type: 'INVOICE',
          documentNumber: invoice.supplierInvoiceNumber,
          dueDate: invoice.dueDate,
          debe: new Prisma.Decimal(0),
          haber: invoice.total,
          status: INVOICE_STATUS_LABELS[invoice.status],
          pendingBalance: invoice.balanceDue,
          sortPriority: 0,
        }),
      ),
      ...creditNotes.map(
        (creditNote): Draft => ({
          id: creditNote.id,
          date: creditNote.supplierCreditNoteDate,
          type: 'CREDIT_NOTE',
          documentNumber: `NC ${creditNote.supplierCreditNoteNumber} (Fact. ${creditNote.purchaseInvoice.supplierInvoiceNumber})`,
          dueDate: null,
          debe: creditNote.total,
          haber: new Prisma.Decimal(0),
          status: null,
          pendingBalance: null,
          sortPriority: 1,
        }),
      ),
      ...payments.map((payment): Draft => {
        const totalWithheld = payment.withholdings.reduce(
          (sum, w) => sum.add(w.amount),
          new Prisma.Decimal(0),
        );
        return {
          id: payment.id,
          date: payment.paidAt,
          type: 'PAYMENT',
          documentNumber: `Pago (${payment.method}) - Fact. ${payment.purchaseInvoice.supplierInvoiceNumber}`,
          dueDate: null,
          debe: payment.amount.add(totalWithheld),
          haber: new Prisma.Decimal(0),
          status: null,
          pendingBalance: null,
          sortPriority: 1,
        };
      }),
    ];

    // Orden cronológico; en empate de fecha, Factura/NC antes que Pago, y
    // `id` como desempate final estable (no depende del orden en que
    // Promise.all resolvió cada findMany).
    drafts.sort((a, b) => {
      const dateDiff = a.date.getTime() - b.date.getTime();
      if (dateDiff !== 0) return dateDiff;
      if (a.sortPriority !== b.sortPriority) return a.sortPriority - b.sortPriority;
      return a.id.localeCompare(b.id);
    });

    let runningBalance = new Prisma.Decimal(0);
    const entries: SupplierStatementEntry[] = drafts.map((draft) => {
      runningBalance = runningBalance.add(draft.haber).sub(draft.debe);
      const { id, date, type, documentNumber, dueDate, debe, haber, status, pendingBalance } = draft;
      return { id, date, type, documentNumber, dueDate, debe, haber, status, pendingBalance, balance: runningBalance };
    });

    const visibleEntries = options.pendingOnly
      ? entries.filter((entry) => entry.type === 'INVOICE' && entry.pendingBalance?.gt(0))
      : entries;

    return {
      supplierId,
      supplierName: supplier.name,
      totalOutstanding,
      totalOverdue,
      totalNotYetDue,
      entries: visibleEntries,
    };
  }
}
