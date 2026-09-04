import type { AuthEmailSender } from '@plexo/auth-email';
import { tenantContextStorage, type PrismaService } from '@plexo/database';
import type { SubscriptionService } from '@plexo/subscriptions';
import type { AuthenticatedUser } from '@plexo/types';
import { UsersService } from './users.service.js';

function runInTenant<T>(db: Record<string, unknown>, fn: () => T): T {
  return tenantContextStorage.run({ tenantId: 'tenant-1', userId: 'user-1', tx: db as never }, fn);
}

function makeSubscriptionService(overrides: Partial<SubscriptionService> = {}) {
  return {
    assertCanAddUser: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as SubscriptionService;
}

function makeAuthEmailSender(overrides: Partial<AuthEmailSender> = {}) {
  return {
    sendVerificationCode: jest.fn().mockResolvedValue(undefined),
    sendPasswordResetLink: jest.fn().mockResolvedValue(undefined),
    sendInvitation: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as AuthEmailSender;
}

const actor: AuthenticatedUser = {
  sub: 'user-1',
  tenantId: 'tenant-1',
  email: 'owner@acme.com',
  role: 'OWNER',
  moduleAccess: [],
  mustChangePassword: false,
};

describe('UsersService.inviteUser', () => {
  it('checks the quota before creating the user, and returns a temp password not the hash', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'user-2', email: 'nuevo@acme.com' });
    const db = { user: { create } };
    const subscriptionService = makeSubscriptionService();
    const service = new UsersService({} as PrismaService, subscriptionService, makeAuthEmailSender());

    const result = await runInTenant(db, () =>
      service.inviteUser({ email: 'nuevo@acme.com', role: 'SALES' }),
    );

    expect(subscriptionService.assertCanAddUser).toHaveBeenCalled();
    const args = create.mock.calls[0][0].data;
    expect(args.tenantId).toBe('tenant-1');
    expect(args.email).toBe('nuevo@acme.com');
    expect(args.role).toBe('SALES');
    expect(args.mustChangePassword).toBe(true);
    expect(args.passwordHash).not.toBe(result.tempPassword);
    expect(result).toEqual({ id: 'user-2', email: 'nuevo@acme.com', tempPassword: expect.any(String) });
  });

  it('propagates the quota rejection without creating the user', async () => {
    const create = jest.fn();
    const db = { user: { create } };
    const failure = new Error('Alcanzaste el límite de usuarios de tu plan actual (Basic Gratis: 1)');
    const subscriptionService = makeSubscriptionService({ assertCanAddUser: jest.fn().mockRejectedValue(failure) });
    const service = new UsersService({} as PrismaService, subscriptionService, makeAuthEmailSender());

    await expect(
      runInTenant(db, () => service.inviteUser({ email: 'otro@acme.com', role: 'VIEWER' })),
    ).rejects.toThrow(failure);
    expect(create).not.toHaveBeenCalled();
  });
});

describe('UsersService.inviteMember', () => {
  it('rejects an email that already belongs to the tenant, without touching quota or tokens', async () => {
    const db = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'user-9' }) },
      teamInvitation: { updateMany: jest.fn(), create: jest.fn() },
    };
    const subscriptionService = makeSubscriptionService();
    const authEmailSender = makeAuthEmailSender();
    const service = new UsersService({} as PrismaService, subscriptionService, authEmailSender);

    await expect(
      runInTenant(db, () => service.inviteMember({ email: 'ya@acme.com', role: 'SALES' }, actor)),
    ).rejects.toThrow('Ese email ya pertenece a este equipo');
    expect(db.teamInvitation.create).not.toHaveBeenCalled();
    expect(authEmailSender.sendInvitation).not.toHaveBeenCalled();
  });

  it('invalidates any pending invitation for the same email, creates a new one, and emails it', async () => {
    const db = {
      user: { findUnique: jest.fn().mockResolvedValue(null) },
      teamInvitation: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue({ id: 'invite-1' }),
      },
      tenant: { findUnique: jest.fn().mockResolvedValue({ id: 'tenant-1', name: 'Acme' }) },
    };
    const authEmailSender = makeAuthEmailSender();
    const service = new UsersService({} as PrismaService, makeSubscriptionService(), authEmailSender);

    const result = await runInTenant(db, () =>
      service.inviteMember({ email: 'nuevo@acme.com', role: 'PURCHASES' }, actor),
    );

    expect(result).toEqual({ ok: true });
    expect(db.teamInvitation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ email: 'nuevo@acme.com', usedAt: null }) }),
    );
    const createArgs = db.teamInvitation.create.mock.calls[0][0].data;
    expect(createArgs.role).toBe('PURCHASES');
    expect(createArgs.invitedByUserId).toBe('user-1');
    expect(authEmailSender.sendInvitation).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'nuevo@acme.com', tenantName: 'Acme', role: 'PURCHASES' }),
    );
  });
});

