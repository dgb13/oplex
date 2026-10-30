import { Prisma, tenantContextStorage } from '@plexo/database';
import type { InventoryService } from '@plexo/inventory';
import type { PayablesService } from '@plexo/payables';
import type { CashSessionsService } from '@plexo/pos';
import type { PurchaseOrderService } from '@plexo/purchases';
import type { ReceivablesService } from '@plexo/receivables';
import type { ReportsSalesService } from '@plexo/reports-sales';
import type { AuthenticatedUser } from '@plexo/types';

// `@plexo/receivables` compilado arrastra CustomerStatementPdfService
// (@react-pdf/renderer, paquete ESM puro que Jest no transforma) apenas se
// importa CUALQUIER cosa del barrel - mockeado acá para que este test
// unitario no dependa de esa cadena (sólo usamos el shape del Service, no
// la clase real). Mismo motivo para @plexo/pos/@plexo/reports-sales/
// @plexo/inventory, por consistencia con el resto de las herramientas de
// este archivo.
jest.mock('@plexo/receivables', () => ({}));
jest.mock('@plexo/pos', () => ({}));
jest.mock('@plexo/reports-sales', () => ({}));
jest.mock('@plexo/inventory', () => ({}));
jest.mock('@plexo/payables', () => ({}));
jest.mock('@plexo/purchases', () => ({}));

import { AssistantToolsService } from './assistant-tools.service.js';

function makeUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    sub: 'user-1',
    tenantId: 'tenant-1',
    email: 'a@b.com',
    roles: ['VIEWER'],
    moduleAccess: [],
    mustChangePassword: false,
    ...overrides,
  };
}

