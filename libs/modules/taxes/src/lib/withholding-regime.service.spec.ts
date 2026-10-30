import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { tenantContextStorage } from '@plexo/database';
import { WithholdingRegimeService } from './withholding-regime.service.js';

function runInTenant<T>(
  db: Record<string, unknown>,
  fn: () => T,
  opts: { userId?: string; roles?: string[] } = {},
): T {
  return tenantContextStorage.run(
    { tenantId: 'tenant-1', userId: opts.userId ?? 'user-1', roles: opts.roles as never, tx: db as never },
    fn,
  );
}

describe('WithholdingRegimeService.createRegime', () => {
  it('rejects creating a code that already has an active regime', async () => {
    const db = {
      withholdingRegime: { findFirst: jest.fn().mockResolvedValue({ id: 'existing' }) },
    };
    const service = new WithholdingRegimeService();

    await expect(
      runInTenant(db, () =>
        service.createRegime({ code: 'GAN_RG830', name: 'Ganancias RG 830', taxType: 'INCOME_TAX', rate: 2 }),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('defaults minTaxableAmount to 0 and managedByAccountant to false', async () => {
    const db = {
      withholdingRegime: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'new' }),
      },
    };
    const service = new WithholdingRegimeService();

    await runInTenant(db, () =>
      service.createRegime({ code: 'IIBB_CABA', name: 'IIBB CABA', taxType: 'GROSS_INCOME', jurisdiction: 'CABA', rate: 3 }),
    );

    const data = (db.withholdingRegime.create as jest.Mock).mock.calls[0][0].data;
    expect(data.minTaxableAmount).toBe(0);
    expect(data.managedByAccountant).toBe(false);
    expect(data.jurisdiction).toBe('CABA');
  });
});

describe('WithholdingRegimeService.reviseRegime', () => {
  it('throws when there is no active regime for the code', async () => {
    const db = { withholdingRegime: { findFirst: jest.fn().mockResolvedValue(null) } };
    const service = new WithholdingRegimeService();

    await expect(
      runInTenant(db, () => service.reviseRegime({ code: 'IIBB_CABA', rate: 3.5 })),
    ).rejects.toThrow(NotFoundException);
  });

  it('blocks an ACCOUNTANT from revising a regime not delegated to them', async () => {
    const db = {
      withholdingRegime: {
        findFirst: jest.fn().mockResolvedValue({ id: 'current', code: 'IIBB_CABA', managedByAccountant: false }),
      },
    };
    const service = new WithholdingRegimeService();

    await expect(
      runInTenant(db, () => service.reviseRegime({ code: 'IIBB_CABA', rate: 3.5 }), { roles: ['ACCOUNTANT'] }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('closes the old row at effectiveFrom and creates a new one with the revised rate/jurisdiction', async () => {
    const current = {
      id: 'current',
      code: 'IIBB_CABA',
      name: 'IIBB CABA',
      taxType: 'GROSS_INCOME',
      jurisdiction: 'CABA',
      rate: 3,
      minTaxableAmount: 0,
      managedByAccountant: false,
    };
    const db = {
      withholdingRegime: {
        findFirst: jest.fn().mockResolvedValue(current),
        update: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue({ id: 'new' }),
      },
    };
    const service = new WithholdingRegimeService();
    const effectiveFrom = '2026-08-01T00:00:00.000Z';

    await runInTenant(db, () =>
      service.reviseRegime({ code: 'IIBB_CABA', rate: 3.5, effectiveFrom }),
    );

    expect(db.withholdingRegime.update).toHaveBeenCalledWith({
      where: { id: 'current' },
      data: { validTo: new Date(effectiveFrom) },
    });
    expect(db.withholdingRegime.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ code: 'IIBB_CABA', rate: 3.5, validFrom: new Date(effectiveFrom) }),
    });
  });

  it('keeps the current rate/minTaxableAmount when only one of them changes', async () => {
    const current = {
      id: 'current',
      code: 'GAN_RG830',
      name: 'Ganancias RG 830',
      taxType: 'INCOME_TAX',
      jurisdiction: null,
      rate: 2,
      minTaxableAmount: 5000,
      managedByAccountant: false,
    };
    const db = {
      withholdingRegime: {
        findFirst: jest.fn().mockResolvedValue(current),
        update: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue({ id: 'new' }),
      },
    };
    const service = new WithholdingRegimeService();

    await runInTenant(db, () => service.reviseRegime({ code: 'GAN_RG830', rate: 2.5 }));

    const data = (db.withholdingRegime.create as jest.Mock).mock.calls[0][0].data;
    expect(data.rate).toBe(2.5);
    expect(data.minTaxableAmount).toBe(5000);
  });
});
