import type { AfipCredentialsService } from '@plexo/afip-credentials';
import { tenantContextStorage } from '@plexo/database';
import { AfipWsfeClient } from './afip-wsfe-client.js';
import { ArcaConnectionService } from './arca-connection.service.js';

function runInTenant<T>(db: Record<string, unknown>, fn: () => T): T {
  return tenantContextStorage.run({ tenantId: 'tenant-1', userId: 'user-1', tx: db as never }, fn);
}

describe('ArcaConnectionService.check', () => {
  const credentials = { certPem: 'c', keyPem: 'k', env: 'produccion', cuitRepresentada: '20270403949' };
  const afipCredentials = { getCurrent: jest.fn().mockResolvedValue(credentials) } as unknown as AfipCredentialsService;
  let lastAuthorized: jest.SpyInstance;

  beforeEach(() => {
    lastAuthorized = jest.spyOn(AfipWsfeClient.prototype, 'lastAuthorizedNumber');
  });

  afterEach(() => lastAuthorized.mockRestore());

  function dbWith(branches: { name: string; pointOfSaleNumber: string }[]) {
    return {
      tenantSettings: {
        findUnique: jest.fn().mockResolvedValue({ ownTaxCondition: 'MONOTRIBUTO' }),
        upsert: jest.fn().mockResolvedValue({}),
      },
      company: { findMany: jest.fn().mockResolvedValue(branches) },
      arcaUnregisteredVoucher: { count: jest.fn().mockResolvedValue(0) },
    };
  }

  it('checks every active branch point of sale (not the oldest branch, not a default 1)', async () => {
    lastAuthorized.mockResolvedValueOnce(0).mockResolvedValueOnce(12);
    const db = dbWith([
      { name: 'Local Centro', pointOfSaleNumber: '00008' },
      { name: 'Depósito', pointOfSaleNumber: '00009' },
    ]);

    const result = await runInTenant(db, () => new ArcaConnectionService(afipCredentials).check());

    expect(db.company.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ active: true }) }));
    expect(lastAuthorized.mock.calls).toEqual([
      [8, 11],
      [9, 11],
    ]);
    expect(result.ok).toBe(true);
    expect(result.message).toContain('punto de venta 00008 (Local Centro): Factura C 00000000');
    expect(result.message).toContain('punto de venta 00009 (Depósito): Factura C 00000012');
  });

  it('names the branch whose point of sale is not enabled for Web Services (ARCA 11002)', async () => {
    lastAuthorized.mockRejectedValueOnce(
      new Error('ARCA WSFE: [11002] El punto de venta no se encuentra habilitado a usar en el presente WS.'),
    );
    const db = dbWith([{ name: 'Casa Central', pointOfSaleNumber: '0001' }]);

    const result = await runInTenant(db, () => new ArcaConnectionService(afipCredentials).check());

    expect(result.ok).toBe(false);
    expect(result.pointOfSale).toBe(1);
    expect(result.message).toContain('El punto de venta 00001 de la sucursal "Casa Central" no está habilitado para Web Services');
  });

  it('asks for a branch instead of guessing point of sale 1 when there is none', async () => {
    const db = dbWith([]);

    const result = await runInTenant(db, () => new ArcaConnectionService(afipCredentials).check());

    expect(lastAuthorized).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/Falta una sucursal con punto de venta/);
  });
});
