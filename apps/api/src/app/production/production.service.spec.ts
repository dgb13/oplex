import type { AccountingService } from '@plexo/accounting';
import { Prisma, tenantContextStorage } from '@plexo/database';
import type { InventoryService } from '@plexo/inventory';
import type { BomService, ProductionOrderService, StockPieceService } from '@plexo/production';
import { ProductionService } from './production.service.js';

function makeAccountingService() {
  return { postProductionJournalEntry: jest.fn().mockResolvedValue(undefined) };
}

function runAsTenant<T>(db: Record<string, unknown>, fn: () => T): T {
  return tenantContextStorage.run({ tenantId: 'tenant-1', userId: 'user-1', tx: db as never }, fn);
}

function makeOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order-1',
    outputArticleVariantId: 'variant-prepizza',
    bomId: 'bom-1',
    bomVersion: 1,
    quantity: new Prisma.Decimal(4),
    status: 'PLANNED',
    isShortOnMaterials: false,
    ...overrides,
  };
}

function makeReservation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'reservation-1',
    productionOrderId: 'order-1',
    inputArticleVariantId: 'variant-harina',
    warehouseId: 'warehouse-1',
    quantityReserved: new Prisma.Decimal(1000),
    stockPieceId: null,
    status: 'ACTIVE',
    ...overrides,
  };
}

