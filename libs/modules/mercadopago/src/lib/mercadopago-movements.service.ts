import { Injectable } from '@nestjs/common';
import { getTenantDb, getTenantId, type Prisma } from '@plexo/database';
import ExcelJS from 'exceljs';

export type MovementOriginFilter = 'all' | 'caja' | 'docs' | 'outside' | 'unassigned';

export interface MovementsQuery {
  from?: string; // YYYY-MM-DD, inclusive
  to?: string; // YYYY-MM-DD, inclusive
  origin?: MovementOriginFilter;
  page?: number;
}

export type OplexState = 'ASSIGNED' | 'UNASSIGNED' | 'REFUNDED' | 'QUOTE_PAID' | 'PENDING' | 'OUTSIDE';

export interface MovementRow {
  id: string;
  mpPaymentId: string;
  date: string;
  originKind: 'CAJA' | 'FACTURA' | 'COTIZACION' | 'FUERA';
  originLabel: string;
  originDetail: string;
  payerEmail: string | null;
  method: string;
  currency: string;
  gross: string;
  fee: string;
  net: string | null;
  refunded: string;
  releaseDate: string | null;
  released: boolean;
  mpStatus: string;
  mpStatusLabel: string;
  oplexState: OplexState;
  oplexLabel: string;
  /** Caja del cobro QR sin asignar - para ir a asignarlo desde Caja. */
  registerId: string | null;
}

export interface MovementsPage {
  rows: MovementRow[];
  total: number;
  page: number;
  pageSize: number;
  unassignedCount: number;
  lastSyncAt: string | null;
}

const PAGE_SIZE = 50;
const EXPORT_LIMIT = 10_000;
// Rechazados y cancelados no son cobros: no se listan.
const LISTED_STATUSES = ['approved', 'refunded', 'charged_back', 'in_mediation', 'pending', 'in_process', 'authorized'];

const PAYMENT_TYPE_LABEL: Record<string, string> = {
  credit_card: 'Crédito',
  debit_card: 'Débito',
  prepaid_card: 'Prepaga',
  account_money: 'Dinero en cuenta',
  ticket: 'Efectivo',
  bank_transfer: 'Transferencia',
  atm: 'Cajero',
  digital_currency: 'Mercado Crédito',
  digital_wallet: 'Billetera',
};

const MP_STATUS_LABEL: Record<string, string> = {
  approved: 'Aprobado',
  refunded: 'Devuelto',
  charged_back: 'Contracargo',
  in_mediation: 'En reclamo',
  pending: 'Pendiente',
  in_process: 'En revisión',
  authorized: 'Autorizado',
};

function methodLabel(paymentTypeId: string | null, installments: number | null): string {
  const base = (paymentTypeId && PAYMENT_TYPE_LABEL[paymentTypeId]) ?? 'Otro';
  return installments && installments > 1 ? `${base} · ${installments} cuotas` : base;
}

/** Inicio del día en Argentina (UTC-3, sin horario de verano). */
function dayStart(date: string): Date {
  return new Date(`${date}T00:00:00-03:00`);
}

/**
 * Movimientos de la sección Mercado Pago (etapa 2 de
 * plan-seccion-mercadopago.md): los pagos sincronizados en
 * MercadoPagoPayment, cruzados con nuestros cobros (PaymentIntent) para
 * decir de dónde vino cada uno y si está asignado en Oplex.
 */
