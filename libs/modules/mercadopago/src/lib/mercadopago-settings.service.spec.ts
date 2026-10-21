import { tenantContextStorage } from '@plexo/database';
import { MercadoPagoSettingsService } from './mercadopago-settings.service.js';

function setup(opts: { chosenId?: string | null; accounts?: { id: string; name: string }[] } = {}) {
  const accounts = opts.accounts ?? [
    { id: 'mp-1', name: 'Mercado Pago' },
    { id: 'mp-2', name: 'Mercado Pago Sucursal Norte' },
  ];
  const db = {
    tenantSettings: {
      findUnique: jest.fn().mockResolvedValue({
        mercadoPagoLinksEnabled: true,
        mercadoPagoFinancialAccountId: opts.chosenId ?? null,
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    financialAccount: {
      findFirst: jest.fn().mockResolvedValue({ id: 'mp-1', name: 'Mercado Pago' }),
      findUnique: jest.fn().mockImplementation(({ where }) =>
        Promise.resolve(
          where.id === 'bank-1'
            ? { id: 'bank-1', provider: 'BANK', currencyId: null }
            : accounts.some((a) => a.id === where.id)
              ? { id: where.id, provider: 'MERCADOPAGO', currencyId: null }
              : null,
        ),
      ),
      findMany: jest.fn().mockResolvedValue(accounts),
      create: jest.fn(),
    },
  };
  const run = <T>(fn: () => Promise<T>) => tenantContextStorage.run({ tenantId: 'tenant-1', tx: db as never }, fn);
  return { db, run, service: new MercadoPagoSettingsService() };
}

describe('MercadoPagoSettingsService', () => {
  it('without a choice, the receipts account is the system "Mercado Pago" one', async () => {
    const { service, run } = setup();
    const view = await run(() => service.get());
    expect(view).toEqual({
      linksEnabled: true,
      financialAccountId: 'mp-1',
      financialAccounts: [
        { id: 'mp-1', name: 'Mercado Pago' },
        { id: 'mp-2', name: 'Mercado Pago Sucursal Norte' },
      ],
    });
  });

  it('uses the chosen account while it exists', async () => {
    const { service, run } = setup({ chosenId: 'mp-2' });
    expect((await run(() => service.get())).financialAccountId).toBe('mp-2');
  });

  it('saves the switch and the account', async () => {
    const { service, db, run } = setup();
    await run(() => service.update({ linksEnabled: false, financialAccountId: 'mp-2' }));
    expect(db.tenantSettings.updateMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1' },
      data: { mercadoPagoLinksEnabled: false, mercadoPagoFinancialAccountId: 'mp-2' },
    });
  });

  it('only accepts a Mercado Pago account in pesos', async () => {
    const { service, db, run } = setup();
    await expect(run(() => service.update({ financialAccountId: 'bank-1' }))).rejects.toThrow(
      'Elegí una cuenta de dinero de Mercado Pago en pesos',
    );
    expect(db.tenantSettings.updateMany).not.toHaveBeenCalled();
  });
});
