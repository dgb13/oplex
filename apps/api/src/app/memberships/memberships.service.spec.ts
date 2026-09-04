import { tenantContextStorage, type PrismaService } from '@plexo/database';
import type { AuthService } from '../auth/auth.service.js';
import { MembershipsService } from './memberships.service.js';

function runInStudioTenant<T>(db: Record<string, unknown>, fn: () => T): T {
  return tenantContextStorage.run({ tenantId: 'studio-1', userId: 'studio-user-1', tx: db as never }, fn);
}

function makeMembershipRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'membership-1',
    tenant_id: 'client-1',
    client_tenant_name: 'Cliente Demo SA',
    direction: 'CLIENT_INVITED',
    status: 'ACCEPTED',
    invitee_identifier: null,
    created_at: new Date('2026-09-01'),
    responded_at: new Date('2026-09-02'),
    ...overrides,
  };
}

function makeAuthService() {
  return {
    buildAccessToken: jest.fn().mockResolvedValue('signed-jwt'),
  } as unknown as AuthService;
}

describe('MembershipsService.listMine', () => {
  it('maps list_studio_memberships() rows to camelCase, keyed by the caller own studio tenant', async () => {
    const queryRaw = jest.fn().mockResolvedValue([makeMembershipRow()]);
    const prisma = { $queryRaw: queryRaw } as unknown as PrismaService;
    const service = new MembershipsService(prisma, makeAuthService());

    const result = await service.listMine('studio-1');

    expect(result).toEqual([
      {
        id: 'membership-1',
        clientTenantId: 'client-1',
        clientTenantName: 'Cliente Demo SA',
        direction: 'CLIENT_INVITED',
        status: 'ACCEPTED',
        inviteeIdentifier: null,
        createdAt: new Date('2026-09-01'),
        respondedAt: new Date('2026-09-02'),
      },
    ]);
  });
});

