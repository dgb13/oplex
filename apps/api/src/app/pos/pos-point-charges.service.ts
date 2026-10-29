import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AccountingService } from '@plexo/accounting';
import { ConnectorService } from '@plexo/connectors';
import {
  getOrCreateSystemFinancialAccount,
  getTenantDb,
  getTenantId,
  getUserId,
  notify,
  Prisma,
  userIdsWithRoles,
  type PosPointCharge,
} from '@plexo/database';
import { isPointPayment, MercadoPagoPaymentsSyncService } from '@plexo/mercadopago';
import { CashRegistersService, CashSessionsService } from '@plexo/pos';
import { ReportsFinancialService } from '@plexo/reports-financial';

// Regla fija de emparejamiento (la misma que muestra la pantalla de control):
// mismo monto al centavo, pago entre 2 minutos antes y 20 minutos después de
// confirmar la venta, y uno y sólo uno. Si dos pagos encajan, no se adivina.
export const POINT_WINDOW_BEFORE_MS = 2 * 60_000;
export const POINT_WINDOW_AFTER_MS = 20 * 60_000;
// Desde ahí una venta sin pago pasa a "Sin pago en Mercado Pago" y avisa.
export const POINT_MISSING_AFTER_MS = 30 * 60_000;
// Ventas abiertas que se siguen buscando solas.
const OPEN_LOOKBACK_MS = 3 * 24 * 60 * 60_000;

export type PointChargeDisplayStatus = 'WAITING' | 'MISSING' | 'AMBIGUOUS' | 'CONFIRMED' | 'RESOLVED';

interface PointPaymentRow {
  mpPaymentId: string;
  amount: string;
  dateCreated: Date;
  paymentMethodId: string | null;
  paymentTypeId: string | null;
  installments: number | null;
}

/**
 * Cobro con Point de Mercado Pago en la Caja (mockup aprobado 2026-10-28).
 * El cajero cobra en el posnet suelto y elige la forma de pago "Point"; acá
 * se empareja cada una de esas ventas con el pago que llega a la cuenta de
 * Mercado Pago, y se resuelven a mano los casos que no cierran.
 */
@Injectable()
export class PosPointChargesService {
  private readonly logger = new Logger(PosPointChargesService.name);

  constructor(
    private readonly paymentsSync: MercadoPagoPaymentsSyncService,
    private readonly connectorService: ConnectorService,
    private readonly accountingService: AccountingService,
    private readonly reportsFinancialService: ReportsFinancialService,
    private readonly cashRegistersService: CashRegistersService,
    private readonly cashSessionsService: CashSessionsService,
  ) {}

  /** Lo llama PosService.checkout por cada fila "Point". Con mpPaymentId
   * (venta cargada desde un "Pago sin venta") queda confirmada de una. */
  async recordSale(input: {
    invoiceId: string;
    receiptId: string;
    registerId: string;
    sessionId: string;
    amount: Prisma.Decimal | number;
    mpPaymentId?: string;
  }): Promise<PosPointCharge> {
    const db = getTenantDb();
    const amount = new Prisma.Decimal(input.amount);
    if (input.mpPaymentId) {
      await this.assertUsablePayment(input.mpPaymentId, amount);
    }
    return db.posPointCharge.create({
      data: {
        tenantId: getTenantId(),
        invoiceId: input.invoiceId,
        receiptId: input.receiptId,
        registerId: input.registerId,
        sessionId: input.sessionId,
        amount,
        createdByUserId: getUserId() ?? null,
        ...(input.mpPaymentId
          ? {
              status: 'CONFIRMED' as const,
              mpPaymentId: input.mpPaymentId,
              resolution: 'Venta cargada para un pago sin venta',
              resolvedAt: new Date(),
              resolvedByUserId: getUserId() ?? null,
            }
          : {}),
      },
    });
  }

