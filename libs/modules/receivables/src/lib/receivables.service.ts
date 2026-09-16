import { Injectable, NotFoundException } from '@nestjs/common';
import { getTenantDb, Prisma, type Invoice, type Company } from '@plexo/database';
import type { CalendarEntry } from '@plexo/types';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface AgingBuckets {
  current: Prisma.Decimal;
  days1to30: Prisma.Decimal;
  days31to60: Prisma.Decimal;
  days61to90: Prisma.Decimal;
  days90Plus: Prisma.Decimal;
}

export interface CustomerAging extends AgingBuckets {
  customerId: string;
  customerName: string;
  totalOutstanding: Prisma.Decimal;
}

export interface CustomerBalance {
  customerId: string;
  customerName: string;
  creditLimit: Prisma.Decimal;
  outstanding: Prisma.Decimal;
  availableCredit: Prisma.Decimal;
}

export type StatementEntryType = 'INVOICE' | 'CREDIT_NOTE' | 'RECEIPT';

export interface CustomerStatementEntry {
  id: string;
  date: Date;
  type: StatementEntryType;
  documentNumber: string;
  dueDate: Date | null;
  debe: Prisma.Decimal;
  haber: Prisma.Decimal;
  /** Saldo Acumulado - corrido sobre TODO el historial (no sólo lo
   * visible si se filtra por fecha/pendingOnly), mismo criterio que un
   * extracto bancario real. */
  balance: Prisma.Decimal;
  /** Sólo en filas INVOICE - las de CREDIT_NOTE/RECEIPT quedan
   * completamente aplicadas al crearse, no tienen saldo propio. */
  status: string | null;
  pendingBalance: Prisma.Decimal | null;
}

export interface CustomerStatement {
  customerId: string;
  customerName: string;
  creditLimit: Prisma.Decimal;
  /** Métricas de "cuánto me debe ahora" - siempre sobre el saldo abierto
   * completo del cliente, sin importar el rango de fechas de `entries`.
   * "Total a favor" queda deliberadamente afuera - un Recibo/NC nunca
   * puede superar el balanceDue de la factura que cancela (ver
   * recordReceipt/createCreditNote), así que hoy no existe ningún saldo a
   * favor que mostrar. */
  totalOutstanding: Prisma.Decimal;
  totalOverdue: Prisma.Decimal;
  totalNotYetDue: Prisma.Decimal;
  entries: CustomerStatementEntry[];
}

export interface GetCustomerStatementOptions {
  from?: Date;
  to?: Date;
  /** Sólo deja visibles las filas INVOICE con saldo pendiente > 0 (oculta
   * NC/Recibos y facturas ya saldadas) - el saldo acumulado de cada fila
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

/** No dueDate at all -> can't establish overdue-ness, treat as current. */
function bucketFor(daysOverdue: number): keyof AgingBuckets {
  if (daysOverdue <= 0) return 'current';
  if (daysOverdue <= 30) return 'days1to30';
  if (daysOverdue <= 60) return 'days31to60';
  if (daysOverdue <= 90) return 'days61to90';
  return 'days90Plus';
}

const INVOICE_STATUS_LABELS: Record<Invoice['status'], string> = {
  DRAFT: 'Borrador',
  ISSUED: 'Impago',
  PARTIALLY_PAID: 'Pago parcial',
  PAID: 'Totalmente imputado',
  OVERDUE: 'Vencida',
  CANCELLED: 'Cancelada',
};

function invoiceDocumentNumber(invoice: { documentLetter: string; pointOfSale: string; number: string }): string {
  return `${invoice.documentLetter} ${invoice.pointOfSale}-${invoice.number}`;
}

@Injectable()
export class ReceivablesService {
  /**
   * Buckets every open invoice (balanceDue > 0) by days overdue, per
   * customer. Computed on read from dueDate/balanceDue directly, not from
   * Invoice.status - nothing keeps that column fresh in real time (see
   * refreshOverdueStatuses), so a report that trusted it could show a
   * customer as current when they're actually 60 days late.
   */
  async getAgingReport(asOf: Date = new Date()): Promise<CustomerAging[]> {
    const invoices = await getTenantDb().invoice.findMany({
      where: { balanceDue: { gt: 0 } },
      include: { customer: true },
    });

    const byCustomer = new Map<string, CustomerAging>();
    for (const invoice of invoices) {
      const daysOverdue = invoice.dueDate
        ? Math.floor((asOf.getTime() - invoice.dueDate.getTime()) / DAY_MS)
        : -1;
      const bucket = bucketFor(daysOverdue);

      let entry = byCustomer.get(invoice.customerId);
      if (!entry) {
        entry = {
          customerId: invoice.customerId,
          customerName: invoice.customer.name,
          totalOutstanding: new Prisma.Decimal(0),
          ...emptyBuckets(),
        };
        byCustomer.set(invoice.customerId, entry);
      }

      entry[bucket] = entry[bucket].add(invoice.balanceDue);
      entry.totalOutstanding = entry.totalOutstanding.add(invoice.balanceDue);
    }

    return [...byCustomer.values()].sort((a, b) => b.totalOutstanding.cmp(a.totalOutstanding));
  }