describe('UsersService.changeRole', () => {
  it('blocks demoting the last active OWNER', async () => {
    const db = {
      user: {
        findFirst: jest.fn().mockResolvedValue({ id: 'user-2', role: 'OWNER' }),
        count: jest.fn().mockResolvedValue(0),
        update: jest.fn(),
      },
    };
    const service = new UsersService({} as PrismaService, makeSubscriptionService(), makeAuthEmailSender());

    await expect(
      runInTenant(db, () => service.changeRole('user-2', { role: 'ADMIN' })),
    ).rejects.toThrow('Tiene que quedar al menos un OWNER activo en el equipo');
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it('allows changing a non-owner role', async () => {
    const db = {
      user: {
        findFirst: jest.fn().mockResolvedValue({ id: 'user-2', role: 'VIEWER' }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const service = new UsersService({} as PrismaService, makeSubscriptionService(), makeAuthEmailSender());

    await runInTenant(db, () => service.changeRole('user-2', { role: 'PURCHASES' }));

    expect(db.user.update).toHaveBeenCalledWith({ where: { id: 'user-2' }, data: { role: 'PURCHASES' } });
  });

  it('blocks changing the role of an external accountant mirror row (managed from /accountants, not here)', async () => {
    const db = {
      user: {
        findFirst: jest.fn().mockResolvedValue({ id: 'user-2', role: 'ACCOUNTANT', isExternalAccountant: true }),
        update: jest.fn(),
      },
    };
    const service = new UsersService({} as PrismaService, makeSubscriptionService(), makeAuthEmailSender());

    await expect(
      runInTenant(db, () => service.changeRole('user-2', { role: 'VIEWER' })),
    ).rejects.toThrow('gestionado desde Contadores');
    expect(db.user.update).not.toHaveBeenCalled();
  });
});

describe('UsersService.acceptInvitation', () => {
  function makePrisma(fakeTx: Record<string, unknown>) {
    const tx = { ...fakeTx, $executeRaw: jest.fn().mockResolvedValue(undefined) };
    return {
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(tx)),
    } as unknown as PrismaService;
  }

  it('rejects a token that does not match any pending invitation', async () => {
    const fakeTx = { teamInvitation: { findFirst: jest.fn().mockResolvedValue(null) } };
    const service = new UsersService(makePrisma(fakeTx), makeSubscriptionService(), makeAuthEmailSender());

    await expect(
      service.acceptInvitation({ tenantId: 'tenant-1', token: 'bad-token', name: 'Nuevo', password: 'password123' }),
    ).rejects.toThrow('La invitación es inválida o expiró');
  });

  it('rejects an expired invitation', async () => {
    const fakeTx = {
      teamInvitation: {
        findFirst: jest.fn().mockResolvedValue({ id: 'invite-1', expiresAt: new Date('2020-01-01'), email: 'x@acme.com', role: 'SALES' }),
      },
    };
    const service = new UsersService(makePrisma(fakeTx), makeSubscriptionService(), makeAuthEmailSender());

    await expect(
      service.acceptInvitation({ tenantId: 'tenant-1', token: 'old-token', name: 'Nuevo', password: 'password123' }),
    ).rejects.toThrow('La invitación es inválida o expiró');
  });

  it('creates the user, marks the invitation used, and verifies the email on success', async () => {
    const fakeTx = {
      teamInvitation: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'invite-1',
          email: 'nuevo@acme.com',
          role: 'SALES',
          expiresAt: new Date('2099-01-01'),
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'user-9' }),
      },
    };
    const service = new UsersService(makePrisma(fakeTx), makeSubscriptionService(), makeAuthEmailSender());

    const result = await service.acceptInvitation({
      tenantId: 'tenant-1',
      token: 'good-token',
      name: 'Nuevo Miembro',
      password: 'password123',
    });

    expect(result).toEqual({ ok: true });
    const createArgs = fakeTx.user.create.mock.calls[0][0].data;
    expect(createArgs.email).toBe('nuevo@acme.com');
    expect(createArgs.role).toBe('SALES');
    expect(createArgs.emailVerifiedAt).toBeInstanceOf(Date);
    expect(fakeTx.teamInvitation.update).toHaveBeenCalledWith({
      where: { id: 'invite-1' },
      data: { usedAt: expect.any(Date) },
    });
  });

  it('rejects when the invited email already became a member of the tenant in the meantime', async () => {
    const fakeTx = {
      teamInvitation: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'invite-1',
          email: 'ya@acme.com',
          role: 'SALES',
          expiresAt: new Date('2099-01-01'),
        }),
      },
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'user-9' }) },
    };
    const service = new UsersService(makePrisma(fakeTx), makeSubscriptionService(), makeAuthEmailSender());

    await expect(
      service.acceptInvitation({ tenantId: 'tenant-1', token: 'good-token', name: 'Nuevo', password: 'password123' }),
    ).rejects.toThrow('Ese email ya pertenece a este equipo');
  });
});

