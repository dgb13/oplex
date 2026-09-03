import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  getTenantDb,
  getTenantId,
  getUserId,
  Prisma,
  type CashMovement,
  type CashMovementType,
} from '@plexo/database';
import type { CashMovementDto } from './dto/cash-movement.dto.js';
import type { CloseCashSessionDto } from './dto/close-cash-session.dto.js';
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

    const session = await db.cashSession.create({
      data: {
        tenantId,
        registerId: dto.registerId,
        openedByUserId: userId,
        openingAmount: dto.openingAmount,
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

  listOpenSessions(): Promise<CashSessionListRow[]> {
    return getTenantDb().cashSession.findMany({
      where: { status: 'OPEN' },
      include: SESSION_LIST_INCLUDE,
      orderBy: { openedAt: 'asc' },
    });
  }

  listSessions(): Promise<CashSessionListRow[]> {
    return getTenantDb().cashSession.findMany({
      where: { status: 'CLOSED' },
      include: SESSION_LIST_INCLUDE,
      orderBy: { closedAt: 'desc' },
    });
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
    const countedAmount = new Prisma.Decimal(dto.countedAmount);
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
      },
    });

    return { session: await this.getSessionDetail(id), expectedAmount: summary.expectedAmount };
  }
}