  /** Función pura de la Agenda (ver docs/plan-agenda.md) - sólo toca su
   * propia tabla, nunca importa otro módulo de negocio. Sólo facturas con
   * saldo pendiente (balanceDue > 0): una ya cobrada no es un "vencimiento
   * de cobro" real, aunque su dueDate caiga en el rango. */
  async getCalendarEntries(from: Date, to: Date): Promise<CalendarEntry[]> {
    const invoices = await getTenantDb().invoice.findMany({
      where: { balanceDue: { gt: 0 }, dueDate: { gte: from, lte: to } },
    });
    return invoices.map((invoice) => ({
      id: invoice.id,
      source: 'collect',
      title: invoice.customerName,
      date: (invoice.dueDate as Date).toISOString(),
      amount: invoice.balanceDue.toNumber(),
      flow: 'in',
      ref: invoiceDocumentNumber(invoice),
      editable: false,
      link: { module: 'invoice', id: invoice.id },
    }));
  }

  async listCustomerBalances(): Promise<CustomerBalance[]> {
    const db = getTenantDb();
    const grouped = await db.invoice.groupBy({
      by: ['customerId'],
      where: { balanceDue: { gt: 0 } },
      _sum: { balanceDue: true },
    });
    if (grouped.length === 0) {
      return [];
    }

    const customers = await db.company.findMany({
      where: { id: { in: grouped.map((g) => g.customerId) } },
    });
    const customerById = new Map<string, Company>(customers.map((c) => [c.id, c]));

    return grouped
      .map((g) => {
        const customer = customerById.get(g.customerId);
        const outstanding = g._sum.balanceDue ?? new Prisma.Decimal(0);
        const creditLimit = customer?.creditLimit ?? new Prisma.Decimal(0);
        return {
          customerId: g.customerId,
          customerName: customer?.name ?? 'Unknown',
          creditLimit,
          outstanding,
          availableCredit: creditLimit.sub(outstanding),
        };
      })
      .sort((a, b) => b.outstanding.cmp(a.outstanding));
  }