  /** Trae de Mercado Pago los pagos del rango de las ventas abiertas y
   * empareja. Si la cuenta no está conectada o MP no responde, empareja con
   * lo que ya hay y devuelve el motivo. */
  async refresh(): Promise<{ syncError: string | null }> {
    const open = await this.openCharges();
    let syncError: string | null = null;
    if (open.length > 0) {
      const connector = await this.connectorService.getConnector('MERCADO_PAGO');
      if (!connector || connector.status !== 'CONNECTED') {
        syncError = 'La cuenta de Mercado Pago no está conectada: conectala en la sección Mercado Pago para que Oplex controle los cobros con Point.';
      } else {
        const begin = new Date(Math.min(...open.map((c) => c.soldAt.getTime())) - POINT_WINDOW_BEFORE_MS);
        try {
          await this.paymentsSync.syncRange(begin, new Date());
        } catch (err) {
          syncError = `No se pudo consultar a Mercado Pago: ${(err as Error).message}`;
          this.logger.warn(syncError);
        }
      }
    }
    await this.match();
    return { syncError };
  }

  /** Empareja las ventas abiertas con los pagos de Point ya guardados. */
  async match(now: Date = new Date()): Promise<void> {
    const db = getTenantDb();
    const open = await this.openCharges(now);
    if (open.length === 0) return;

    const payments = await this.freePointPayments(
      new Date(Math.min(...open.map((c) => c.soldAt.getTime())) - POINT_WINDOW_BEFORE_MS),
      new Date(Math.max(...open.map((c) => c.soldAt.getTime())) + POINT_WINDOW_AFTER_MS),
    );
    const candidatesOf = new Map(open.map((c) => [c.id, candidatesFor(c, payments)]));
    // Cuántas ventas quieren cada pago: si dos ventas iguales compiten por el
    // mismo pago, ninguna lo toma sola.
    const demand = new Map<string, number>();
    for (const list of candidatesOf.values()) {
      for (const p of list) demand.set(p.mpPaymentId, (demand.get(p.mpPaymentId) ?? 0) + 1);
    }

    for (const charge of open) {
      const candidates = candidatesOf.get(charge.id) ?? [];
      if (candidates.length === 1 && demand.get(candidates[0].mpPaymentId) === 1) {
        await db.posPointCharge.update({
          where: { id: charge.id },
          data: { status: 'CONFIRMED', mpPaymentId: candidates[0].mpPaymentId, candidateCount: 1 },
        });
        continue;
      }
      const status = candidates.length === 0 ? 'PENDING' : 'AMBIGUOUS';
      if (status !== charge.status || candidates.length !== charge.candidateCount) {
        await db.posPointCharge.update({ where: { id: charge.id }, data: { status, candidateCount: candidates.length } });
      }
      if (status === 'PENDING' && !charge.notifiedAt && now.getTime() - charge.soldAt.getTime() >= POINT_MISSING_AFTER_MS) {
        await this.notifyMissing(charge);
      }
    }
  }