@Injectable()
export class MercadoPagoMovementsService {
  async list(query: MovementsQuery): Promise<MovementsPage> {
    const db = getTenantDb();
    const page = Math.max(1, query.page ?? 1);
    const where = await this.where(query);
    const [payments, total, unassignedCount, settings] = await Promise.all([
      db.mercadoPagoPayment.findMany({
        where,
        orderBy: { dateCreated: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      db.mercadoPagoPayment.count({ where }),
      this.unassignedCount(),
      db.tenantSettings.findUnique({ where: { tenantId: getTenantId() }, select: { mercadoPagoLastSyncAt: true } }),
    ]);
    return {
      rows: await this.toRows(payments),
      total,
      page,
      pageSize: PAGE_SIZE,
      unassignedCount,
      lastSyncAt: settings?.mercadoPagoLastSyncAt?.toISOString() ?? null,
    };
  }

  async exportExcel(query: MovementsQuery): Promise<Buffer> {
    const payments = await getTenantDb().mercadoPagoPayment.findMany({
      where: await this.where(query),
      orderBy: { dateCreated: 'desc' },
      take: EXPORT_LIMIT,
    });
    return buildMovementsWorkbook(await this.toRows(payments), query);
  }

  private async where(query: MovementsQuery): Promise<Prisma.MercadoPagoPaymentWhereInput> {
    const where: Prisma.MercadoPagoPaymentWhereInput = { status: { in: LISTED_STATUSES } };
    if (query.from || query.to) {
      where.dateCreated = {
        ...(query.from ? { gte: dayStart(query.from) } : {}),
        ...(query.to ? { lt: new Date(dayStart(query.to).getTime() + 24 * 60 * 60 * 1000) } : {}),
      };
    }
    switch (query.origin) {
      case 'outside':
        where.paymentIntentId = null;
        break;
      case 'caja':
      case 'docs':
      case 'unassigned': {
        const intents = await getTenantDb().paymentIntent.findMany({
          where:
            query.origin === 'caja'
              ? { documentType: 'POS_QR' }
              : query.origin === 'docs'
                ? { documentType: { in: ['INVOICE', 'QUOTE'] } }
                : { documentType: 'POS_QR', status: 'PAID', consumedByInvoiceId: null },
          select: { id: true },
        });
        where.paymentIntentId = { in: intents.map((i) => i.id) };
        break;
      }
    }
    return where;
  }

  /** Cobros con QR acreditados que no quedaron en ninguna venta. */
  private unassignedCount(): Promise<number> {
    return getTenantDb().paymentIntent.count({
      where: { documentType: 'POS_QR', status: 'PAID', consumedByInvoiceId: null },
    });
  }

  private async toRows(
    payments: Prisma.MercadoPagoPaymentGetPayload<Record<string, never>>[],
  ): Promise<MovementRow[]> {
    const db = getTenantDb();
    const intentIds = payments.map((p) => p.paymentIntentId).filter((id): id is string => !!id);
    const intents = intentIds.length
      ? await db.paymentIntent.findMany({
          where: { id: { in: intentIds } },
          select: { id: true, documentType: true, documentId: true, status: true, consumedByInvoiceId: true },
        })
      : [];
    const invoiceIds = intents.flatMap((i) =>
      i.documentType === 'INVOICE' ? [i.documentId] : i.consumedByInvoiceId ? [i.consumedByInvoiceId] : [],
    );
    const quoteIds = intents.filter((i) => i.documentType === 'QUOTE').map((i) => i.documentId);
    const registerIds = intents.filter((i) => i.documentType === 'POS_QR').map((i) => i.documentId);
    const [invoices, quotes, registers] = await Promise.all([
      invoiceIds.length
        ? db.invoice.findMany({
            where: { id: { in: invoiceIds } },
            select: { id: true, documentLetter: true, pointOfSale: true, number: true, customerName: true },
          })
        : [],
      quoteIds.length
        ? db.quote.findMany({
            where: { id: { in: quoteIds } },
            select: { id: true, number: true, customer: { select: { name: true } } },
          })
        : [],
      registerIds.length
        ? db.cashRegister.findMany({ where: { id: { in: registerIds } }, select: { id: true, name: true } })
        : [],
    ]);
    const intentById = new Map(intents.map((i) => [i.id, i]));
    const invoiceById = new Map(invoices.map((i) => [i.id, i]));
    const quoteById = new Map(quotes.map((q) => [q.id, q]));
    const registerById = new Map(registers.map((r) => [r.id, r]));
    const invoiceLabel = (id: string) => {
      const inv = invoiceById.get(id);
      return inv ? `Factura ${inv.documentLetter} ${inv.pointOfSale}-${inv.number}` : 'Factura';
    };
    const now = Date.now();

    return payments.map((p) => {
      const intent = p.paymentIntentId ? intentById.get(p.paymentIntentId) : undefined;
      const refunded = p.status === 'refunded' || intent?.status === 'REFUNDED';
      let originKind: MovementRow['originKind'] = 'FUERA';
      let originLabel = 'Fuera de Oplex';
      let originDetail = p.description ?? 'Cobrado directo en Mercado Pago';
      let oplexState: OplexState = 'OUTSIDE';
      let oplexLabel = 'Fuera de Oplex';
      let registerId: string | null = null;

      if (intent?.documentType === 'POS_QR') {
        originKind = 'CAJA';
        originLabel = registerById.get(intent.documentId)?.name ?? 'Caja';
        originDetail = 'QR';
        if (intent.consumedByInvoiceId) {
          oplexState = 'ASSIGNED';
          oplexLabel = invoiceLabel(intent.consumedByInvoiceId);
        } else if (intent.status === 'PAID') {
          oplexState = 'UNASSIGNED';
          oplexLabel = 'Sin asignar a una venta';
          registerId = intent.documentId;
        } else {
          oplexState = 'PENDING';
          oplexLabel = 'Sin venta';
        }
      } else if (intent?.documentType === 'INVOICE') {
        originKind = 'FACTURA';
        originLabel = invoiceLabel(intent.documentId);
        originDetail = `Link · ${invoiceById.get(intent.documentId)?.customerName ?? ''}`.replace(/ · $/, '');
        oplexState = intent.status === 'PAID' ? 'ASSIGNED' : 'PENDING';
        oplexLabel = intent.status === 'PAID' ? 'Cobro en la factura' : 'Sin registrar';
      } else if (intent?.documentType === 'QUOTE') {
        const quote = quoteById.get(intent.documentId);
        originKind = 'COTIZACION';
        originLabel = quote ? `Cotización ${quote.number}` : 'Cotización';
        originDetail = `Link · ${quote?.customer.name ?? ''}`.replace(/ · $/, '');
        // Un link de cotización no registra cobro (decisión de la fase 3
        // de PLAN_MERCADOPAGO.md): se dice tal cual.
        oplexState = 'QUOTE_PAID';
        oplexLabel = 'Pagada, sin facturar';
      }
      if (refunded && oplexState !== 'OUTSIDE') {
        oplexState = 'REFUNDED';
        oplexLabel = 'Devuelto';
      }

      return {
        id: p.id,
        mpPaymentId: p.mpPaymentId,
        date: (p.dateApproved ?? p.dateCreated).toISOString(),
        originKind,
        originLabel,
        originDetail,
        payerEmail: p.payerEmail,
        method: methodLabel(p.paymentTypeId, p.installments),
        currency: p.currency,
        gross: p.grossAmount.toFixed(2),
        fee: p.feeAmount.toFixed(2),
        net: p.netAmount?.toFixed(2) ?? null,
        refunded: p.refundedAmount.toFixed(2),
        releaseDate: p.moneyReleaseDate?.toISOString() ?? null,
        released: p.moneyReleaseStatus === 'released' || (!!p.moneyReleaseDate && p.moneyReleaseDate.getTime() <= now),
        mpStatus: p.status,
        mpStatusLabel: MP_STATUS_LABEL[p.status] ?? p.status,
        oplexState,
        oplexLabel,
        registerId,
      };
    });
  }
}

const ORIGIN_FILTER_LABEL: Record<MovementOriginFilter, string> = {
  all: 'Todos',
  caja: 'Caja (QR)',
  docs: 'Facturas y cotizaciones',
  outside: 'Fuera de Oplex',
  unassigned: 'Sin asignar',
};

interface ColumnDef {
  header: string;
  width: number;
  value: (r: MovementRow) => string | number;
  isAmount?: boolean;
}

const COLUMNS: ColumnDef[] = [
  { header: 'Fecha', width: 18, value: (r) => new Date(r.date).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }) },
  { header: 'Origen', width: 28, value: (r) => r.originLabel },
  { header: 'Detalle', width: 30, value: (r) => r.originDetail },
  { header: 'Pagó', width: 28, value: (r) => r.payerEmail ?? '' },
  { header: 'Medio', width: 20, value: (r) => r.method },
  { header: 'Moneda', width: 8, value: (r) => r.currency },
  { header: 'Cobrado', width: 14, value: (r) => Number(r.gross), isAmount: true },
  { header: 'Comisión', width: 14, value: (r) => -Number(r.fee), isAmount: true },
  { header: 'Neto', width: 14, value: (r) => (r.net != null ? Number(r.net) : ''), isAmount: true },
  { header: 'Devuelto', width: 14, value: (r) => Number(r.refunded), isAmount: true },
  {
    header: 'Se libera',
    width: 14,
    value: (r) =>
      r.releaseDate ? new Date(r.releaseDate).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }) : '',
  },
  { header: 'Estado en Mercado Pago', width: 18, value: (r) => r.mpStatusLabel },
  { header: 'En Oplex', width: 26, value: (r) => r.oplexLabel },
  { header: 'N.º de operación', width: 16, value: (r) => r.mpPaymentId },
];

