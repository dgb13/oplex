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

  it('adds up every line of the same insumo instead of dividing each one against the whole stock', async () => {
    // 100 disponibles; la receta usa el mismo insumo en 2 líneas de 30.
    // Antes: cada línea 100/30 = 3 -> máximo 3. Real: 100/60 = 1.
    const db = makeDb();
    const bomService = {
      getActiveBomOrThrow: jest.fn().mockResolvedValue({
        id: 'bom-1',
        lines: [
          { inputArticleVariantId: 'variant-huevo', quantity: new Prisma.Decimal(30), expectedWastePercent: new Prisma.Decimal(0) },
          { inputArticleVariantId: 'variant-huevo', quantity: new Prisma.Decimal(30), expectedWastePercent: new Prisma.Decimal(0) },
        ],
      }),
    };
    const service = new ProductionPlanningService(bomService as unknown as BomService, {} as StockPieceService);

    const result = await runAsTenant(db, () => service.computeProducible('variant-tortilla', 'warehouse-1'));

    expect(result.maxProducible.toString()).toBe('1');
  });

  it('caps a 1D insumo by what actually fits in its pieces, not just by total mm', async () => {
    // 1600 mm en dos recortes de 800 y un corte de 1200 por unidad: por mm
    // daría 1, pero ninguna pieza lo admite entero -> 0.
    const db = makeDb({
      articleVariant: { findUnique: jest.fn().mockResolvedValue({ article: { measurementType: 'LINEAL_1D' } }) },
    });
    const bomService = {
      getActiveBomOrThrow: jest.fn().mockResolvedValue({
        id: 'bom-1',
        lines: [
          {
            inputArticleVariantId: 'variant-tubo',
            quantity: new Prisma.Decimal(1200),
            length: new Prisma.Decimal(1200),
            cutsCount: 1,
            expectedWastePercent: new Prisma.Decimal(0),
          },
        ],
      }),
    };
    const stockPieceService = {
      getAvailableLength: jest.fn().mockResolvedValue(new Prisma.Decimal(1600)),
      listAvailablePieces: jest.fn().mockResolvedValue([
        { id: 'p1', currentLength: new Prisma.Decimal(800) },
        { id: 'p2', currentLength: new Prisma.Decimal(800) },
      ]),
    };
    const service = new ProductionPlanningService(
      bomService as unknown as BomService,
      stockPieceService as unknown as StockPieceService,
    );

    const result = await runAsTenant(db, () => service.computeProducible('variant-travesano', 'warehouse-1'));

    expect(result.maxProducible.toString()).toBe('0');
  });
});
