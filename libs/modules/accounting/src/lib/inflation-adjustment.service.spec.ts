import { BadRequestException } from '@nestjs/common';
import { Prisma, tenantContextStorage } from '@plexo/database';
import type { AccountingService } from './accounting.service.js';
import { InflationAdjustmentService } from './inflation-adjustment.service.js';
import type { PriceIndexService } from './price-index.service.js';

function runInTenant<T>(db: Record<string, unknown>, fn: () => T): T {
  return tenantContextStorage.run({ tenantId: 'tenant-1', userId: 'user-1', tx: db as never }, fn);
}

function period(year: number, month: number): Date {
  return new Date(Date.UTC(year, month - 1, 1));
}

function makeAccount(id: string, code: string, type: 'ASSET' | 'LIABILITY', isMonetary = true) {
  return { id, code, name: code, type, isMonetary };
}

/** Coeficiente lineal simple para las pruebas: 10% acumulado por mes de
 * distancia desde `from` (2026-01 => 1.0, 2026-02 => 1.1, 2026-03 => 1.21). */
function linearCoefficientResolver(base: Date) {
  return (fromPeriod: Date) => {
    const months =
      (base.getUTCFullYear() - fromPeriod.getUTCFullYear()) * 12 + (base.getUTCMonth() - fromPeriod.getUTCMonth());
    return new Prisma.Decimal(1.1).pow(months);
  };
}

function makeServices(overrides: {
  accountingService?: Partial<AccountingService>;
  priceIndexService?: Partial<PriceIndexService>;
} = {}) {
  const accountingService = {
    getAccountBalancesAsOf: jest.fn().mockResolvedValue(new Map()),
    ...overrides.accountingService,
  } as unknown as AccountingService;
  const priceIndexService = {
    getCoefficientResolver: jest.fn(),
    ...overrides.priceIndexService,
  } as unknown as PriceIndexService;
  const service = new InflationAdjustmentService(accountingService, priceIndexService);
  return { service, accountingService, priceIndexService };
}

describe('InflationAdjustmentService.getPreview', () => {
  it('rejects a range that does not start on the first day of a month', async () => {
    const { service } = makeServices();
    const db = { accountingAccount: { findMany: jest.fn().mockResolvedValue([]) } };

    await expect(
      runInTenant(db, () => service.getPreview(new Date(Date.UTC(2026, 0, 15)), period(2026, 3))),
    ).rejects.toThrow(BadRequestException);
  });

  it('returns an empty preview when there are no monetary accounts', async () => {
    const { service } = makeServices();
    const db = { accountingAccount: { findMany: jest.fn().mockResolvedValue([]) } };

    const preview = await runInTenant(db, () => service.getPreview(period(2026, 1), period(2026, 3)));

    expect(preview.rows).toEqual([]);
    expect(preview.recpam.toNumber()).toBe(0);
  });

  it('a monetary ASSET held constant through inflation contributes a positive (loss) RECPAM', async () => {
    const account = makeAccount('acc-caja', '1.1.03', 'ASSET');
    const { service, accountingService, priceIndexService } = makeServices({
      accountingService: {
        getAccountBalancesAsOf: jest.fn().mockResolvedValue(new Map([[account.id, new Prisma.Decimal(1000)]])),
      },
      priceIndexService: {
        getCoefficientResolver: jest.fn().mockResolvedValue(linearCoefficientResolver(period(2026, 3))),
      },
    });
    const db = {
      accountingAccount: { findMany: jest.fn().mockResolvedValue([account]) },
      journalEntryLine: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const preview = await runInTenant(db, () => service.getPreview(period(2026, 1), period(2026, 3)));

    expect(accountingService.getAccountBalancesAsOf).toHaveBeenCalledWith([account.id], period(2026, 1));
    // coeficiente from(ene)->to(mar) = 1.1^2 = 1.21 -> 1000*1.21 - 1000 = 210
    expect(preview.rows[0].contribution.toNumber()).toBeCloseTo(210, 6);
    expect(preview.recpam.toNumber()).toBeCloseTo(210, 6);
    void priceIndexService;
  });

  it('a monetary LIABILITY held constant through inflation contributes a negative (gain) RECPAM', async () => {
    const account = makeAccount('acc-prov', '2.1.05', 'LIABILITY');
    const { service } = makeServices({
      accountingService: {
        getAccountBalancesAsOf: jest.fn().mockResolvedValue(new Map([[account.id, new Prisma.Decimal(1000)]])),
      },
      priceIndexService: {
        getCoefficientResolver: jest.fn().mockResolvedValue(linearCoefficientResolver(period(2026, 3))),
      },
    });
    const db = {
      accountingAccount: { findMany: jest.fn().mockResolvedValue([account]) },
      journalEntryLine: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const preview = await runInTenant(db, () => service.getPreview(period(2026, 1), period(2026, 3)));

    expect(preview.rows[0].contribution.toNumber()).toBeCloseTo(-210, 6);
    expect(preview.recpam.toNumber()).toBeCloseTo(-210, 6);
  });

  it('reexpresses each movement at its own month coefficient, not the opening one', async () => {
    const account = makeAccount('acc-caja', '1.1.03', 'ASSET');
    const { service } = makeServices({
      accountingService: {
        getAccountBalancesAsOf: jest.fn().mockResolvedValue(new Map([[account.id, new Prisma.Decimal(0)]])),
      },
      priceIndexService: {
        getCoefficientResolver: jest.fn().mockResolvedValue(linearCoefficientResolver(period(2026, 3))),
      },
    });
    const db = {
      accountingAccount: { findMany: jest.fn().mockResolvedValue([account]) },
      journalEntryLine: {
        findMany: jest.fn().mockResolvedValue([
          {
            accountId: account.id,
            direction: 'DEBIT',
            amount: new Prisma.Decimal(500),
            journalEntry: { date: period(2026, 2) },
          },
        ]),
      },
    };

    const preview = await runInTenant(db, () => service.getPreview(period(2026, 1), period(2026, 3)));

    // movimiento de febrero, coeficiente feb->mar = 1.1 -> 500*1.1 - 500 = 50
    expect(preview.rows[0].movementsNominal.toNumber()).toBe(500);
    expect(preview.rows[0].contribution.toNumber()).toBeCloseTo(50, 6);
  });

  it('excludes an ASSET account explicitly marked as not monetary (e.g. Mercaderías)', async () => {
    const { service } = makeServices();
    const db = { accountingAccount: { findMany: jest.fn().mockResolvedValue([]) } };

    await runInTenant(db, () => service.getPreview(period(2026, 1), period(2026, 3)));

    // isMonetary:true está en el where - un mock que devuelve [] simula que
    // Mercaderías (isMonetary:false) nunca llega a esta lista.
    expect(db.accountingAccount.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ isMonetary: true }) }),
    );
  });
});