/** Mismo layout que CashSessionExcelService (título en la fila 1,
 * encabezados en la 3, datos desde la 4, importes con '#,##0.00'). */
async function buildMovementsWorkbook(rows: MovementRow[], query: MovementsQuery): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Movimientos');

  sheet.mergeCells(1, 1, 1, COLUMNS.length);
  const titleCell = sheet.getCell(1, 1);
  const period = query.from || query.to ? ` · ${query.from ?? '…'} a ${query.to ?? '…'}` : '';
  titleCell.value = `Movimientos de Mercado Pago · ${ORIGIN_FILTER_LABEL[query.origin ?? 'all']}${period}`;
  titleCell.font = { bold: true, size: 13 };

  const headerRow = sheet.getRow(3);
  COLUMNS.forEach((col, i) => {
    headerRow.getCell(i + 1).value = col.header;
  });
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.border = { bottom: { style: 'thin' } };
  });
  sheet.columns = COLUMNS.map((col) => ({ width: col.width }));

  rows.forEach((r, rowIndex) => {
    const row = sheet.getRow(4 + rowIndex);
    COLUMNS.forEach((col, colIndex) => {
      const cell = row.getCell(colIndex + 1);
      cell.value = col.value(r);
      if (col.isAmount) cell.numFmt = '#,##0.00';
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