  /** Control de cobros con Point: ventas y pagos de Point del rango. */
  async list(range: { from: Date; to: Date }, now: Date = new Date()) {
    const db = getTenantDb();
    const charges = await db.posPointCharge.findMany({
      where: { soldAt: { gte: range.from, lte: range.to } },
      orderBy: { soldAt: 'desc' },
    });
    // Las abiertas de días anteriores también: siguen sin resolver.
    const olderOpen = await db.posPointCharge.findMany({
      where: { soldAt: { lt: range.from }, status: { in: ['PENDING', 'AMBIGUOUS'] } },
      orderBy: { soldAt: 'desc' },
    });
    const all = [...charges, ...olderOpen];

    const [invoices, registers, matched] = await Promise.all([
      db.invoice.findMany({
        where: { id: { in: all.map((c) => c.invoiceId) } },
        select: { id: true, documentLetter: true, pointOfSale: true, number: true },
      }),
      db.cashRegister.findMany({ where: { id: { in: [...new Set(all.map((c) => c.registerId))] } }, select: { id: true, name: true } }),
      db.mercadoPagoPayment.findMany({
        where: { mpPaymentId: { in: all.map((c) => c.mpPaymentId).filter((x): x is string => !!x) } },
      }),
    ]);
    const invoiceById = new Map(invoices.map((i) => [i.id, i]));
    const registerName = new Map(registers.map((r) => [r.id, r.name]));
    const matchedById = new Map(matched.map((p) => [p.mpPaymentId, toPaymentRow(p)]));

    const open = all.filter((c) => c.status === 'PENDING' || c.status === 'AMBIGUOUS');
    const free = open.length
      ? await this.freePointPayments(
          new Date(Math.min(...open.map((c) => c.soldAt.getTime())) - POINT_WINDOW_BEFORE_MS),
          new Date(Math.max(...open.map((c) => c.soldAt.getTime())) + POINT_WINDOW_AFTER_MS),
        )
      : [];

    const rows = all.map((c) => {
      const invoice = invoiceById.get(c.invoiceId);
      const payment = c.mpPaymentId ? (matchedById.get(c.mpPaymentId) ?? null) : null;
      return {
        id: c.id,
        soldAt: c.soldAt,
        amount: c.amount.toString(),
        status: displayStatus(c, now),
        resolution: c.resolution,
        invoiceId: c.invoiceId,
        invoiceLabel: invoice ? `${invoice.documentLetter} ${invoice.pointOfSale}-${invoice.number}` : null,
        registerName: registerName.get(c.registerId) ?? null,
        payment: payment ? serializePayment(payment) : null,
        candidates: c.status === 'AMBIGUOUS' ? candidatesFor(c, free).map(serializePayment) : [],
      };
    });

    // Pagos de Point del rango que no son de ninguna venta.
    const pointPayments = (
      await db.mercadoPagoPayment.findMany({
        where: { dateCreated: { gte: range.from, lte: range.to }, status: 'approved' },
        orderBy: { dateCreated: 'desc' },
      })
    ).filter((p) => isPointPayment(p.raw));
    const usedIds = new Set(
      (
        await db.posPointCharge.findMany({
          where: { mpPaymentId: { in: pointPayments.map((p) => p.mpPaymentId) } },
          select: { mpPaymentId: true },
        })
      ).map((c) => c.mpPaymentId),
    );
    // Los candidatos de una venta "Para elegir" se resuelven desde esa venta:
    // no son "Pago sin venta" (todavía).
    const candidateIds = new Set(rows.flatMap((r) => r.candidates.map((p) => p.mpPaymentId)));
    const unmatched = pointPayments
      .filter((p) => !usedIds.has(p.mpPaymentId) && !candidateIds.has(p.mpPaymentId))
      .map((p) => ({
        ...serializePayment(toPaymentRow(p)),
        reviewed: p.pointReviewedAt !== null,
      }));

    const confirmed = rows.filter((r) => r.status === 'CONFIRMED');
    return {
      rows,
      unmatched,
      totals: {
        confirmedCount: confirmed.length,
        confirmedAmount: confirmed.reduce((s, r) => s.add(r.amount), new Prisma.Decimal(0)).toString(),
        missing: rows.filter((r) => r.status === 'MISSING').length,
        ambiguous: rows.filter((r) => r.status === 'AMBIGUOUS').length,
        waiting: rows.filter((r) => r.status === 'WAITING').length,
        unmatched: unmatched.filter((u) => !u.reviewed).length,
      },
      rule: {
        windowBeforeMinutes: POINT_WINDOW_BEFORE_MS / 60_000,
        windowAfterMinutes: POINT_WINDOW_AFTER_MS / 60_000,
        missingAfterMinutes: POINT_MISSING_AFTER_MS / 60_000,
      },
    };
  }

  /** Para la pantalla de venta hecha de la Caja. */
  async listForInvoice(invoiceId: string, now: Date = new Date()) {
    const charges = await getTenantDb().posPointCharge.findMany({ where: { invoiceId }, orderBy: { createdAt: 'asc' } });
    const payments = await getTenantDb().mercadoPagoPayment.findMany({
      where: { mpPaymentId: { in: charges.map((c) => c.mpPaymentId).filter((x): x is string => !!x) } },
    });
    const byId = new Map(payments.map((p) => [p.mpPaymentId, toPaymentRow(p)]));
    return charges.map((c) => {
      const payment = c.mpPaymentId ? byId.get(c.mpPaymentId) : undefined;
      return { id: c.id, amount: c.amount.toString(), status: displayStatus(c, now), payment: payment ? serializePayment(payment) : null };
    });
  }