describe('UsersService.toggleStatus', () => {
  it('blocks self-suspension', async () => {
    const service = new UsersService({} as PrismaService, makeSubscriptionService(), makeAuthEmailSender());

    await expect(
      runInTenant({}, () => service.toggleStatus('user-1', { status: 'SUSPENDED' }, actor)),
    ).rejects.toThrow('No podés suspender tu propia cuenta');
  });

  it('blocks suspending the last active OWNER', async () => {
    const db = {
      user: {
        findFirst: jest.fn().mockResolvedValue({ id: 'user-2', role: 'OWNER' }),
        count: jest.fn().mockResolvedValue(0),
        update: jest.fn(),
      },
    };
    const service = new UsersService({} as PrismaService, makeSubscriptionService(), makeAuthEmailSender());

    await expect(
      runInTenant(db, () => service.toggleStatus('user-2', { status: 'SUSPENDED' }, actor)),
    ).rejects.toThrow('Tiene que quedar al menos un OWNER activo en el equipo');
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it('allows suspending a non-owner', async () => {
    const db = {
      user: {
        findFirst: jest.fn().mockResolvedValue({ id: 'user-2', role: 'SALES' }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const service = new UsersService({} as PrismaService, makeSubscriptionService(), makeAuthEmailSender());

    await runInTenant(db, () => service.toggleStatus('user-2', { status: 'SUSPENDED' }, actor));

    expect(db.user.update).toHaveBeenCalledWith({ where: { id: 'user-2' }, data: { status: 'SUSPENDED' } });
  });

  it('blocks suspending/reactivating an external accountant mirror row', async () => {
    const db = {
      user: {
        findFirst: jest.fn().mockResolvedValue({ id: 'user-2', role: 'ACCOUNTANT', isExternalAccountant: true }),
        update: jest.fn(),
      },
    };
    const service = new UsersService({} as PrismaService, makeSubscriptionService(), makeAuthEmailSender());

    await expect(
      runInTenant(db, () => service.toggleStatus('user-2', { status: 'SUSPENDED' }, actor)),
    ).rejects.toThrow('gestionado desde Contadores');
    expect(db.user.update).not.toHaveBeenCalled();
  });
});