describe('ProductionService.completeOrder', () => {
  it('records one PRODUCTION_OUT/consumption per DISCRETE-or-similar reservation, then one PRODUCTION_IN output for the primary product', async () => {
    const order = makeOrder();
    const reservation = makeReservation();
    const db = {
      articleVariant: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ article: { measurementType: 'DISCRETE', minUsableLength: null } }),
      },
    };
    const orderService = {
      assertCompletable: jest.fn().mockResolvedValue(order),
      getActiveReservations: jest.fn().mockResolvedValue([reservation]),
      recordConsumption: jest.fn().mockResolvedValue({}),
      recordOutput: jest.fn().mockResolvedValue({}),
      finishOrder: jest.fn().mockResolvedValue({ ...order, status: 'DONE' }),
    };
    const bomService = { getById: jest.fn().mockResolvedValue({ id: 'bom-1', byproducts: [] }) };
    const stockPieceService = {};
    const inventoryService = {
      recordMovement: jest.fn().mockResolvedValue({ unitCost: new Prisma.Decimal(2) }),
    };
    const accountingService = makeAccountingService();

    const service = new ProductionService(
      orderService as unknown as ProductionOrderService,
      stockPieceService as unknown as StockPieceService,
      bomService as unknown as BomService,
      inventoryService as unknown as InventoryService,
      accountingService as unknown as AccountingService,
    );

    const result = await runAsTenant(db, () => service.completeOrder('order-1'));

    expect(inventoryService.recordMovement).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'PRODUCTION_OUT', articleVariantId: 'variant-harina', quantity: 1000 }),
    );
    // cost = unitCost(2) * quantityReserved(1000) = 2000
    expect(orderService.recordConsumption).toHaveBeenCalledWith(
      expect.objectContaining({ cost: expect.objectContaining({ toString: expect.any(Function) }) }),
    );
    const consumptionCost = (orderService.recordConsumption as jest.Mock).mock.calls[0][0].cost;
    expect(consumptionCost.toString()).toBe('2000');

    expect(inventoryService.recordMovement).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'PRODUCTION_IN', articleVariantId: 'variant-prepizza', quantity: 4 }),
    );
    const outputCall = (orderService.recordOutput as jest.Mock).mock.calls[0][0];
    expect(outputCall.isPrimary).toBe(true);
    expect(outputCall.cost.toString()).toBe('2000');
    expect(result.status).toBe('DONE');

    // Ambos deben cerrar iguales (2000 == 2000), sin subproductos.
    const journalCall = (accountingService.postProductionJournalEntry as jest.Mock).mock.calls[0][0];
    expect(journalCall.productionOrderId).toBe('order-1');
    expect(journalCall.inputsCost.toString()).toBe('2000');
    expect(journalCall.outputsCost.toString()).toBe('2000');
  });

  describe('1D (barras): cada corte sale entero de una sola pieza', () => {
    type Piece = { id: string; currentLength: Prisma.Decimal; unitCost: Prisma.Decimal };

    function setup(input: {
      lines: { length: number; cutsCount: number }[];
      pieces: Piece[];
      minUsableLength: number;
      orderQuantity?: number;
    }) {
      const order = makeOrder({ quantity: new Prisma.Decimal(input.orderQuantity ?? 1) });
      const reservations = input.lines.map((l, i) =>
        makeReservation({
          id: `reservation-${i + 1}`,
          inputArticleVariantId: 'variant-tubo',
          quantityReserved: new Prisma.Decimal(l.length * l.cutsCount),
        }),
      );
      const db = {
        articleVariant: {
          findUniqueOrThrow: jest.fn().mockResolvedValue({
            article: { name: 'Tubo', measurementType: 'LINEAL_1D', minUsableLength: new Prisma.Decimal(input.minUsableLength) },
          }),
        },
      };
      const orderService = {
        assertCompletable: jest.fn().mockResolvedValue(order),
        getActiveReservations: jest.fn().mockResolvedValue(reservations),
        recordConsumption: jest.fn().mockResolvedValue({}),
        markReservationsConsumed: jest.fn().mockResolvedValue(undefined),
        recordOutput: jest.fn().mockResolvedValue({}),
        finishOrder: jest.fn().mockResolvedValue({ ...order, status: 'DONE' }),
      };
      const bomService = {
        getById: jest.fn().mockResolvedValue({
          id: 'bom-1',
          byproducts: [],
          lines: input.lines.map((l) => ({
            inputArticleVariantId: 'variant-tubo',
            quantity: new Prisma.Decimal(l.length * l.cutsCount),
            length: new Prisma.Decimal(l.length),
            cutsCount: l.cutsCount,
          })),
        }),
      };
      const byId = new Map(input.pieces.map((p) => [p.id, p]));
      const stockPieceService = {
        listAvailablePieces: jest.fn().mockResolvedValue(input.pieces),
        // Mismo contrato que el real: el remanente es AVAILABLE si llega al
        // largo mínimo útil, SCRAP si no.
        cutPiece: jest.fn(({ pieceId, lengthToCut }: { pieceId: string; lengthToCut: Prisma.Decimal }) => {
          const piece = byId.get(pieceId) as Piece;
          const remainder = piece.currentLength.sub(lengthToCut);
          const offcut = remainder.gt(0)
            ? {
                id: `offcut-of-${pieceId}`,
                currentLength: remainder,
                status: remainder.gte(input.minUsableLength) ? 'AVAILABLE' : 'SCRAP',
              }
            : null;
          return Promise.resolve({ consumedFrom: piece, offcut });
        }),
      };
      const inventoryService = { recordMovement: jest.fn().mockResolvedValue({ unitCost: null }) };
      const service = new ProductionService(
        orderService as unknown as ProductionOrderService,
        stockPieceService as unknown as StockPieceService,
        bomService as unknown as BomService,
        inventoryService as unknown as InventoryService,
        makeAccountingService() as unknown as AccountingService,
      );
      return { db, service, orderService, stockPieceService, inventoryService };
    }

    const piece = (id: string, length: number, unitCost = 3): Piece => ({
      id,
      currentLength: new Prisma.Decimal(length),
      unitCost: new Prisma.Decimal(unitCost),
    });

    it('2 cortes de 1200 con barras de 2000: usa las 2 barras y deja 2 recortes de 800 (nunca 2000 + 400)', async () => {
      const { db, service, orderService, stockPieceService, inventoryService } = setup({
        lines: [{ length: 1200, cutsCount: 2 }],
        pieces: [piece('barra-1', 2000), piece('barra-2', 2000)],
        minUsableLength: 300,
      });

      await runAsTenant(db, () => service.completeOrder('order-1'));

      const cuts = (stockPieceService.cutPiece as jest.Mock).mock.calls.map((c) => [c[0].pieceId, c[0].lengthToCut.toString()]);
      expect(cuts).toEqual([
        ['barra-1', '1200'],
        ['barra-2', '1200'],
      ]);
      const consumed = (orderService.recordConsumption as jest.Mock).mock.calls.map((c) => c[0].quantityConsumed.toString());
      expect(consumed).toEqual(['1200', '1200']);
      // Los recortes de 800 quedan AVAILABLE: el stock baja sólo por lo cortado.
      expect(inventoryService.recordMovement).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'PRODUCTION_OUT', articleVariantId: 'variant-tubo', quantity: 2400 }),
      );
      const totalCost = (orderService.recordConsumption as jest.Mock).mock.calls.reduce(
        (sum, c) => sum.add(c[0].cost),
        new Prisma.Decimal(0),
      );
      expect(totalCost.toString()).toBe('7200'); // 2400mm * $3/mm
    });

    it('rechaza completar si un corte no entra entero en ninguna pieza, aunque la suma de mm alcance', async () => {
      const { db, service, stockPieceService, inventoryService } = setup({
        lines: [{ length: 1200, cutsCount: 1 }],
        pieces: [piece('recorte-1', 1000), piece('recorte-2', 1000)],
        minUsableLength: 300,
      });

      await expect(runAsTenant(db, () => service.completeOrder('order-1'))).rejects.toThrow('al menos 1200 mm');
      expect(stockPieceService.cutPiece).not.toHaveBeenCalled();
      expect(inventoryService.recordMovement).not.toHaveBeenCalled();
    });

    it('reusa el sobrante de una barra para cortes de otra línea, y la merma real baja stock y suma costo', async () => {
      // Líneas 1200 y 520 del mismo tubo (dos reservas). Best-fit de mayor
      // a menor: 1200 -> barra de 2000 (sobran 800), 520 -> ese sobrante
      // de 800 (no la barra de 6000). Quedan 280 < 300 de mínimo útil = merma.
      const { db, service, orderService, stockPieceService, inventoryService } = setup({
        lines: [
          { length: 1200, cutsCount: 1 },
          { length: 520, cutsCount: 1 },
        ],
        pieces: [piece('barra-corta', 2000, 2), piece('barra-larga', 6000, 2)],
        minUsableLength: 300,
      });

      await runAsTenant(db, () => service.completeOrder('order-1'));

      expect(stockPieceService.cutPiece).toHaveBeenCalledTimes(1);
      const call = (stockPieceService.cutPiece as jest.Mock).mock.calls[0][0];
      expect(call.pieceId).toBe('barra-corta');
      expect(call.lengthToCut.toString()).toBe('1720');
      // Stock: 1720 cortados + 280 de merma = la barra entera.
      expect(inventoryService.recordMovement).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'PRODUCTION_OUT', quantity: 2000 }),
      );
      const consumptions = (orderService.recordConsumption as jest.Mock).mock.calls.map((c) => c[0]);
      expect(consumptions.map((c) => c.quantityConsumed.toString())).toEqual(['1200', '520']);
      expect(consumptions[1].wasteAmount.toString()).toBe('280');
      expect(consumptions.reduce((s, c) => s.add(c.cost), new Prisma.Decimal(0)).toString()).toBe('4000'); // 2000mm * $2
      expect(orderService.markReservationsConsumed).toHaveBeenCalledWith(['reservation-1', 'reservation-2']);
    });

    it('multiplica los cortes por la cantidad de la orden', async () => {
      const { db, service, stockPieceService } = setup({
        lines: [{ length: 720, cutsCount: 4 }],
        pieces: [piece('barra-1', 6000)],
        minUsableLength: 100,
        orderQuantity: 2,
      });

      await runAsTenant(db, () => service.completeOrder('order-1'));

      // 8 patas de 720 = 5760 de una sola barra de 6000.
      expect((stockPieceService.cutPiece as jest.Mock).mock.calls[0][0].lengthToCut.toString()).toBe('5760');
    });
  });


  it('splits output cost between declared byproducts and the primary product', async () => {
    const order = makeOrder({ quantity: new Prisma.Decimal(1) });
    const reservation = makeReservation();
    const db = {
      articleVariant: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ article: { measurementType: 'DISCRETE', minUsableLength: null } }),
      },
    };
    const orderService = {
      assertCompletable: jest.fn().mockResolvedValue(order),
      getActiveReservations: jest.fn().mockResolvedValue([reservation]),
      recordConsumption: jest.fn().mockResolvedValue({}),
      recordOutput: jest.fn().mockResolvedValue({}),
      finishOrder: jest.fn().mockResolvedValue({ ...order, status: 'DONE' }),
    };
    const bomService = {
      getById: jest.fn().mockResolvedValue({
        id: 'bom-1',
        byproducts: [{ outputArticleVariantId: 'variant-subproducto', quantity: new Prisma.Decimal(2), costSharePercent: new Prisma.Decimal(20) }],
      }),
    };
    const stockPieceService = {};
    // costo total consumido = unitCost(10) * 1000 = 10000
    const inventoryService = { recordMovement: jest.fn().mockResolvedValue({ unitCost: new Prisma.Decimal(10) }) };
    const accountingService = makeAccountingService();

    const service = new ProductionService(
      orderService as unknown as ProductionOrderService,
      stockPieceService as unknown as StockPieceService,
      bomService as unknown as BomService,
      inventoryService as unknown as InventoryService,
      accountingService as unknown as AccountingService,
    );

    await runAsTenant(db, () => service.completeOrder('order-1'));

    const outputCalls = (orderService.recordOutput as jest.Mock).mock.calls;
    const byproductOutput = outputCalls.find((c) => c[0].isPrimary === false)[0];
    const primaryOutput = outputCalls.find((c) => c[0].isPrimary === true)[0];

    // 20% de 10000 = 2000 para el subproducto, el resto (8000) al principal.
    expect(byproductOutput.cost.toString()).toBe('2000');
    expect(primaryOutput.cost.toString()).toBe('8000');
    expect(byproductOutput.quantityProduced.toString()).toBe('2');

    // Subproducto (2000) + principal (8000) tienen que cerrar exacto
    // contra lo consumido (10000), sin diferencia de producción.
    const journalCall = (accountingService.postProductionJournalEntry as jest.Mock).mock.calls[0][0];
    expect(journalCall.inputsCost.toString()).toBe('10000');
    expect(journalCall.outputsCost.toString()).toBe('10000');
  });

  it('rejects completing an order with no active reservation', async () => {
    const order = makeOrder();
    const db = { articleVariant: { findUniqueOrThrow: jest.fn() } };
    const orderService = {
      assertCompletable: jest.fn().mockResolvedValue(order),
      getActiveReservations: jest.fn().mockResolvedValue([]),
    };
    const service = new ProductionService(
      orderService as unknown as ProductionOrderService,
      {} as StockPieceService,
      {} as BomService,
      {} as InventoryService,
      {} as AccountingService,
    );

    await expect(runAsTenant(db, () => service.completeOrder('order-1'))).rejects.toThrow(
      'ninguna reserva activa',
    );
  });
});