  /** Mayor de Auxiliares del cliente: Facturas (Debe) + Notas de Crédito
   * (Haber) + Recibos (Haber) mergeados en orden cronológico con Saldo
   * Acumulado. No hay ajuste de retenciones acá (a diferencia del espejo
   * en @plexo/payables) - Receipt.amount ya es el monto completo aplicado
   * a balanceDue, del lado de Ventas no se modelan retenciones que el
   * cliente practique todavía. Se excluye CANCELLED en facturas, mismo
   * criterio que CitiExportService/VatBookService - CreditNote no tiene
   * status propio, no hay nada que filtrar ahí. */
  async getCustomerStatement(
    customerId: string,
    options: GetCustomerStatementOptions = {},
  ): Promise<CustomerStatement> {
    const db = getTenantDb();
    const customer = await db.company.findUnique({ where: { id: customerId } });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const openInvoices = await db.invoice.findMany({
      where: { customerId, balanceDue: { gt: 0 } },
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

    // `to` es inclusivo del día completo - mismo ajuste que
    // PayablesService.getSupplierStatement.
    const inclusiveTo = options.to ? new Date(options.to.getTime() + DAY_MS - 1) : undefined;
    const dateRange =
      options.from || options.to ? { gte: options.from, lte: inclusiveTo } : undefined;

    const [invoices, creditNotes, receipts] = await Promise.all([
      db.invoice.findMany({
        where: {
          customerId,
          status: { not: 'CANCELLED' },
          ...(dateRange ? { issueDate: dateRange } : {}),
        },
      }),
      db.creditNote.findMany({
        where: {
          invoice: { customerId },
          ...(dateRange ? { issueDate: dateRange } : {}),
        },
        include: { invoice: { select: { documentLetter: true, pointOfSale: true, number: true } } },
      }),
      db.receipt.findMany({
        where: {
          invoice: { customerId },
          ...(dateRange ? { paidAt: dateRange } : {}),
        },
        include: { invoice: { select: { documentLetter: true, pointOfSale: true, number: true } } },
      }),
    ]);

    type Draft = Omit<CustomerStatementEntry, 'balance'> & { sortPriority: number };

    const drafts: Draft[] = [
      ...invoices.map(
        (invoice): Draft => ({
          id: invoice.id,
          date: invoice.issueDate,
          type: 'INVOICE',
          documentNumber: invoiceDocumentNumber(invoice),
          dueDate: invoice.dueDate,
          debe: invoice.total,
          haber: new Prisma.Decimal(0),
          status: INVOICE_STATUS_LABELS[invoice.status],
          pendingBalance: invoice.balanceDue,
          sortPriority: 0,
        }),
      ),
      ...creditNotes.map(
        (creditNote): Draft => ({
          id: creditNote.id,
          date: creditNote.issueDate,
          type: 'CREDIT_NOTE',
          documentNumber: `NC ${creditNote.documentLetter} ${creditNote.pointOfSale}-${creditNote.number} (Fact. ${invoiceDocumentNumber(creditNote.invoice)})`,
          dueDate: null,
          debe: new Prisma.Decimal(0),
          haber: creditNote.total,
          status: null,
          pendingBalance: null,
          sortPriority: 1,
        }),
      ),
      ...receipts.map(
        (receipt): Draft => ({
          id: receipt.id,
          date: receipt.paidAt,
          type: 'RECEIPT',
          documentNumber: `Recibo (${receipt.method}) - Fact. ${invoiceDocumentNumber(receipt.invoice)}`,
          dueDate: null,
          debe: new Prisma.Decimal(0),
          haber: receipt.amount,
          status: null,
          pendingBalance: null,
          sortPriority: 1,
        }),
      ),
    ];

    // Orden cronológico; en empate de fecha, Factura/NC antes que Recibo, y
    // `id` como desempate final estable.
    drafts.sort((a, b) => {
      const dateDiff = a.date.getTime() - b.date.getTime();
      if (dateDiff !== 0) return dateDiff;
      if (a.sortPriority !== b.sortPriority) return a.sortPriority - b.sortPriority;
      return a.id.localeCompare(b.id);
    });

    let runningBalance = new Prisma.Decimal(0);
    const entries: CustomerStatementEntry[] = drafts.map((draft) => {
      runningBalance = runningBalance.add(draft.debe).sub(draft.haber);
      const { id, date, type, documentNumber, dueDate, debe, haber, status, pendingBalance } = draft;
      return { id, date, type, documentNumber, dueDate, debe, haber, status, pendingBalance, balance: runningBalance };
    });

    const visibleEntries = options.pendingOnly
      ? entries.filter((entry) => entry.type === 'INVOICE' && entry.pendingBalance?.gt(0))
      : entries;

    return {
      customerId,
      customerName: customer.name,
      creditLimit: customer.creditLimit,
      totalOutstanding,
      totalOverdue,
      totalNotYetDue,
      entries: visibleEntries,
    };
  }

  listOverdueInvoices(asOf: Date = new Date()): Promise<Invoice[]> {
    return getTenantDb().invoice.findMany({
      where: { balanceDue: { gt: 0 }, dueDate: { lt: asOf } },
      orderBy: { dueDate: 'asc' },
    });
  }

  /**
   * The invoices refreshOverdueStatuses() is about to flip below - i.e.
   * exactly the ones that just crossed into overdue, not every invoice
   * that's already OVERDUE (which would mean re-alerting on the same
   * invoice every single day forever). Call this BEFORE
   * refreshOverdueStatuses() in the same tenant context so it still sees
   * their pre-transition status; ReceivablesSchedulerService (apps/api)
   * is the one caller today, using the result to send one overdue-alert
   * email per invoice via InvoicingService.
   */
  listInvoicesBecomingOverdue(asOf: Date = new Date()): Promise<(Invoice & { customer: Company })[]> {
    return getTenantDb().invoice.findMany({
      where: {
        balanceDue: { gt: 0 },
        dueDate: { lt: asOf },
        status: { in: ['ISSUED', 'PARTIALLY_PAID'] },
      },
      include: { customer: true },
      orderBy: { dueDate: 'asc' },
    });
  }

  /**
   * Invoices already OVERDUE (not the ones just crossing into it - see
   * listInvoicesBecomingOverdue for those) that haven't been reminded in at
   * least intervalDays. Gated by TenantSettings.arReminderIntervalDays -
   * only called by ReceivablesSchedulerService when a tenant has opted
   * into recurring reminders (see runReminderSweepForCurrentTenant there).
   * Never reminded yet (lastOverdueReminderAt IS NULL) also qualifies -
   * that shouldn't normally happen (becomingOverdue + markReminderSent
   * together stamp every invoice the moment it turns OVERDUE), but an
   * invoice that turned OVERDUE before this feature existed would
   * otherwise never qualify for a first recurring reminder.
   */
  listInvoicesNeedingRecurringReminder(
    intervalDays: number,
    asOf: Date = new Date(),
  ): Promise<(Invoice & { customer: Company })[]> {
    const cutoff = new Date(asOf.getTime() - intervalDays * DAY_MS);
    return getTenantDb().invoice.findMany({
      where: {
        balanceDue: { gt: 0 },
        status: 'OVERDUE',
        OR: [{ lastOverdueReminderAt: null }, { lastOverdueReminderAt: { lte: cutoff } }],
      },
      include: { customer: true },
      orderBy: { dueDate: 'asc' },
    });
  }

  /** Stamps "just reminded" on a batch of invoices - called once per sweep
   * after every alert email in it (initial + recurring) has gone out, so
   * the same invoice can't qualify for both listInvoicesBecomingOverdue
   * AND listInvoicesNeedingRecurringReminder on the very next day's run. */
  async markReminderSent(invoiceIds: string[], asOf: Date = new Date()): Promise<void> {
    if (invoiceIds.length === 0) return;
    await getTenantDb().invoice.updateMany({
      where: { id: { in: invoiceIds } },
      data: { lastOverdueReminderAt: asOf },
    });
  }

  /**
   * Syncs the stored Invoice.status to OVERDUE where it's warranted.
   * Reports above don't depend on this having run; this is only for code
   * elsewhere that filters directly on the status column. Called daily,
   * per tenant, by ReceivablesSchedulerService (apps/api) - also callable
   * manually via POST /receivables/overdue/refresh.
   */
  async refreshOverdueStatuses(asOf: Date = new Date()): Promise<{ updated: number }> {
    const result = await getTenantDb().invoice.updateMany({
      where: {
        balanceDue: { gt: 0 },
        dueDate: { lt: asOf },
        status: { in: ['ISSUED', 'PARTIALLY_PAID'] },
      },
      data: { status: 'OVERDUE' },
    });
    return { updated: result.count };
  }
}
