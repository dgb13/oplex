import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  getTenantDb,
  getTenantId,
  getUserId,
  Prisma,
  type CashMovement,
  type CashMovementType,
} from '@plexo/database';
import { isValidArsDenomination } from './ars-denominations.js';
import type { CashMovementDto } from './dto/cash-movement.dto.js';
import type { CloseCashSessionDto } from './dto/close-cash-session.dto.js';
import type { ListSessionsQueryDto } from './dto/list-sessions-query.dto.js';
import type { OpenCashSessionDto } from './dto/open-cash-session.dto.js';

const USER_SUMMARY_SELECT = { select: { id: true, name: true, email: true } } as const;

const SESSION_LIST_INCLUDE = {
  register: { select: { id: true, name: true } },
  openedBy: USER_SUMMARY_SELECT,
  closedBy: USER_SUMMARY_SELECT,
} satisfies Prisma.CashSessionInclude;

const SESSION_DETAIL_INCLUDE = {
  ...SESSION_LIST_INCLUDE,
  movements: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.CashSessionInclude;

export type CashSessionListRow = Prisma.CashSessionGetPayload<{ include: typeof SESSION_LIST_INCLUDE }>;
export type CashSessionDetail = Prisma.CashSessionGetPayload<{ include: typeof SESSION_DETAIL_INCLUDE }>;

export interface CashSessionSummary {
  session: CashSessionDetail;
  expectedAmount: Prisma.Decimal;
}

export interface DailyPosition {
  openSessionsCount: number;
  openSessionsExpectedTotal: Prisma.Decimal;
  closedTodayCount: number;
  closedTodayCountedTotal: Prisma.Decimal;
  closedTodayDifferenceTotal: Prisma.Decimal;
}

function requireUserId(): string {
  const userId = getUserId();
  if (!userId) {
    throw new BadRequestException('An authenticated user is required for this operation');
  }
  return userId;
}

/**
 * Sin dueño exclusivo de sesión a propósito (decisión con el usuario, ver
 * el plan): una caja con turno OPEN puede ser operada por cualquier
 * usuario habilitado, no sólo quien la abrió - cada movimiento queda igual
 * auditado por createdByUserId.
 *
 * Concurrencia "una sesión OPEN por caja": openSession hace check-then-insert
 * (mismo patrón que BankReconciliationService.createImport contra
 * re-importar el mismo archivo), NO catch-de-violación-y-reconsulta como en
 * un primer intento de esta clase - se descartó porque cada request corre
 * en UNA sola transacción de Postgres (ver TenantContextInterceptor): un
 * INSERT que viola el índice único parcial aborta la transacción entera
 * (25P02 "current transaction is aborted"), y cualquier SELECT posterior
 * en esa misma transacción (p.ej. para armar el mensaje del 409) también
 * falla, escalando a un 500 en vez de un 409 limpio - confirmado
 * reproduciéndolo. El índice único parcial (cash_sessions_one_open_per_register,
 * ver 20260916000000_pos_cash_registers) sigue existiendo como backstop
 * real de la base de datos - sólo dejó de ser lo primero que atrapa el
 * caso común, que ahora es este chequeo.
 */
@Injectable()
export class CashSessionsService {
  async openSession(dto: OpenCashSessionDto): Promise<CashSessionDetail> {
    const db = getTenantDb();
    const tenantId = getTenantId();
    const userId = requireUserId();

    const register = await db.cashRegister.findUnique({ where: { id: dto.registerId } });
    if (!register) {
      throw new NotFoundException('Cash register not found');
    }
    if (!register.active) {
      throw new BadRequestException('This cash register is inactive');
    }

    const existing = await db.cashSession.findFirst({
      where: { registerId: dto.registerId, status: 'OPEN' },
      include: { openedBy: USER_SUMMARY_SELECT },
    });
    if (existing) {
      throw new ConflictException(
        `Esta caja ya tiene un turno abierto por ${existing.openedBy.name ?? existing.openedBy.email} desde ${existing.openedAt.toLocaleString('es-AR')}.`,
      );
    }

    let openingAmount: Prisma.Decimal;
    let openingDenominationBreakdown: Prisma.InputJsonValue | typeof Prisma.JsonNull;
    if (dto.denominationBreakdown && dto.denominationBreakdown.length > 0) {
      for (const item of dto.denominationBreakdown) {
        if (!isValidArsDenomination(item.kind, item.denomination)) {
          throw new BadRequestException(
            `Denominación inválida: ${item.kind === 'BILL' ? 'billete' : 'moneda'} de $${item.denomination}`,
          );
        }
      }
      // Recalculado en el servidor - nunca se confía en dto.openingAmount
      // cuando llega un desglose, mismo criterio que closeSession aplica
      // para countedAmount.
      openingAmount = dto.denominationBreakdown.reduce(
        (sum, item) => sum.add(new Prisma.Decimal(item.denomination).mul(item.count)),
        new Prisma.Decimal(0),
      );
      openingDenominationBreakdown = dto.denominationBreakdown as unknown as Prisma.InputJsonValue;
    } else {
      openingAmount = new Prisma.Decimal(dto.openingAmount);
      openingDenominationBreakdown = Prisma.JsonNull;
    }

    // Arqueo de apertura contra el cierre del turno anterior de esta misma
    // caja (Fase 3) - puramente informativo/auditable, nunca bloquea la
    // apertura aunque la diferencia sea grande. Null si es el primer turno
    // de la caja o si ese turno previo no tiene countedAmount.
    const lastClosed = await db.cashSession.findFirst({
      where: { registerId: dto.registerId, status: 'CLOSED' },
      orderBy: { closedAt: 'desc' },
    });
    const openingDifference =
      lastClosed?.countedAmount != null ? openingAmount.sub(lastClosed.countedAmount) : null;

    const session = await db.cashSession.create({
      data: {
        tenantId,
        registerId: dto.registerId,
        openedByUserId: userId,
        openingAmount,
        openingDenominationBreakdown,
        openingDifference,
      },
    });
    return this.getSessionDetail(session.id);
  }

  getOpenSession(registerId: string): Promise<CashSessionDetail | null> {
    return getTenantDb().cashSession.findFirst({
      where: { registerId, status: 'OPEN' },
      include: SESSION_DETAIL_INCLUDE,
    });
  }

  /** Cierre anterior de esta caja (Fase 3) - referencia que muestra
   * OpenSessionModal para que el cajero entrante cuente contra lo que dejó
   * el saliente. Null si la caja nunca tuvo un turno cerrado. */
  getLastClosedSession(registerId: string): Promise<CashSessionDetail | null> {
    return getTenantDb().cashSession.findFirst({
      where: { registerId, status: 'CLOSED' },
      include: SESSION_DETAIL_INCLUDE,
      orderBy: { closedAt: 'desc' },
    });
  }

  listOpenSessions(): Promise<CashSessionListRow[]> {
    return getTenantDb().cashSession.findMany({
      where: { status: 'OPEN' },
      include: SESSION_LIST_INCLUDE,
      orderBy: { openedAt: 'asc' },
    });
  }

  /** Filtros de /pos/history (Fase 2): `registerId` exacto, `from`/`to`
   * contra `closedAt`. Mismo criterio de "hasta" que
   * VatBookService.defaultRange (libs/modules/taxes) - un "hasta" de sólo
   * fecha calendario (el caso común de un date-picker) tiene que llegar
   * hasta el final de ese día, si no un turno cerrado más tarde ese mismo
   * día queda afuera. */
  listSessions(filter?: Pick<ListSessionsQueryDto, 'registerId' | 'from' | 'to'>): Promise<CashSessionListRow[]> {
    const where: Prisma.CashSessionWhereInput = { status: 'CLOSED' };
    if (filter?.registerId) {
      where.registerId = filter.registerId;
    }
    if (filter?.from || filter?.to) {
      const closedAt: Prisma.DateTimeFilter = {};
      if (filter.from) {
        closedAt.gte = new Date(filter.from);
      }
      if (filter.to) {
        const to = new Date(filter.to);
        to.setUTCHours(23, 59, 59, 999);
        closedAt.lte = to;
      }
      where.closedAt = closedAt;
    }
    return getTenantDb().cashSession.findMany({
      where,
      include: SESSION_LIST_INCLUDE,
      orderBy: { closedAt: 'desc' },
    });
  }

  /** Posición de efectivo del día, todas las cajas juntas ("¿cuánto tengo
   * abierto ahora, cuánto se contó/difirió hoy?") - franja de resumen de
   * /pos. "Hoy" = calendario UTC, mismo criterio que dateRange.ts
   * (apps/web/src/app/reports) usa para construir sus rangos - el resto del
   * repo no tiene un concepto de huso horario por tenant. */
  async getDailyPosition(): Promise<DailyPosition> {
    const db = getTenantDb();
    const now = new Date();
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const todayEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));

    const openSessions = await db.cashSession.findMany({
      where: { status: 'OPEN' },
      include: { movements: true },
    });
    const openSessionsExpectedTotal = openSessions.reduce(
      (sum, s) =>
        sum.add(s.movements.reduce((mSum, m) => mSum.add(m.amount), new Prisma.Decimal(s.openingAmount))),
      new Prisma.Decimal(0),
    );

    const closedToday = await db.cashSession.findMany({
      where: { status: 'CLOSED', closedAt: { gte: todayStart, lte: todayEnd } },
    });
    const closedTodayCountedTotal = closedToday.reduce(
      (sum, s) => sum.add(s.countedAmount ?? 0),
      new Prisma.Decimal(0),
    );
    const closedTodayDifferenceTotal = closedToday.reduce(
      (sum, s) => sum.add(s.difference ?? 0),
      new Prisma.Decimal(0),
    );

    return {
      openSessionsCount: openSessions.length,
      openSessionsExpectedTotal,
      closedTodayCount: closedToday.length,
      closedTodayCountedTotal,
      closedTodayDifferenceTotal,
    };
  }

  private async getSessionDetail(id: string): Promise<CashSessionDetail> {
    const session = await getTenantDb().cashSession.findUnique({
      where: { id },
      include: SESSION_DETAIL_INCLUDE,
    });
    if (!session) {
      throw new NotFoundException('Cash session not found');
    }
    return session;
  }

  private async requireOpenSession(id: string): Promise<CashSessionDetail> {
    const session = await this.getSessionDetail(id);
    if (session.status !== 'OPEN') {
      throw new BadRequestException('This cash session is already closed');
    }
    return session;
  }

  async recordCashMovement(
    sessionId: string,
    dto: CashMovementDto,
    type: Extract<CashMovementType, 'CASH_IN' | 'CASH_OUT'>,
  ): Promise<CashMovement> {
    await this.requireOpenSession(sessionId);
    const magnitude = new Prisma.Decimal(dto.amount).abs();
    const amount = type === 'CASH_OUT' ? magnitude.neg() : magnitude;
    return getTenantDb().cashMovement.create({
      data: {
        tenantId: getTenantId(),
        sessionId,
        type,
        amount,
        reason: dto.reason,
        createdByUserId: requireUserId(),
      },
    });
  }

  /** Llamado sólo por PosService.checkout (apps/api) - nunca expuesto como
   * ruta propia, la venta completa (factura+stock+asiento+cobro) se crea
   * de punta a punta ahí, este método sólo deja el rastro en el ledger de
   * la sesión para el arqueo. */
  async recordSaleMovement(
    sessionId: string,
    invoiceId: string,
    cashAmount: Prisma.Decimal | number,
  ): Promise<CashMovement> {
    await this.requireOpenSession(sessionId);
    return getTenantDb().cashMovement.create({
      data: {
        tenantId: getTenantId(),
        sessionId,
        type: 'SALE',
        amount: cashAmount,
        invoiceId,
        createdByUserId: requireUserId(),
      },
    });
  }

  async getSessionSummary(id: string): Promise<CashSessionSummary> {
    const session = await this.getSessionDetail(id);
    const expectedAmount = session.movements.reduce(
      (sum, m) => sum.add(m.amount),
      new Prisma.Decimal(session.openingAmount),
    );
    return { session, expectedAmount };
  }

  /** No postea el asiento contable de la diferencia - eso lo compone
   * PosService.closeSession (apps/api), que llama a esto primero y recién
   * después decide si postear
   * AccountingService.postCashSessionAdjustmentJournalEntry según el
   * signo/monto de `difference`. */
  async closeSession(id: string, dto: CloseCashSessionDto): Promise<CashSessionSummary> {
    const summary = await this.getSessionSummary(id);
    if (summary.session.status !== 'OPEN') {
      throw new BadRequestException('This cash session is already closed');
    }

    let countedAmount: Prisma.Decimal;
    let denominationBreakdown: Prisma.InputJsonValue | typeof Prisma.JsonNull;
    if (dto.denominationBreakdown && dto.denominationBreakdown.length > 0) {
      for (const item of dto.denominationBreakdown) {
        if (!isValidArsDenomination(item.kind, item.denomination)) {
          throw new BadRequestException(
            `Denominación inválida: ${item.kind === 'BILL' ? 'billete' : 'moneda'} de $${item.denomination}`,
          );
        }
      }
      // Recalculado en el servidor - nunca se confía en dto.countedAmount
      // cuando llega un desglose (el front lo manda igual por prolijidad de
      // payload, pero podría no coincidir con su propia suma).
      countedAmount = dto.denominationBreakdown.reduce(
        (sum, item) => sum.add(new Prisma.Decimal(item.denomination).mul(item.count)),
        new Prisma.Decimal(0),
      );
      denominationBreakdown = dto.denominationBreakdown as unknown as Prisma.InputJsonValue;
    } else {
      countedAmount = new Prisma.Decimal(dto.countedAmount);
      denominationBreakdown = Prisma.JsonNull;
    }
    const difference = countedAmount.sub(summary.expectedAmount);

    await getTenantDb().cashSession.update({
      where: { id },
      data: {
        status: 'CLOSED',
        closedByUserId: requireUserId(),
        countedAmount,
        expectedAmount: summary.expectedAmount,
        difference,
        closedAt: new Date(),
        notes: dto.notes,
        denominationBreakdown,
      },
    });

    return { session: await this.getSessionDetail(id), expectedAmount: summary.expectedAmount };
  }
}
