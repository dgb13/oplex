import type { InventoryService } from '@plexo/inventory';
import type { CashSessionsService } from '@plexo/pos';
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

import { AssistantToolsService } from './assistant-tools.service.js';

function makeUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    sub: 'user-1',
    tenantId: 'tenant-1',
    email: 'a@b.com',
    role: 'VIEWER',
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
    const inventoryService = { listArticles: jest.fn() } as unknown as InventoryService;
    const service = new AssistantToolsService(reportsSalesService, receivablesService, cashSessionsService, inventoryService);
    return { service, reportsSalesService, receivablesService, cashSessionsService, inventoryService };
  }

  describe('ventasPorArticulo', () => {
    it('delegates to ReportsSalesService.getSalesByProduct with the parsed date range', async () => {
      const { service, reportsSalesService } = makeService();
      (reportsSalesService.getSalesByProduct as jest.Mock).mockResolvedValue([{ articleName: 'Widget' }]);

      const result = await service.ventasPorArticulo(makeUser({ role: 'OWNER' }), {
        desde: '2026-08-01',
        hasta: '2026-08-31',
      });

      expect(reportsSalesService.getSalesByProduct).toHaveBeenCalledWith(new Date('2026-08-01'), new Date('2026-08-31'));
      expect(result).toEqual([{ articleName: 'Widget' }]);
    });

    it('trims the result to `limite` when provided', async () => {
      const { service, reportsSalesService } = makeService();
      (reportsSalesService.getSalesByProduct as jest.Mock).mockResolvedValue([{ a: 1 }, { a: 2 }, { a: 3 }]);

      const result = await service.ventasPorArticulo(makeUser({ role: 'OWNER' }), { limite: 2 });

      expect(result).toEqual([{ a: 1 }, { a: 2 }]);
    });

    it('rejects a role without read access to reports-sales', async () => {
      const { service } = makeService();
      const user = makeUser({ role: 'PURCHASES', moduleAccess: [] });

      await expect(service.ventasPorArticulo(user, {})).rejects.toThrow(/reports-sales/);
    });

    it('allows a non-admin role that has explicit moduleAccess read grant', async () => {
      const { service, reportsSalesService } = makeService();
      (reportsSalesService.getSalesByProduct as jest.Mock).mockResolvedValue([]);
      const user = makeUser({
        role: 'PURCHASES',
        moduleAccess: [{ module: 'reports-sales', canRead: true, canWrite: false }],
      });

      await expect(service.ventasPorArticulo(user, {})).resolves.toEqual([]);
    });
  });

  describe('deudaPorCliente', () => {
    it('delegates to ReceivablesService.getAgingReport for an allowed role', async () => {
      const { service, receivablesService } = makeService();
      (receivablesService.getAgingReport as jest.Mock).mockResolvedValue([{ customerName: 'Cliente Demo' }]);

      const result = await service.deudaPorCliente(makeUser({ role: 'SALES' }));

      expect(receivablesService.getAgingReport).toHaveBeenCalled();
      expect(result).toEqual([{ customerName: 'Cliente Demo' }]);
    });

    it('rejects a role without access to Cuentas a Cobrar', async () => {
      const { service } = makeService();

      await expect(service.deudaPorCliente(makeUser({ role: 'INVENTORY' }))).rejects.toThrow(/deuda_por_cliente/);
    });
  });

  describe('saldoCaja', () => {
    it('delegates to CashSessionsService.getDailyPosition for an allowed role', async () => {
      const { service, cashSessionsService } = makeService();
      (cashSessionsService.getDailyPosition as jest.Mock).mockResolvedValue({ openSessionsCount: 1 });

      const result = await service.saldoCaja(makeUser({ role: 'SALES' }));

      expect(cashSessionsService.getDailyPosition).toHaveBeenCalled();
      expect(result).toEqual({ openSessionsCount: 1 });
    });

    it('rejects a role without access to POS', async () => {
      const { service } = makeService();

      await expect(service.saldoCaja(makeUser({ role: 'ACCOUNTANT' }))).rejects.toThrow(/saldo_caja/);
    });
  });

  describe('stockArticulo', () => {
    it('delegates to InventoryService.listArticles with the search term and flattens variant stock', async () => {
      const { service, inventoryService } = makeService();
      (inventoryService.listArticles as jest.Mock).mockResolvedValue([
        {
          name: 'Parlante Bluetooth',
          variants: [
            { sku: 'PARL-NEG', color: 'Negro', size: null, totalStock: 5, minimumStock: 2 },
            { sku: 'PARL-ROJ', color: 'Rojo', size: null, totalStock: 0, minimumStock: 2 },
          ],
        },
      ]);

      const result = await service.stockArticulo(makeUser({ role: 'VIEWER' }), 'parlante');

      expect(inventoryService.listArticles).toHaveBeenCalledWith({ search: 'parlante' });
      expect(result).toEqual([
        {
          nombre: 'Parlante Bluetooth',
          variantes: [
            { sku: 'PARL-NEG', color: 'Negro', talle: null, stockTotal: 5, stockMinimo: 2 },
            { sku: 'PARL-ROJ', color: 'Rojo', talle: null, stockTotal: 0, stockMinimo: 2 },
          ],
        },
      ]);
    });

    it('does not restrict by role - mirrors GET /inventory/articles having no @Roles guard', async () => {
      const { service, inventoryService } = makeService();
      (inventoryService.listArticles as jest.Mock).mockResolvedValue([]);

      await expect(service.stockArticulo(makeUser({ role: 'VIEWER' }), 'x')).resolves.toEqual([]);
    });
  });
});
