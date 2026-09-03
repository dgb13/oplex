import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma, tenantContextStorage } from '@plexo/database';
import { CashSessionsService } from './cash-sessions.service.js';

function runInTenant<T>(db: Record<string, unknown>, fn: () => T): T {
  return tenantContextStorage.run({ tenantId: 'tenant-1', userId: 'user-1', tx: db as never }, fn);
}

function activeRegister() {
  return { id: 'register-1', active: true };
}

describe('CashSessionsService.openSession', () => {
  it('rejects with a 409 when the register already has an OPEN session, without attempting the insert', async () => {
    const openedAt = new Date('2026-09-01T12:00:00Z');
    const create = jest.fn();
    const db = {
      cashRegister: { findUnique: jest.fn().mockResolvedValue(activeRegister()) },
      cashSession: {
        findFirst: jest.fn().mockResolvedValue({
          openedAt,
          openedBy: { name: 'Ana', email: 'ana@demo.plexo' },
        }),
        create,
      },
    };
    const service = new CashSessionsService();

    await expect(
      runInTenant(db, () => service.openSession({ registerId: 'register-1', openingAmount: 1000 })),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(db.cashSession.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { registerId: 'register-1', status: 'OPEN' } }),
    );
    // Check-then-insert on purpose, never catch-the-violation-and-requery:
    // this whole request runs in one Postgres transaction, so a rejected
    // INSERT here would abort it and turn the clean 409 into a 500 on the
    // very next query - reproduced for real testing this against the live
    // API, see the doc comment on the class.
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects for an inactive register without touching cashSession.create', async () => {
    const db = {
      cashRegister: { findUnique: jest.fn().mockResolvedValue({ id: 'register-1', active: false }) },
      cashSession: { create: jest.fn() },
    };
    const service = new CashSessionsService();

    await expect(
      runInTenant(db, () => service.openSession({ registerId: 'register-1', openingAmount: 1000 })),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.cashSession.create).not.toHaveBeenCalled();
  });

  it('recalculates openingAmount from denominationBreakdown, ignoring an inconsistent dto.openingAmount', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'session-1' });
    const db = {
      cashRegister: { findUnique: jest.fn().mockResolvedValue(activeRegister()) },
      cashSession: {
        findFirst: jest
          .fn()
          // 1) check de sesión OPEN existente -> ninguna
          .mockResolvedValueOnce(null)
          // 2) último turno CERRADO de la caja -> ninguno (primer turno)
          .mockResolvedValueOnce(null),
        findUnique: jest.fn().mockResolvedValue({
          id: 'session-1',
          openedAt: new Date(),
          openedBy: { id: 'user-1', name: 'Ana', email: 'ana@demo.plexo' },
          closedBy: null,
          register: { id: 'register-1', name: 'Caja 1' },
          movements: [],
        }),
        create,
      },
    };
    const service = new CashSessionsService();

    // Desglose real: 3 billetes de 1000 + 2 monedas de 100 = 3200.
    // dto.openingAmount llega deliberadamente distinto (999999) - el
    // servidor tiene que ignorarlo y usar la suma real del desglose.
    await runInTenant(db, () =>
      service.openSession({
        registerId: 'register-1',
        openingAmount: 999999,
        denominationBreakdown: [
          { kind: 'BILL', denomination: 1000, count: 3 },
          { kind: 'COIN', denomination: 100, count: 2 },
        ],
      }),
    );

    const createData = create.mock.calls[0][0].data;
    expect((createData.openingAmount as Prisma.Decimal).toNumber()).toBe(3200);
    expect(createData.openingDenominationBreakdown).toEqual([
      { kind: 'BILL', denomination: 1000, count: 3 },
      { kind: 'COIN', denomination: 100, count: 2 },
    ]);
    // Primer turno de la caja -> sin turno cerrado previo -> null.
    expect(createData.openingDifference).toBeNull();
  });

  it('rejects a denominationBreakdown item whose kind/denomination pair is not a real ARS denomination', async () => {
    const db = {
      cashRegister: { findUnique: jest.fn().mockResolvedValue(activeRegister()) },
      cashSession: {
        findFirst: jest.fn().mockResolvedValueOnce(null),
        create: jest.fn(),
      },
    };
    const service = new CashSessionsService();

    // $2000 no existe como moneda (sólo como billete).
    await expect(
      runInTenant(db, () =>
        service.openSession({
          registerId: 'register-1',
          openingAmount: 2000,
          denominationBreakdown: [{ kind: 'COIN', denomination: 2000, count: 1 }],
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.cashSession.create).not.toHaveBeenCalled();
  });

  it('computes openingDifference against the countedAmount of the last CLOSED session on the same register', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'session-2' });
    const db = {
      cashRegister: { findUnique: jest.fn().mockResolvedValue(activeRegister()) },
      cashSession: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(null) // sin sesión OPEN
          .mockResolvedValueOnce({ id: 'session-1', countedAmount: new Prisma.Decimal(1200) }), // último cierre
        findUnique: jest.fn().mockResolvedValue({
          id: 'session-2',
          openedAt: new Date(),
          openedBy: { id: 'user-1', name: 'Ana', email: 'ana@demo.plexo' },
          closedBy: null,
          register: { id: 'register-1', name: 'Caja 1' },
          movements: [],
        }),
        create,
      },
    };
    const service = new CashSessionsService();

    // Cajero entrante declara 1150 (modo simple) contra un cierre anterior
    // de 1200 -> diferencia -50 (faltante), puramente informativa.
    await runInTenant(db, () =>
      service.openSession({ registerId: 'register-1', openingAmount: 1150 }),
    );

    const createData = create.mock.calls[0][0].data;
    expect((createData.openingAmount as Prisma.Decimal).toNumber()).toBe(1150);
    expect((createData.openingDifference as Prisma.Decimal).toNumber()).toBe(-50);
    expect(createData.openingDenominationBreakdown).toBe(Prisma.JsonNull);
  });

  it('leaves openingDifference null when it is the register first session (no previous CLOSED session)', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'session-1' });
    const db = {
      cashRegister: { findUnique: jest.fn().mockResolvedValue(activeRegister()) },
      cashSession: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(null) // sin sesión OPEN
          .mockResolvedValueOnce(null), // ningún turno CERRADO previo
        findUnique: jest.fn().mockResolvedValue({
          id: 'session-1',
          openedAt: new Date(),
          openedBy: { id: 'user-1', name: 'Ana', email: 'ana@demo.plexo' },
          closedBy: null,
          register: { id: 'register-1', name: 'Caja 1' },
          movements: [],
        }),
        create,
      },
    };
    const service = new CashSessionsService();

    await runInTenant(db, () => service.openSession({ registerId: 'register-1', openingAmount: 500 }));

    const createData = create.mock.calls[0][0].data;
    expect(createData.openingDifference).toBeNull();
  });
});

