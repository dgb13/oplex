import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { tenantContextStorage } from '@plexo/database';
import { TaxesService } from './taxes.service.js';

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

describe('TaxesService.createTaxDefinition', () => {
  it('rejects creating a code that already has an active definition', async () => {
    const db = {
      taxDefinition: { findFirst: jest.fn().mockResolvedValue({ id: 'existing' }) },
    };
    const service = new TaxesService();

    await expect(
      runInTenant(db, () =>
        service.createTaxDefinition({ code: 'IVA_21', name: 'IVA 21%', rate: 21 }),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('defaults calculationType to PERCENTAGE', async () => {
    const db = {
      taxDefinition: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'new' }),
      },
    };
    const service = new TaxesService();

    await runInTenant(db, () =>
      service.createTaxDefinition({ code: 'IVA_21', name: 'IVA 21%', rate: 21 }),
    );

    expect((db.taxDefinition.create as jest.Mock).mock.calls[0][0].data.calculationType).toBe(
      'PERCENTAGE',
    );
  });
});

describe('TaxesService.reviseTaxDefinition', () => {
  it('throws when there is no active definition for the code', async () => {
    const db = { taxDefinition: { findFirst: jest.fn().mockResolvedValue(null) } };
    const service = new TaxesService();

    await expect(
      runInTenant(db, () => service.reviseTaxDefinition({ code: 'IVA_21', rate: 22 })),
    ).rejects.toThrow(NotFoundException);
  });

  it('blocks an ACCOUNTANT from revising a definition not delegated to them', async () => {
    const db = {
      taxDefinition: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'current', code: 'IVA_21', managedByAccountant: false }),
      },
    };
    const service = new TaxesService();

    await expect(
      runInTenant(
        db,
        () => service.reviseTaxDefinition({ code: 'IVA_21', rate: 22 }),
        { roles: ['ACCOUNTANT'] },
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('allows an ACCOUNTANT to revise a definition explicitly delegated to them', async () => {
    const current = {
      id: 'current',
      code: 'IIBB_CABA',
      name: 'IIBB CABA',
      calculationType: 'PERCENTAGE',
      rate: 3,
      fixedAmount: null,
      formula: null,
      managedByAccountant: true,
    };
    const db = {
      taxDefinition: {
        findFirst: jest.fn().mockResolvedValue(current),
        update: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue({ id: 'new' }),
      },
    };
    const service = new TaxesService();

    await runInTenant(
      db,
      () => service.reviseTaxDefinition({ code: 'IIBB_CABA', rate: 3.5 }),
      { roles: ['ACCOUNTANT'] },
    );

    expect(db.taxDefinition.create).toHaveBeenCalled();
  });

  it('always allows OWNER regardless of managedByAccountant', async () => {
    const current = {
      id: 'current',
      code: 'IVA_21',
      name: 'IVA 21%',
      calculationType: 'PERCENTAGE',
      rate: 21,
      fixedAmount: null,
      formula: null,
      managedByAccountant: false,
    };
    const db = {
      taxDefinition: {
        findFirst: jest.fn().mockResolvedValue(current),
        update: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue({ id: 'new' }),
      },
    };
    const service = new TaxesService();

    await runInTenant(db, () => service.reviseTaxDefinition({ code: 'IVA_21', rate: 22 }), {
      roles: ['OWNER'],
    });

    expect(db.taxDefinition.create).toHaveBeenCalled();
  });

  it('closes the old row at effectiveFrom and creates a new one with the revised rate', async () => {
    const current = {
      id: 'current',
      code: 'IVA_21',
      name: 'IVA 21%',
      calculationType: 'PERCENTAGE',
      rate: 21,
      fixedAmount: null,
      formula: null,
      managedByAccountant: false,
    };
    const db = {
      taxDefinition: {
        findFirst: jest.fn().mockResolvedValue(current),
        update: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue({ id: 'new' }),
      },
    };
    const service = new TaxesService();
    const effectiveFrom = '2026-08-01T00:00:00.000Z';

    await runInTenant(db, () =>
      service.reviseTaxDefinition({ code: 'IVA_21', rate: 22, effectiveFrom }),
    );

    expect(db.taxDefinition.update).toHaveBeenCalledWith({
      where: { id: 'current' },
      data: { validTo: new Date(effectiveFrom) },
    });
    expect(db.taxDefinition.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        code: 'IVA_21',
        rate: 22,
        validFrom: new Date(effectiveFrom),
      }),
    });
  });

  it('keeps the current rate when only fixedAmount would change (and vice versa)', async () => {
    const current = {
      id: 'current',
      code: 'IVA_21',
      name: 'IVA 21%',
      calculationType: 'PERCENTAGE',
      rate: 21,
      fixedAmount: null,
      formula: null,
      managedByAccountant: false,
    };
    const db = {
      taxDefinition: {
        findFirst: jest.fn().mockResolvedValue(current),
        update: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue({ id: 'new' }),
      },
    };
    const service = new TaxesService();

    await runInTenant(db, () => service.reviseTaxDefinition({ code: 'IVA_21' }));

    expect((db.taxDefinition.create as jest.Mock).mock.calls[0][0].data.rate).toBe(21);
  });
});
