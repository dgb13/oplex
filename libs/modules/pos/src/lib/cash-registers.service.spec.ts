import { BadRequestException } from '@nestjs/common';
import { tenantContextStorage } from '@plexo/database';
import { CashRegistersService } from './cash-registers.service.js';

function runInTenant<T>(db: Record<string, unknown>, fn: () => T): T {
  return tenantContextStorage.run({ tenantId: 'tenant-1', userId: 'user-1', tx: db as never }, fn);
}

describe('CashRegistersService.update', () => {
  it('rejects deactivating a register that has an OPEN session, without touching cashRegister.update', async () => {
    const update = jest.fn();
    const db = {
      cashRegister: {
        findUnique: jest.fn().mockResolvedValue({ id: 'register-1', name: 'Caja 1', active: true }),
        update,
      },
      cashSession: {
        findFirst: jest.fn().mockResolvedValue({ id: 'session-1', status: 'OPEN' }),
      },
    };
    const service = new CashRegistersService();

    await expect(
      runInTenant(db, () => service.update('register-1', { active: false })),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.cashSession.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { registerId: 'register-1', status: 'OPEN' } }),
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('deactivates a register with no OPEN session', async () => {
    const update = jest.fn().mockResolvedValue({ id: 'register-1', name: 'Caja 1', active: false });
    const db = {
      cashRegister: {
        findUnique: jest.fn().mockResolvedValue({ id: 'register-1', name: 'Caja 1', active: true }),
        update,
      },
      cashSession: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const service = new CashRegistersService();

    await runInTenant(db, () => service.update('register-1', { active: false }));

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'register-1' }, data: { active: false } }),
    );
  });

  it('renames without checking for an OPEN session (only deactivating does)', async () => {
    const update = jest.fn().mockResolvedValue({ id: 'register-1', name: 'Caja Mostrador', active: true });
    const db = {
      cashRegister: {
        findUnique: jest.fn().mockResolvedValue({ id: 'register-1', name: 'Caja 1', active: true }),
        update,
      },
      cashSession: {
        findFirst: jest.fn(),
      },
    };
    const service = new CashRegistersService();

    await runInTenant(db, () => service.update('register-1', { name: 'Caja Mostrador' }));

    expect(db.cashSession.findFirst).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'register-1' }, data: { name: 'Caja Mostrador' } }),
    );
  });
});