describe('MembershipsService.activate', () => {
  function makePrisma(membershipRows: ReturnType<typeof makeMembershipRow>[], fakeTxOverrides: Record<string, unknown> = {}) {
    const fakeTx = {
      tenantMembershipLink: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: 'link-1', ...data })),
      },
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      userModuleAccess: { findMany: jest.fn().mockResolvedValue([]) },
      $executeRaw: jest.fn().mockResolvedValue(undefined),
      ...fakeTxOverrides,
    };
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue(membershipRows),
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(fakeTx)),
      platformSettings: {
        findUnique: jest.fn().mockResolvedValue({ id: 'global', membershipSessionDurationHours: 2 }),
        create: jest.fn(),
      },
    } as unknown as PrismaService;
    return { prisma, fakeTx };
  }

  it('rechaza (NotFoundException) una membership que no pertenece al tenant del que llama - nunca confía en el id del actor', async () => {
    // list_studio_memberships('studio-1') no devuelve nada -> la membership
    // existe, pero le pertenece a OTRO estudio (mismo caso que un IDOR real).
    const { prisma } = makePrisma([]);
    const authService = makeAuthService();
    const service = new MembershipsService(prisma, authService);
    const db = { user: { findUnique: jest.fn().mockResolvedValue({ id: 'studio-user-1', email: 'juan@estudio.com', name: 'Juan' }) } };

    await expect(
      runInStudioTenant(db, () => service.activate('membership-1', 'studio-user-1', 'studio-1')),
    ).rejects.toThrow('Membership not found');
    expect(authService.buildAccessToken).not.toHaveBeenCalled();
  });

  it('rechaza (ForbiddenException) una membership todavía PENDING', async () => {
    const { prisma } = makePrisma([makeMembershipRow({ status: 'PENDING' })]);
    const authService = makeAuthService();
    const service = new MembershipsService(prisma, authService);
    const db = { user: { findUnique: jest.fn().mockResolvedValue({ id: 'studio-user-1', email: 'juan@estudio.com', name: 'Juan' }) } };

    await expect(
      runInStudioTenant(db, () => service.activate('membership-1', 'studio-user-1', 'studio-1')),
    ).rejects.toThrow('todavía no fue aceptada');
    expect(authService.buildAccessToken).not.toHaveBeenCalled();
  });

  it('crea la fila espejo (User + TenantMembershipLink) la primera vez, con la identidad del contador puntual', async () => {
    const { prisma, fakeTx } = makePrisma([makeMembershipRow()]);
    (fakeTx.user.create as jest.Mock).mockResolvedValue({
      id: 'linked-user-1',
      email: 'juan@estudio.com',
      name: 'Juan',
      role: 'ACCOUNTANT',
    });
    const authService = makeAuthService();
    const service = new MembershipsService(prisma, authService);
    const db = { user: { findUnique: jest.fn().mockResolvedValue({ id: 'studio-user-1', email: 'juan@estudio.com', name: 'Juan' }) } };

    const result = await runInStudioTenant(db, () => service.activate('membership-1', 'studio-user-1', 'studio-1'));

    expect(fakeTx.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'client-1',
        email: 'juan@estudio.com',
        name: 'Juan',
        role: 'ACCOUNTANT',
        isExternalAccountant: true,
      }),
    });
    expect(fakeTx.tenantMembershipLink.create).toHaveBeenCalledWith({
      data: { tenantId: 'client-1', membershipId: 'membership-1', studioUserId: 'studio-user-1', linkedUserId: 'linked-user-1' },
    });
    expect(authService.buildAccessToken).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'linked-user-1' }),
      'client-1',
      [],
      { expiresIn: '2h' },
    );
    expect(result.accessToken).toBe('signed-jwt');
  });

  it('reusa la fila espejo ya existente en la segunda activación (no duplica el usuario)', async () => {
    const { prisma, fakeTx } = makePrisma([makeMembershipRow()]);
    (fakeTx.tenantMembershipLink.findUnique as jest.Mock).mockResolvedValue({
      id: 'link-1',
      linkedUserId: 'linked-user-1',
    });
    (fakeTx.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'linked-user-1',
      email: 'juan@estudio.com',
      status: 'ACTIVE',
    });
    const authService = makeAuthService();
    const service = new MembershipsService(prisma, authService);
    const db = { user: { findUnique: jest.fn().mockResolvedValue({ id: 'studio-user-1', email: 'juan@estudio.com', name: 'Juan' }) } };

    await runInStudioTenant(db, () => service.activate('membership-1', 'studio-user-1', 'studio-1'));

    expect(fakeTx.user.create).not.toHaveBeenCalled();
    expect(fakeTx.tenantMembershipLink.create).not.toHaveBeenCalled();
  });

  it('dos contadores distintos del mismo estudio activando el mismo cliente terminan con linkedUserId DISTINTOS - identidad de auditoría por persona, no por estudio', async () => {
    const { prisma, fakeTx } = makePrisma([makeMembershipRow()]);
    let created = 0;
    (fakeTx.user.create as jest.Mock).mockImplementation(({ data }: { data: Record<string, unknown> }) => {
      created += 1;
      return Promise.resolve({ id: `linked-user-${created}`, ...data });
    });
    const authService = makeAuthService();
    const service = new MembershipsService(prisma, authService);

    const dbJuan = { user: { findUnique: jest.fn().mockResolvedValue({ id: 'studio-user-1', email: 'juan@estudio.com', name: 'Juan' }) } };
    const dbAna = { user: { findUnique: jest.fn().mockResolvedValue({ id: 'studio-user-2', email: 'ana@estudio.com', name: 'Ana' }) } };

    await runInStudioTenant(dbJuan, () => service.activate('membership-1', 'studio-user-1', 'studio-1'));
    await runInStudioTenant(dbAna, () => service.activate('membership-1', 'studio-user-2', 'studio-1'));

    expect(fakeTx.user.create).toHaveBeenCalledTimes(2);
    const [firstCallArgs, secondCallArgs] = (fakeTx.user.create as jest.Mock).mock.calls;
    expect(firstCallArgs[0].data.email).toBe('juan@estudio.com');
    expect(secondCallArgs[0].data.email).toBe('ana@estudio.com');
    expect(fakeTx.tenantMembershipLink.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ studioUserId: 'studio-user-1', linkedUserId: 'linked-user-1' }) }),
    );
    expect(fakeTx.tenantMembershipLink.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ studioUserId: 'studio-user-2', linkedUserId: 'linked-user-2' }) }),
    );
  });
});
