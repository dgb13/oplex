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
});