  /** Cierre de turno: cuánto se cobró con Point y cuánto ya confirmó MP. */
  async sessionSummary(sessionId: string) {
    const charges = await getTenantDb().posPointCharge.findMany({
      where: { sessionId, status: { not: 'CHANGED' } },
      select: { status: true, amount: true },
    });
    const sum = (list: typeof charges) => list.reduce((s, c) => s.add(c.amount), new Prisma.Decimal(0)).toString();
    const confirmed = charges.filter((c) => c.status === 'CONFIRMED');
    const pending = charges.filter((c) => c.status !== 'CONFIRMED');
    return {
      count: charges.length,
      total: sum(charges),
      confirmedCount: confirmed.length,
      confirmedTotal: sum(confirmed),
      pendingCount: pending.length,
      pendingTotal: sum(pending),
    };
  }

  /** "Es este" (Para elegir) o "Es de una venta ya hecha" (Pago sin venta). */
  async confirmWith(chargeId: string, mpPaymentId: string) {
    const charge = await this.openCharge(chargeId);
    await this.assertUsablePayment(mpPaymentId, charge.amount);
    return getTenantDb().posPointCharge.update({
      where: { id: charge.id },
      data: {
        status: 'CONFIRMED',
        mpPaymentId,
        resolution: 'Pago elegido a mano',
        resolvedAt: new Date(),
        resolvedByUserId: getUserId() ?? null,
      },
    });
  }

  /**
   * "Fue en efectivo" / "Fue con tarjeta de otro posnet": la plata no entró
   * a Mercado Pago. El cobro se registró en la cuenta de Mercado Pago, así
   * que se pasa a la caja (efectivo, y suma al arqueo del turno) o a
   * Cobranzas a depositar (tarjeta), con su asiento de transferencia. La
   * factura no cambia.
   */
  async changeMethod(chargeId: string, method: 'CASH' | 'CARD') {
    const db = getTenantDb();
    const charge = await this.openCharge(chargeId);
    const receipt = await db.receipt.findUnique({ where: { id: charge.receiptId } });
    if (!receipt?.financialAccountId) {
      throw new NotFoundException('No se encontró el cobro de esa venta');
    }
    const register = await this.cashRegistersService.getById(charge.registerId);
    if (method === 'CASH') {
      const session = await db.cashSession.findUnique({ where: { id: charge.sessionId }, select: { status: true } });
      if (session?.status !== 'OPEN') {
        throw new BadRequestException(
          'El turno de esa venta ya se cerró: si la plata entró al cajón, ya quedó como sobrante en ese arqueo. Elegí "Fue con tarjeta de otro posnet" o dejala esperando.',
        );
      }
    }
    const toAccountId =
      method === 'CASH'
        ? register.financialAccountId
        : (await getOrCreateSystemFinancialAccount(db, getTenantId(), 'PENDING_DEPOSIT')).id;

    await this.accountingService.ensureMoneyAccounts();
    const label = method === 'CASH' ? 'Fue en efectivo' : 'Fue con tarjeta de otro posnet';
    const reason = `Cobro con Point corregido (${label.toLowerCase()})`;
    await this.reportsFinancialService.recordFinancialTransaction({
      financialAccountId: receipt.financialAccountId,
      amount: receipt.amount.neg().toNumber(),
      externalRef: reason,
    });
    await this.reportsFinancialService.recordFinancialTransaction({
      financialAccountId: toAccountId,
      amount: receipt.amount.toNumber(),
      externalRef: reason,
    });
    await this.accountingService.postTransferJournalEntry({
      fromFinancialAccountId: receipt.financialAccountId,
      toFinancialAccountId: toAccountId,
      amount: receipt.amount,
      description: reason,
    });
    await db.receipt.update({ where: { id: receipt.id }, data: { method } });
    if (method === 'CASH') {
      await this.cashSessionsService.recordSaleMovement(charge.sessionId, charge.invoiceId, receipt.amount);
    }
    return db.posPointCharge.update({
      where: { id: charge.id },
      data: { status: 'CHANGED', resolution: label, resolvedAt: new Date(), resolvedByUserId: getUserId() ?? null },
    });
  }

