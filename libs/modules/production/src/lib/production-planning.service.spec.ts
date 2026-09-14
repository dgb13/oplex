import { Prisma, tenantContextStorage } from '@plexo/database';
import { ProductionPlanningService } from './production-planning.service.js';
import type { BomService } from './bom.service.js';
import type { StockPieceService } from './stock-piece.service.js';

function runAsTenant<T>(db: Record<string, unknown>, fn: () => T): T {
  return tenantContextStorage.run({ tenantId: 'tenant-1', userId: 'user-1', tx: db as never }, fn);
}

function makeDb(overrides: Record<string, unknown> = {}) {
  return {
    articleVariant: {
      findUnique: jest.fn().mockResolvedValue({ article: { measurementType: 'DISCRETE' } }),
    },
    stockLedger: {
      findUnique: jest.fn().mockResolvedValue({ quantity: new Prisma.Decimal(100) }),
    },
    stockReservation: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { quantityReserved: null } }),
    },
    ...overrides,
  };
}

describe('ProductionPlanningService.getDisponible', () => {
  it('reads StockLedger.quantity minus reservations for a non-1D input', async () => {
    const db = makeDb({
      stockReservation: { aggregate: jest.fn().mockResolvedValue({ _sum: { quantityReserved: new Prisma.Decimal(30) } }) },
    });
    const service = new ProductionPlanningService({} as BomService, {} as StockPieceService);

    const disponible = await runAsTenant(db, () =>
      service.getDisponible({ articleVariantId: 'variant-1', warehouseId: 'warehouse-1' }),
    );

    expect(disponible.toString()).toBe('70');
  });

  it('reads the sum of AVAILABLE StockPiece length minus reservations for a LINEAL_1D input', async () => {
    const db = makeDb({
      articleVariant: { findUnique: jest.fn().mockResolvedValue({ article: { measurementType: 'LINEAL_1D' } }) },
      stockReservation: { aggregate: jest.fn().mockResolvedValue({ _sum: { quantityReserved: new Prisma.Decimal(500) } }) },
    });
    const stockPieceService = { getAvailableLength: jest.fn().mockResolvedValue(new Prisma.Decimal(3000)) };
    const service = new ProductionPlanningService({} as BomService, stockPieceService as unknown as StockPieceService);

    const disponible = await runAsTenant(db, () =>
      service.getDisponible({ articleVariantId: 'variant-cable', warehouseId: 'warehouse-1' }),
    );

    expect(disponible.toString()).toBe('2500');
    expect(stockPieceService.getAvailableLength).toHaveBeenCalledWith({
      articleVariantId: 'variant-cable',
      warehouseId: 'warehouse-1',
    });
  });
});

describe('ProductionPlanningService.computeProducible', () => {
  it('picks the input with the least producible amount as the bottleneck', async () => {
    const db = makeDb();
    const bomService = {
      getActiveBomOrThrow: jest.fn().mockResolvedValue({
        id: 'bom-1',
        lines: [
          { inputArticleVariantId: 'variant-harina', quantity: new Prisma.Decimal(250), expectedWastePercent: new Prisma.Decimal(0) },
          { inputArticleVariantId: 'variant-queso', quantity: new Prisma.Decimal(100), expectedWastePercent: new Prisma.Decimal(0) },
        ],
      }),
    };
    const service = new ProductionPlanningService(bomService as unknown as BomService, {} as StockPieceService);

    // 'disponible' devuelve 100 para cualquier insumo (mock de stockLedger
    // arriba) - harina 250gr/u -> producible 0 (100/250 floor); queso
    // 100gr/u -> producible 1. Harina es el cuello de botella.
    const result = await runAsTenant(db, () => service.computeProducible('variant-prepizza', 'warehouse-1'));

    expect(result.bottleneck?.inputArticleVariantId).toBe('variant-harina');
    expect(result.maxProducible.toString()).toBe('0');
    expect(result.perLine).toHaveLength(2);
  });

  it('applies expectedWastePercent to the required amount', async () => {
    const db = makeDb({
      stockLedger: { findUnique: jest.fn().mockResolvedValue({ quantity: new Prisma.Decimal(1030) }) },
    });
    const bomService = {
      getActiveBomOrThrow: jest.fn().mockResolvedValue({
        id: 'bom-1',
        lines: [
          { inputArticleVariantId: 'variant-harina', quantity: new Prisma.Decimal(250), expectedWastePercent: new Prisma.Decimal(3) },
        ],
      }),
    };
    const service = new ProductionPlanningService(bomService as unknown as BomService, {} as StockPieceService);

    // requerido = 250 * 1.03 = 257.5; disponible 1030 / 257.5 = 4 exacto.
    const result = await runAsTenant(db, () => service.computeProducible('variant-prepizza', 'warehouse-1'));

    expect(result.maxProducible.toString()).toBe('4');
  });
});