describe('CashSessionsService cash movements', () => {
  function makeClosedSessionDb() {
    return {
      cashSession: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'session-1',
          status: 'CLOSED',
          openingAmount: new Prisma.Decimal(1000),
          movements: [],
        }),
      },
    };
  }

  it('rejects a cash-in/out on an already-closed session', async () => {
    const db = makeClosedSessionDb();
    const service = new CashSessionsService();

    await expect(
      runInTenant(db, () => service.recordCashMovement('session-1', { amount: 500, reason: 'x' }, 'CASH_IN')),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('CASH_OUT always stores a negative amount regardless of the DTO sign', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'movement-1' });
    const db = {
      cashSession: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'session-1',
          status: 'OPEN',
          openingAmount: new Prisma.Decimal(1000),
          movements: [],
        }),
      },
      cashMovement: { create },
    };
    const service = new CashSessionsService();

    await runInTenant(db, () => service.recordCashMovement('session-1', { amount: 300, reason: 'Retiro' }, 'CASH_OUT'));

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'CASH_OUT' }) }),
    );
    const amount = create.mock.calls[0][0].data.amount as Prisma.Decimal;
    expect(amount.toNumber()).toBe(-300);
  });
});

describe('CashSessionsService.closeSession', () => {
  it('computes expectedAmount from opening + movements and a negative difference for a shortage', async () => {
    const update = jest.fn().mockResolvedValue({});
    let findUniqueCalls = 0;
    const db = {
      cashSession: {
        findUnique: jest.fn().mockImplementation(() => {
          findUniqueCalls += 1;
          return Promise.resolve({
            id: 'session-1',
            status: findUniqueCalls <= 1 ? 'OPEN' : 'CLOSED',
            openingAmount: new Prisma.Decimal(1000),
            movements: [
              { amount: new Prisma.Decimal(500) }, // SALE
              { amount: new Prisma.Decimal(-100) }, // CASH_OUT
            ],
          });
        }),
        update,
      },
    };
    const service = new CashSessionsService();

    const { session, expectedAmount } = await runInTenant(db, () =>
      service.closeSession('session-1', { countedAmount: 1350 }),
    );

    // expected = 1000 + 500 - 100 = 1400; counted 1350 => difference -50 (faltante)
    expect(expectedAmount.toNumber()).toBe(1400);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'CLOSED',
          countedAmount: expect.any(Prisma.Decimal),
        }),
      }),
    );
    const updateData = update.mock.calls[0][0].data;
    expect((updateData.difference as Prisma.Decimal).toNumber()).toBe(-50);
    expect(session).toBeDefined();
  });

  it('rejects closing a session that is already CLOSED', async () => {
    const db = {
      cashSession: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'session-1',
          status: 'CLOSED',
          openingAmount: new Prisma.Decimal(1000),
          movements: [],
        }),
      },
    };
    const service = new CashSessionsService();

    await expect(
      runInTenant(db, () => service.closeSession('session-1', { countedAmount: 1000 })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('recalculates countedAmount from denominationBreakdown, ignoring an inconsistent dto.countedAmount', async () => {
    const update = jest.fn().mockResolvedValue({});
    let findUniqueCalls = 0;
    const db = {
      cashSession: {
        findUnique: jest.fn().mockImplementation(() => {
          findUniqueCalls += 1;
          return Promise.resolve({
            id: 'session-1',
            status: findUniqueCalls <= 1 ? 'OPEN' : 'CLOSED',
            openingAmount: new Prisma.Decimal(1000),
            movements: [],
          });
        }),
        update,
      },
    };
    const service = new CashSessionsService();

    // Desglose real: 2 billetes de 10000 + 3 monedas de 100 = 20300.
    // dto.countedAmount llega deliberadamente distinto (999999) - el
    // servidor tiene que ignorarlo y usar la suma real del desglose, nunca
    // al revés (ver el comentario en closeSession).
    const { session } = await runInTenant(db, () =>
      service.closeSession('session-1', {
        countedAmount: 999999,
        denominationBreakdown: [
          { kind: 'BILL', denomination: 10000, count: 2 },
          { kind: 'COIN', denomination: 100, count: 3 },
        ],
      }),
    );

    const updateData = update.mock.calls[0][0].data;
    expect((updateData.countedAmount as Prisma.Decimal).toNumber()).toBe(20300);
    // expected = openingAmount (1000) + 0 movimientos = 1000
    expect((updateData.difference as Prisma.Decimal).toNumber()).toBe(20300 - 1000);
    expect(updateData.denominationBreakdown).toEqual([
      { kind: 'BILL', denomination: 10000, count: 2 },
      { kind: 'COIN', denomination: 100, count: 3 },
    ]);
    expect(session).toBeDefined();
  });

  it('rejects a denominationBreakdown item whose kind/denomination pair is not a real ARS denomination', async () => {
    const db = {
      cashSession: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'session-1',
          status: 'OPEN',
          openingAmount: new Prisma.Decimal(1000),
          movements: [],
        }),
      },
    };
    const service = new CashSessionsService();

    // $2000 no existe como moneda (sólo como billete) - kind/denomination
    // inconsistente tiene que rechazarse antes de tocar cashSession.update.
    await expect(
      runInTenant(db, () =>
        service.closeSession('session-1', {
          countedAmount: 2000,
          denominationBreakdown: [{ kind: 'COIN', denomination: 2000, count: 1 }],
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('falls back to dto.countedAmount (simple mode) when denominationBreakdown is absent', async () => {
    const update = jest.fn().mockResolvedValue({});
    let findUniqueCalls = 0;
    const db = {
      cashSession: {
        findUnique: jest.fn().mockImplementation(() => {
          findUniqueCalls += 1;
          return Promise.resolve({
            id: 'session-1',
            status: findUniqueCalls <= 1 ? 'OPEN' : 'CLOSED',
            openingAmount: new Prisma.Decimal(1000),
            movements: [],
          });
        }),
        update,
      },
    };
    const service = new CashSessionsService();

    await runInTenant(db, () => service.closeSession('session-1', { countedAmount: 1500 }));

    const updateData = update.mock.calls[0][0].data;
    expect((updateData.countedAmount as Prisma.Decimal).toNumber()).toBe(1500);
    expect(updateData.denominationBreakdown).toBe(Prisma.JsonNull);
  });
});

describe('CashSessionsService.listSessions', () => {
  it('filters by registerId and a closedAt range (inclusive end-of-day)', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const db = { cashSession: { findMany } };
    const service = new CashSessionsService();

    await runInTenant(db, () =>
      service.listSessions({ registerId: 'register-1', from: '2026-09-01', to: '2026-09-02' }),
    );

    const where = findMany.mock.calls[0][0].where;
    expect(where.status).toBe('CLOSED');
    expect(where.registerId).toBe('register-1');
    expect(where.closedAt.gte).toEqual(new Date('2026-09-01'));
    expect(where.closedAt.lte.toISOString()).toBe('2026-09-02T23:59:59.999Z');
  });

  it('returns every CLOSED session when no filter is given (unchanged Fase 1 behavior)', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const db = { cashSession: { findMany } };
    const service = new CashSessionsService();

    await runInTenant(db, () => service.listSessions());

    expect(findMany.mock.calls[0][0].where).toEqual({ status: 'CLOSED' });
  });
});

describe('CashSessionsService.getDailyPosition', () => {
  it('aggregates open sessions (opening + movements) and closed-today totals', async () => {
    const db = {
      cashSession: {
        findMany: jest.fn().mockImplementation(({ where }: { where: { status: string } }) => {
          if (where.status === 'OPEN') {
            return Promise.resolve([
              { openingAmount: new Prisma.Decimal(1000), movements: [{ amount: new Prisma.Decimal(500) }] }, // 1500
              { openingAmount: new Prisma.Decimal(2000), movements: [] }, // 2000
            ]);
          }
          // CLOSED today: uno con sobrante (+50), uno con faltante (-20)
          return Promise.resolve([
            { countedAmount: new Prisma.Decimal(1050), difference: new Prisma.Decimal(50) },
            { countedAmount: new Prisma.Decimal(980), difference: new Prisma.Decimal(-20) },
          ]);
        }),
      },
    };
    const service = new CashSessionsService();

    const position = await runInTenant(db, () => service.getDailyPosition());

    expect(position.openSessionsCount).toBe(2);
    expect(position.openSessionsExpectedTotal.toNumber()).toBe(3500);
    expect(position.closedTodayCount).toBe(2);
    expect(position.closedTodayCountedTotal.toNumber()).toBe(2030);
    expect(position.closedTodayDifferenceTotal.toNumber()).toBe(30);
  });
});