  /** "No es una venta (marcar como revisado)". */
  async dismissPayment(mpPaymentId: string) {
    const db = getTenantDb();
    const payment = await db.mercadoPagoPayment.findUnique({
      where: { tenantId_mpPaymentId: { tenantId: getTenantId(), mpPaymentId } },
    });
    if (!payment || !isPointPayment(payment.raw)) {
      throw new NotFoundException('No se encontró ese pago de Point');
    }
    return db.mercadoPagoPayment.update({
      where: { id: payment.id },
      data: { pointReviewedAt: new Date(), pointReviewedByUserId: getUserId() ?? null },
    });
  }

  /** Ventas sin pago del mismo monto, para "Es de una venta ya hecha". */
  async chargesForPayment(mpPaymentId: string) {
    const db = getTenantDb();
    const payment = await db.mercadoPagoPayment.findUnique({
      where: { tenantId_mpPaymentId: { tenantId: getTenantId(), mpPaymentId } },
    });
    if (!payment) throw new NotFoundException('No se encontró ese pago');
    const charges = await db.posPointCharge.findMany({
      where: { status: { in: ['PENDING', 'AMBIGUOUS'] }, amount: payment.grossAmount },
      orderBy: { soldAt: 'desc' },
      take: 20,
    });
    const invoices = await db.invoice.findMany({
      where: { id: { in: charges.map((c) => c.invoiceId) } },
      select: { id: true, documentLetter: true, pointOfSale: true, number: true },
    });
    const byId = new Map(invoices.map((i) => [i.id, `${i.documentLetter} ${i.pointOfSale}-${i.number}`]));
    return charges.map((c) => ({ id: c.id, soldAt: c.soldAt, amount: c.amount.toString(), invoiceLabel: byId.get(c.invoiceId) ?? null }));
  }

  /** Un pago para la Caja ("Cargar la venta ahora"). */
  async getUnmatchedPayment(mpPaymentId: string) {
    const db = getTenantDb();
    const payment = await db.mercadoPagoPayment.findUnique({
      where: { tenantId_mpPaymentId: { tenantId: getTenantId(), mpPaymentId } },
    });
    if (!payment || !isPointPayment(payment.raw)) throw new NotFoundException('No se encontró ese pago de Point');
    const used = await db.posPointCharge.findFirst({ where: { mpPaymentId }, select: { id: true } });
    if (used) throw new BadRequestException('Ese pago ya está emparejado con una venta');
    return serializePayment(toPaymentRow(payment));
  }

  private async openCharges(now: Date = new Date()) {
    return getTenantDb().posPointCharge.findMany({
      where: { status: { in: ['PENDING', 'AMBIGUOUS'] }, soldAt: { gte: new Date(now.getTime() - OPEN_LOOKBACK_MS) } },
      orderBy: { soldAt: 'asc' },
    });
  }

  private async openCharge(chargeId: string) {
    const charge = await getTenantDb().posPointCharge.findUnique({ where: { id: chargeId } });
    if (!charge) throw new NotFoundException('No se encontró esa venta con Point');
    if (charge.status !== 'PENDING' && charge.status !== 'AMBIGUOUS') {
      throw new BadRequestException('Esa venta ya está resuelta');
    }
    return charge;
  }

  /** Pagos de Point aprobados del rango que no son de ninguna venta ni se
   * marcaron "No es una venta". */
  private async freePointPayments(from: Date, to: Date): Promise<PointPaymentRow[]> {
    const db = getTenantDb();
    const payments = (
      await db.mercadoPagoPayment.findMany({
        where: { dateCreated: { gte: from, lte: to }, status: 'approved', pointReviewedAt: null },
      })
    ).filter((p) => isPointPayment(p.raw));
    const used = new Set(
      (
        await db.posPointCharge.findMany({
          where: { mpPaymentId: { in: payments.map((p) => p.mpPaymentId) } },
          select: { mpPaymentId: true },
        })
      ).map((c) => c.mpPaymentId),
    );
    return payments.filter((p) => !used.has(p.mpPaymentId)).map(toPaymentRow);
  }

