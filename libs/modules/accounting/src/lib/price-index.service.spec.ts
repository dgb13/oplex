import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma, type PriceIndexEntry, type PriceIndexSource, type PrismaService } from '@plexo/database';
import type { PriceIndexMonthlyVariation, PriceIndexSourcePort } from './price-index-source.port.js';
import { PriceIndexService } from './price-index.service.js';

/** Fake mínimo pero real en memoria para price_index_entries - probar la
 * cadena de indexValue mockeando cada llamada a Prisma por separado sería
 * ilegible; esto ejerce la lógica real de recomputeChainFrom/getCoefficient
 * contra un store simple, sin depender de una base real. */
function fakePrisma() {
  const rows = new Map<number, PriceIndexEntry>();
  const priceIndexEntry = {
    findMany: jest.fn(({ where, orderBy }: { where?: { period?: { gte?: Date; lte?: Date } }; orderBy?: unknown } = {}) => {
      let list = [...rows.values()];
      const gte = where?.period?.gte;
      const lte = where?.period?.lte;
      if (gte) list = list.filter((r) => r.period >= gte);
      if (lte) list = list.filter((r) => r.period <= lte);
      if (orderBy) list.sort((a, b) => a.period.getTime() - b.period.getTime());
      return Promise.resolve(list);
    }),
    upsert: jest.fn(
      ({
        where,
        create,
        update,
      }: {
        where: { period: Date };
        create: { period: Date; monthlyVariationPct: number; indexValue: number; source: PriceIndexSource; updatedByUserId?: string };
        update: { monthlyVariationPct: number; source: PriceIndexSource; updatedByUserId?: string };
      }) => {
        const key = where.period.getTime();
        const existing = rows.get(key);
        const row: PriceIndexEntry = existing
          ? { ...existing, monthlyVariationPct: new Prisma.Decimal(update.monthlyVariationPct), source: update.source, updatedByUserId: update.updatedByUserId ?? null }
          : {
              id: `idx-${key}`,
              period: create.period,
              monthlyVariationPct: new Prisma.Decimal(create.monthlyVariationPct),
              indexValue: new Prisma.Decimal(create.indexValue),
              source: create.source,
              updatedByUserId: create.updatedByUserId ?? null,
              updatedAt: new Date(),
            };
        rows.set(key, row);
        return Promise.resolve(row);
      },
    ),
    update: jest.fn(({ where, data }: { where: { period: Date }; data: { indexValue: Prisma.Decimal } }) => {
      const key = where.period.getTime();
      const existing = rows.get(key);
      if (!existing) throw new Error('not found');
      const updated = { ...existing, indexValue: data.indexValue };
      rows.set(key, updated);
      return Promise.resolve(updated);
    }),
    findUniqueOrThrow: jest.fn(({ where }: { where: { period: Date } }) => {
      const row = rows.get(where.period.getTime());
      if (!row) throw new Error('not found');
      return Promise.resolve(row);
    }),
  };
  return { prisma: { priceIndexEntry } as unknown as PrismaService, rows };
}

function period(year: number, month: number): Date {
  return new Date(Date.UTC(year, month - 1, 1));
}

function stubSource(variations: PriceIndexMonthlyVariation[]): PriceIndexSourcePort {
  return { getMonthlyVariations: jest.fn().mockResolvedValue(variations) };
}