describe('AssistantToolsService', () => {
  function makeService() {
    const reportsSalesService = { getSalesByProduct: jest.fn() } as unknown as ReportsSalesService;
    const receivablesService = { getAgingReport: jest.fn() } as unknown as ReceivablesService;
    const cashSessionsService = { getDailyPosition: jest.fn() } as unknown as CashSessionsService;
    const inventoryService = { listArticles: jest.fn(), getArticleSheet: jest.fn() } as unknown as InventoryService;
    const payablesService = { getAgingReport: jest.fn() } as unknown as PayablesService;
    const purchaseOrderService = { list: jest.fn() } as unknown as PurchaseOrderService;
    const service = new AssistantToolsService(
      reportsSalesService,
      receivablesService,
      cashSessionsService,
      inventoryService,
      payablesService,
      purchaseOrderService,
    );
    return { service, reportsSalesService, receivablesService, cashSessionsService, inventoryService, payablesService, purchaseOrderService };
  }

  describe('ventasPorArticulo', () => {
    it('delegates to ReportsSalesService.getSalesByProduct with the parsed date range', async () => {
      const { service, reportsSalesService } = makeService();
      (reportsSalesService.getSalesByProduct as jest.Mock).mockResolvedValue([{ articleName: 'Widget' }]);

      const result = await service.ventasPorArticulo(makeUser({ roles: ['OWNER'] }), {
        desde: '2026-08-01',
        hasta: '2026-08-31',
      });

      expect(reportsSalesService.getSalesByProduct).toHaveBeenCalledWith(new Date('2026-08-01'), new Date('2026-08-31'), undefined);
      expect(result).toEqual([{ articleName: 'Widget' }]);
    });

    it('passes the "only my sales" scope down to the report', async () => {
      const { service, reportsSalesService } = makeService();
      (reportsSalesService.getSalesByProduct as jest.Mock).mockResolvedValue([]);

      await service.ventasPorArticulo(makeUser({ roles: ['OWNER'] }), {}, { onlyIssuedBy: 'user-9' });

      expect(reportsSalesService.getSalesByProduct).toHaveBeenCalledWith(undefined, undefined, 'user-9');
    });

    it('trims the result to `limite` when provided', async () => {
      const { service, reportsSalesService } = makeService();
      (reportsSalesService.getSalesByProduct as jest.Mock).mockResolvedValue([{ a: 1 }, { a: 2 }, { a: 3 }]);

      const result = await service.ventasPorArticulo(makeUser({ roles: ['OWNER'] }), { limite: 2 });

      expect(result).toEqual([{ a: 1 }, { a: 2 }]);
    });

    it('rejects a role without read access to reports-sales', async () => {
      const { service } = makeService();
      const user = makeUser({ roles: ['PURCHASES'], moduleAccess: [] });

      await expect(service.ventasPorArticulo(user, {})).rejects.toThrow(/reports-sales/);
    });

    it('allows a non-admin role that has explicit moduleAccess read grant', async () => {
      const { service, reportsSalesService } = makeService();
      (reportsSalesService.getSalesByProduct as jest.Mock).mockResolvedValue([]);
      const user = makeUser({
        roles: ['PURCHASES'],
        moduleAccess: [{ module: 'reports-sales', canRead: true, canWrite: false }],
      });

      await expect(service.ventasPorArticulo(user, {})).resolves.toEqual([]);
    });
  });

  describe('deudaPorCliente', () => {
    it('delegates to ReceivablesService.getAgingReport for an allowed role', async () => {
      const { service, receivablesService } = makeService();
      (receivablesService.getAgingReport as jest.Mock).mockResolvedValue([{ customerName: 'Cliente Demo' }]);

      const result = await service.deudaPorCliente(makeUser({ roles: ['SALES'] }));

      expect(receivablesService.getAgingReport).toHaveBeenCalledWith(expect.any(Date), undefined);
      expect(result).toEqual([{ customerName: 'Cliente Demo' }]);
    });

    it('limits the aging report to the invoices this person issued when scoped', async () => {
      const { service, receivablesService } = makeService();
      (receivablesService.getAgingReport as jest.Mock).mockResolvedValue([]);

      await service.deudaPorCliente(makeUser({ roles: ['SALES'] }), { onlyIssuedBy: 'user-1' });

      expect(receivablesService.getAgingReport).toHaveBeenCalledWith(expect.any(Date), 'user-1');
    });

    it('rejects a role without access to Cuentas a Cobrar', async () => {
      const { service } = makeService();

      await expect(service.deudaPorCliente(makeUser({ roles: ['INVENTORY'] }))).rejects.toThrow(/deuda_por_cliente/);
    });
  });

  describe('saldoCaja', () => {
    it('delegates to CashSessionsService.getDailyPosition for an allowed role', async () => {
      const { service, cashSessionsService } = makeService();
      (cashSessionsService.getDailyPosition as jest.Mock).mockResolvedValue({ openSessionsCount: 1 });

      const result = await service.saldoCaja(makeUser({ roles: ['SALES'] }));

      expect(cashSessionsService.getDailyPosition).toHaveBeenCalled();
      expect(result).toEqual({ openSessionsCount: 1 });
    });

    it('rejects a role without access to POS', async () => {
      const { service } = makeService();

      await expect(service.saldoCaja(makeUser({ roles: ['ACCOUNTANT'] }))).rejects.toThrow(/saldo_caja/);
    });
  });

  describe('stockArticulo', () => {
    it('delegates to InventoryService.listArticles with the search term and flattens variant stock', async () => {
      const { service, inventoryService } = makeService();
      (inventoryService.listArticles as jest.Mock).mockResolvedValue([
        {
          name: 'Parlante Bluetooth',
          variants: [
            { sku: 'PARL-NEG', color: 'Negro', size: null, unitPrice: 15000, totalStock: 5, minimumStock: 2 },
            { sku: 'PARL-ROJ', color: 'Rojo', size: null, unitPrice: 15000, totalStock: 0, minimumStock: 2 },
          ],
        },
      ]);

      const result = await service.stockArticulo(makeUser({ roles: ['VIEWER'] }), 'parlante');

      expect(inventoryService.listArticles).toHaveBeenCalledWith({ search: 'parlante' });
      expect(result).toEqual([
        {
          nombre: 'Parlante Bluetooth',
          variantes: [
            { sku: 'PARL-NEG', color: 'Negro', talle: null, precio: 15000, stockTotal: 5, stockMinimo: 2 },
            { sku: 'PARL-ROJ', color: 'Rojo', talle: null, precio: 15000, stockTotal: 0, stockMinimo: 2 },
          ],
        },
      ]);
    });

    it('does not restrict by role - mirrors GET /inventory/articles having no @Roles guard', async () => {
      const { service, inventoryService } = makeService();
      (inventoryService.listArticles as jest.Mock).mockResolvedValue([]);

      await expect(service.stockArticulo(makeUser({ roles: ['VIEWER'] }), 'x')).resolves.toEqual([]);
    });
  });

  describe('costoArticulo', () => {
    it('returns last cost, weighted average and markup over the last cost, per variant', async () => {
      const { service, inventoryService } = makeService();
      (inventoryService.listArticles as jest.Mock).mockResolvedValue([{ id: 'art-1', name: 'Cemento x 50 kg' }]);
      (inventoryService.getArticleSheet as jest.Mock).mockResolvedValue({
        variants: [
          { sku: 'CEM-50', label: 'CEM-50', unitPrice: 12000, avgUnitCost: 7800, lastCost: { amount: 8000, at: new Date('2026-10-01') } },
          { sku: 'CEM-25', label: 'CEM-25', unitPrice: 7000, avgUnitCost: null, lastCost: null },
        ],
      });

      const result = await service.costoArticulo(makeUser({ roles: ['VIEWER'] }), 'cemento');

      expect(result).toEqual([
        {
          nombre: 'Cemento x 50 kg',
          variantes: [
            {
              sku: 'CEM-50',
              variante: 'CEM-50',
              precioVenta: 12000,
              ultimoCosto: 8000,
              fechaUltimoCosto: new Date('2026-10-01'),
              costoPromedioPonderado: 7800,
              gananciaPorUnidad: 4000,
              remarcaSobreCostoPorcentaje: 50,
            },
            {
              sku: 'CEM-25',
              variante: 'CEM-25',
              precioVenta: 7000,
              ultimoCosto: null,
              fechaUltimoCosto: null,
              costoPromedioPonderado: null,
              gananciaPorUnidad: null,
              remarcaSobreCostoPorcentaje: null,
            },
          ],
        },
      ]);
    });

    it('looks up at most 5 articles', async () => {
      const { service, inventoryService } = makeService();
      (inventoryService.listArticles as jest.Mock).mockResolvedValue(
        Array.from({ length: 8 }, (_, i) => ({ id: 'art-' + i, name: 'Art ' + i })),
      );
      (inventoryService.getArticleSheet as jest.Mock).mockResolvedValue({ variants: [] });

      const result = await service.costoArticulo(makeUser(), 'a');

      expect(result).toHaveLength(5);
      expect(inventoryService.getArticleSheet).toHaveBeenCalledTimes(5);
    });
  });

  describe('comprasResumen', () => {
    it('rejects a role without access to Cuentas a Pagar', async () => {
      const { service } = makeService();

      await expect(service.comprasResumen(makeUser({ roles: ['SALES'] }))).rejects.toThrow(/compras_resumen/);
    });

    it('returns supplier debt and only the sent orders with something still pending to receive', async () => {
      const { service, payablesService, purchaseOrderService } = makeService();
      (payablesService.getAgingReport as jest.Mock).mockResolvedValue([
        { supplierName: 'Proveedor Demo', totalOutstanding: new Prisma.Decimal(5000) },
      ]);
      (purchaseOrderService.list as jest.Mock).mockResolvedValue([
        {
          number: 'OC-000001',
          supplier: { name: 'Proveedor Demo' },
          currency: { code: 'ARS' },
          total: new Prisma.Decimal(9000),
          lines: [
            { articleVariantId: 'v-1', pendingQuantity: new Prisma.Decimal(3) },
            { articleVariantId: 'v-2', pendingQuantity: new Prisma.Decimal(0) },
          ],
        },
        {
          number: 'OC-000002',
          supplier: { name: 'Otro' },
          currency: { code: 'ARS' },
          total: new Prisma.Decimal(100),
          lines: [{ articleVariantId: 'v-2', pendingQuantity: new Prisma.Decimal(0) }],
        },
      ]);
      const db = {
        articleVariant: { findMany: jest.fn().mockResolvedValue([{ id: 'v-1', sku: 'ARE-01', article: { name: 'Arena fina' } }]) },
      };

      const result = await tenantContextStorage.run({ tenantId: 'tenant-1', userId: 'user-1', tx: db as never }, () =>
        service.comprasResumen(makeUser({ roles: ['PURCHASES'] })),
      );

      expect(purchaseOrderService.list).toHaveBeenCalledWith('SENT');
      expect(db.articleVariant.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ['v-1'] } } }));
      expect(result.proveedoresConDeuda).toBe(1);
      expect(result.ordenesDeCompraPendientesDeRecibir).toEqual([
        {
          numero: 'OC-000001',
          proveedor: 'Proveedor Demo',
          moneda: 'ARS',
          total: new Prisma.Decimal(9000),
          lineasPendientes: [{ articulo: 'Arena fina', sku: 'ARE-01', cantidadPendiente: new Prisma.Decimal(3) }],
        },
      ]);
    });
  });
});