  private async assertUsablePayment(mpPaymentId: string, amount: Prisma.Decimal) {
    const db = getTenantDb();
    const payment = await db.mercadoPagoPayment.findUnique({
      where: { tenantId_mpPaymentId: { tenantId: getTenantId(), mpPaymentId } },
    });
    if (!payment || !isPointPayment(payment.raw) || payment.status !== 'approved') {
      throw new BadRequestException('Ese pago no es un cobro de Point aprobado');
    }
    if (!payment.grossAmount.eq(amount)) {
      throw new BadRequestException(
        `El pago es de $${payment.grossAmount.toFixed(2)} y la venta de $${amount.toFixed(2)}: tienen que ser iguales`,
      );
    }
    const used = await db.posPointCharge.findFirst({ where: { mpPaymentId }, select: { id: true } });
    if (used) throw new BadRequestException('Ese pago ya está emparejado con otra venta');
  }

  private async notifyMissing(charge: PosPointCharge) {
    const db = getTenantDb();
    const [admins, invoice, register] = await Promise.all([
      userIdsWithRoles(['OWNER', 'ADMIN']),
      db.invoice.findUnique({ where: { id: charge.invoiceId }, select: { documentLetter: true, pointOfSale: true, number: true } }),
      db.cashRegister.findUnique({ where: { id: charge.registerId }, select: { name: true } }),
    ]);
    await notify({
      recipientUserIds: [...admins, charge.createdByUserId],
      category: 'SALES',
      type: 'pos.point_missing',
      message: `Venta con Point sin pago en Mercado Pago: **${invoice ? `Factura ${invoice.documentLetter} ${invoice.pointOfSale}-${invoice.number}` : 'una venta'}** por $${charge.amount.toFixed(2)}${register ? ` en ${register.name}` : ''}. Revisala en Control de cobros con Point.`,
      link: '/mercadopago?tab=point',
    });
    await db.posPointCharge.update({ where: { id: charge.id }, data: { notifiedAt: new Date() } });
  }
}

function candidatesFor(charge: Pick<PosPointCharge, 'amount' | 'soldAt'>, payments: PointPaymentRow[]): PointPaymentRow[] {
  const from = charge.soldAt.getTime() - POINT_WINDOW_BEFORE_MS;
  const to = charge.soldAt.getTime() + POINT_WINDOW_AFTER_MS;
  return payments
    .filter((p) => new Prisma.Decimal(p.amount).eq(charge.amount) && p.dateCreated.getTime() >= from && p.dateCreated.getTime() <= to)
    .sort((a, b) => Math.abs(a.dateCreated.getTime() - charge.soldAt.getTime()) - Math.abs(b.dateCreated.getTime() - charge.soldAt.getTime()));
}

function displayStatus(charge: Pick<PosPointCharge, 'status' | 'soldAt'>, now: Date): PointChargeDisplayStatus {
  if (charge.status === 'CONFIRMED') return 'CONFIRMED';
  if (charge.status === 'CHANGED') return 'RESOLVED';
  if (charge.status === 'AMBIGUOUS') return 'AMBIGUOUS';
  return now.getTime() - charge.soldAt.getTime() >= POINT_MISSING_AFTER_MS ? 'MISSING' : 'WAITING';
}

function toPaymentRow(p: {
  mpPaymentId: string;
  grossAmount: Prisma.Decimal;
  dateCreated: Date;
  paymentMethodId: string | null;
  paymentTypeId: string | null;
  installments: number | null;
}): PointPaymentRow {
  return {
    mpPaymentId: p.mpPaymentId,
    amount: p.grossAmount.toString(),
    dateCreated: p.dateCreated,
    paymentMethodId: p.paymentMethodId,
    paymentTypeId: p.paymentTypeId,
    installments: p.installments,
  };
}

function serializePayment(p: PointPaymentRow) {
  return { ...p, dateCreated: p.dateCreated.toISOString() };
}