describe('PriceIndexService.upsertPeriod / recomputeChainFrom', () => {
  it('seeds the first period at base 100 chained by its own variation', async () => {
    const { prisma } = fakePrisma();
    const service = new PriceIndexService(prisma, stubSource([]));

    const entry = await service.upsertPeriod(period(2026, 1), 10, 'MANUAL');

    expect(entry.indexValue.toNumber()).toBeCloseTo(110, 6);
  });

  it('chains a second period off the first', async () => {
    const { prisma } = fakePrisma();
    const service = new PriceIndexService(prisma, stubSource([]));

    await service.upsertPeriod(period(2026, 1), 10, 'MANUAL');
    const feb = await service.upsertPeriod(period(2026, 2), 20, 'MANUAL');

    expect(feb.indexValue.toNumber()).toBeCloseTo(110 * 1.2, 6);
  });

  it('editing an old period recomputes it and every later period', async () => {
    const { prisma } = fakePrisma();
    const service = new PriceIndexService(prisma, stubSource([]));

    await service.upsertPeriod(period(2026, 1), 10, 'MANUAL');
    await service.upsertPeriod(period(2026, 2), 20, 'MANUAL');
    await service.upsertPeriod(period(2026, 1), 5, 'MANUAL'); // corrección

    const jan = await prisma.priceIndexEntry.findUniqueOrThrow({ where: { period: period(2026, 1) } });
    const feb = await prisma.priceIndexEntry.findUniqueOrThrow({ where: { period: period(2026, 2) } });

    expect(jan.indexValue.toNumber()).toBeCloseTo(105, 6);
    expect(feb.indexValue.toNumber()).toBeCloseTo(105 * 1.2, 6);
  });
});

describe('PriceIndexService.getCoefficient', () => {
  it('divides the closing index level by the origin index level', async () => {
    const { prisma } = fakePrisma();
    const service = new PriceIndexService(prisma, stubSource([]));
    await service.upsertPeriod(period(2026, 1), 10, 'MANUAL'); // 110
    await service.upsertPeriod(period(2026, 2), 10, 'MANUAL'); // 121

    const coefficient = await service.getCoefficient(period(2026, 1), period(2026, 2));

    expect(coefficient.toNumber()).toBeCloseTo(121 / 110, 6);
  });

  it('throws a clear error when a month in the middle of the range is missing', async () => {
    const { prisma } = fakePrisma();
    const service = new PriceIndexService(prisma, stubSource([]));
    await service.upsertPeriod(period(2026, 1), 10, 'MANUAL');
    await service.upsertPeriod(period(2026, 3), 10, 'MANUAL'); // falta febrero

    await expect(service.getCoefficient(period(2026, 1), period(2026, 3))).rejects.toThrow(
      BadRequestException,
    );
  });

  it('throws NotFoundException when the closing period itself is missing', async () => {
    const { prisma } = fakePrisma();
    const service = new PriceIndexService(prisma, stubSource([]));
    await service.upsertPeriod(period(2026, 1), 10, 'MANUAL');

    await expect(service.getCoefficient(period(2026, 1), period(2026, 2))).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('PriceIndexService.syncFromSource', () => {
  it('upserts periods from the source and reports how many were synced', async () => {
    const { prisma } = fakePrisma();
    const service = new PriceIndexService(
      prisma,
      stubSource([
        { period: period(2026, 1), variationPct: 10 },
        { period: period(2026, 2), variationPct: 20 },
      ]),
    );

    const result = await service.syncFromSource();

    expect(result).toEqual({ synced: 2, skippedManual: 0 });
    const jan = await prisma.priceIndexEntry.findUniqueOrThrow({ where: { period: period(2026, 1) } });
    expect(jan.source).toBe('API_ARGENTINADATOS');
  });

  it('never overwrites a period the user already corrected by hand (source=MANUAL)', async () => {
    const { prisma } = fakePrisma();
    const service = new PriceIndexService(
      prisma,
      stubSource([{ period: period(2026, 1), variationPct: 999 }]),
    );
    await service.upsertPeriod(period(2026, 1), 5, 'MANUAL');

    const result = await service.syncFromSource();

    expect(result).toEqual({ synced: 0, skippedManual: 1 });
    const jan = await prisma.priceIndexEntry.findUniqueOrThrow({ where: { period: period(2026, 1) } });
    expect(jan.monthlyVariationPct.toNumber()).toBe(5);
    expect(jan.source).toBe('MANUAL');
  });
});
