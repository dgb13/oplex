import { tenantContextStorage, type PrismaService } from '@plexo/database';
import type { AuthService } from '../auth/auth.service.js';
import { MembershipsService } from './memberships.service.js';

function runInStudioTenant<T>(db: Record<string, unknown>, fn: () => T): T {
  return tenantContextStorage.run({ tenantId: 'studio-1', userId: 'studio-user-1', tx: db as never }, fn);
}

function runInClientTenant<T>(db: Record<string, unknown>, fn: () => T): T {
  return tenantContextStorage.run({ tenantId: 'client-1', userId: 'client-user-1', tx: db as never }, fn);
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
      userModuleAccess: {
        createMany: jest.fn().mockResolvedValue({ count: 5 }),
        findMany: jest.fn().mockResolvedValue([]),
      },
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

  it('crea la fila espejo (User + TenantMembershipLink) la primera vez, con la identidad del contador puntual, y le otorga el alcance por defecto (solo lectura salvo taxes)', async () => {
    const defaultGrants = [
      { userId: 'linked-user-1', module: 'taxes', canRead: true, canWrite: true },
      { userId: 'linked-user-1', module: 'accounting', canRead: true, canWrite: false },
      { userId: 'linked-user-1', module: 'reports-sales', canRead: true, canWrite: false },
      { userId: 'linked-user-1', module: 'reports-pnl', canRead: true, canWrite: false },
      { userId: 'linked-user-1', module: 'reports-financial', canRead: true, canWrite: false },
    ];
    const { prisma, fakeTx } = makePrisma([makeMembershipRow()], {
      userModuleAccess: {
        createMany: jest.fn().mockResolvedValue({ count: 5 }),
        findMany: jest.fn().mockResolvedValue(defaultGrants),
      },
    });
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
    expect(fakeTx.userModuleAccess.createMany).toHaveBeenCalledWith({
      data: [
        { tenantId: 'client-1', userId: 'linked-user-1', module: 'taxes', canRead: true, canWrite: true },
        { tenantId: 'client-1', userId: 'linked-user-1', module: 'accounting', canRead: true, canWrite: false },
        { tenantId: 'client-1', userId: 'linked-user-1', module: 'reports-sales', canRead: true, canWrite: false },
        { tenantId: 'client-1', userId: 'linked-user-1', module: 'reports-pnl', canRead: true, canWrite: false },
        { tenantId: 'client-1', userId: 'linked-user-1', module: 'reports-financial', canRead: true, canWrite: false },
      ],
    });
    expect(authService.buildAccessToken).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'linked-user-1' }),
      'client-1',
      defaultGrants,
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
    expect(fakeTx.userModuleAccess.createMany).not.toHaveBeenCalled();
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

describe('MembershipsService.getPortfolio', () => {
  it('sólo incluye membresías ACCEPTED, con condición IVA y facturación del mes por cliente', async () => {
    const rows = [
      makeMembershipRow({ id: 'membership-accepted', status: 'ACCEPTED', tenant_id: 'client-1', client_tenant_name: 'Cliente Aceptado' }),
      makeMembershipRow({ id: 'membership-pending', status: 'PENDING', tenant_id: 'client-2', client_tenant_name: 'Cliente Pendiente' }),
    ];
    const queryRaw = jest.fn().mockResolvedValue(rows);
    const fakeTx = {
      tenantSettings: { findUnique: jest.fn().mockResolvedValue({ tenantId: 'client-1', ownTaxCondition: 'RESPONSABLE_INSCRIPTO' }) },
      invoice: { count: jest.fn().mockResolvedValue(7) },
      taxDeadline: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'deadline-1', kind: 'IVA', dueDate: new Date('2026-10-20'), description: 'IVA mensual' },
        ]),
      },
      $executeRaw: jest.fn().mockResolvedValue(undefined),
    };
    const prisma = {
      $queryRaw: queryRaw,
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(fakeTx)),
    } as unknown as PrismaService;
    const service = new MembershipsService(prisma, makeAuthService());

    const result = await service.getPortfolio('studio-1');

    expect(result).toEqual([
      {
        membershipId: 'membership-accepted',
        clientTenantId: 'client-1',
        clientTenantName: 'Cliente Aceptado',
        ownTaxCondition: 'RESPONSABLE_INSCRIPTO',
        invoicesThisMonth: 7,
        upcomingDeadlines: [
          { id: 'deadline-1', kind: 'IVA', dueDate: new Date('2026-10-20'), description: 'IVA mensual' },
        ],
      },
    ]);
    // El PENDING nunca abre contexto del tenant cliente - ni siquiera se consulta.
    expect(fakeTx.tenantSettings.findUnique).toHaveBeenCalledTimes(1);
    expect(fakeTx.taxDeadline.findMany).toHaveBeenCalledWith({
      where: { status: 'PENDING' },
      orderBy: { dueDate: 'asc' },
      take: 5,
    });
  });

  it('sigue con el resto de la cartera si un cliente falla, en vez de tumbar todo (mismo criterio que AdminTenantsService.listTenants)', async () => {
    const rows = [
      makeMembershipRow({ id: 'membership-1', status: 'ACCEPTED', tenant_id: 'client-1', client_tenant_name: 'Cliente Roto' }),
      makeMembershipRow({ id: 'membership-2', status: 'ACCEPTED', tenant_id: 'client-2', client_tenant_name: 'Cliente OK' }),
    ];
    const queryRaw = jest.fn().mockResolvedValue(rows);
    let call = 0;
    const prisma = {
      $queryRaw: queryRaw,
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => {
        call += 1;
        if (call === 1) {
          return Promise.reject(new Error('boom'));
        }
        return cb({
          tenantSettings: { findUnique: jest.fn().mockResolvedValue(null) },
          invoice: { count: jest.fn().mockResolvedValue(0) },
          taxDeadline: { findMany: jest.fn().mockResolvedValue([]) },
          $executeRaw: jest.fn().mockResolvedValue(undefined),
        });
      }),
    } as unknown as PrismaService;
    const service = new MembershipsService(prisma, makeAuthService());

    const result = await service.getPortfolio('studio-1');

    expect(result).toHaveLength(1);
    expect(result[0].clientTenantId).toBe('client-2');
  });
});

describe('MembershipsService.listForClient', () => {
  it('lista mis relaciones (RLS estandar, ya en mi propio tenant) y resuelve el nombre del estudio del otro lado por-tenant', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 'membership-1',
        homeTenantId: 'studio-1',
        direction: 'CLIENT_INVITED',
        status: 'PENDING',
        inviteeIdentifier: 'contador@estudio.com',
        createdAt: new Date('2026-09-04'),
        respondedAt: null,
      },
    ]);
    const fakeTx = {
      tenant: { findUnique: jest.fn().mockResolvedValue({ id: 'studio-1', name: 'Estudio Contable SRL' }) },
      $executeRaw: jest.fn().mockResolvedValue(undefined),
    };
    const prisma = {
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(fakeTx)),
    } as unknown as PrismaService;
    const service = new MembershipsService(prisma, makeAuthService());
    const dbClient = { tenantMembership: { findMany } };

    const result = await runInClientTenant(dbClient, () => service.listForClient());

    expect(findMany).toHaveBeenCalledWith({ orderBy: { createdAt: 'desc' } });
    expect(result).toEqual([
      {
        id: 'membership-1',
        homeTenantId: 'studio-1',
        homeTenantName: 'Estudio Contable SRL',
        direction: 'CLIENT_INVITED',
        status: 'PENDING',
        inviteeIdentifier: 'contador@estudio.com',
        createdAt: new Date('2026-09-04'),
        respondedAt: null,
      },
    ]);
  });
});

describe('MembershipsService.inviteFromClient', () => {
  it('resuelve por email, crea la fila PENDING/CLIENT_INVITED con RLS estandar (sin saltar de contexto)', async () => {
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce([{ tenant_id: 'studio-1', tenant_name: 'Estudio Contable SRL' }]);
    const prisma = { $queryRaw: queryRaw } as unknown as PrismaService;
    const service = new MembershipsService(prisma, makeAuthService());
    const create = jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({
        id: 'membership-new',
        tenantId: data['tenantId'],
        direction: data['direction'],
        status: data['status'],
        inviteeIdentifier: data['inviteeIdentifier'],
        createdAt: new Date('2026-09-04'),
        respondedAt: null,
      }),
    );
    const db = { tenantMembership: { findFirst: jest.fn().mockResolvedValue(null), create } };

    const result = await runInClientTenant(db, () =>
      service.inviteFromClient('contador@estudio.com', 'client-1', 'client-user-1'),
    );

    expect(create).toHaveBeenCalledWith({
      data: {
        tenantId: 'client-1',
        homeTenantId: 'studio-1',
        inviteeIdentifier: 'contador@estudio.com',
        direction: 'CLIENT_INVITED',
        status: 'PENDING',
        initiatedByUserId: 'client-user-1',
      },
    });
    expect(result.clientTenantName).toBe('Estudio Contable SRL');
  });

  it('rechaza invitarse a si mismo', async () => {
    const queryRaw = jest.fn().mockResolvedValueOnce([{ tenant_id: 'client-1', tenant_name: 'Cliente Demo SA' }]);
    const prisma = { $queryRaw: queryRaw } as unknown as PrismaService;
    const service = new MembershipsService(prisma, makeAuthService());
    const db = { tenantMembership: { findFirst: jest.fn(), create: jest.fn() } };

    await expect(
      runInClientTenant(db, () => service.inviteFromClient('yo@mismo.com', 'client-1', 'client-user-1')),
    ).rejects.toThrow('No podés invitarte a vos mismo');
  });

  it('rechaza una segunda invitacion si ya hay una relacion pendiente/activa con ese estudio', async () => {
    const queryRaw = jest.fn().mockResolvedValueOnce([{ tenant_id: 'studio-1', tenant_name: 'Estudio' }]);
    const prisma = { $queryRaw: queryRaw } as unknown as PrismaService;
    const service = new MembershipsService(prisma, makeAuthService());
    const db = {
      tenantMembership: { findFirst: jest.fn().mockResolvedValue({ id: 'membership-existing' }), create: jest.fn() },
    };

    await expect(
      runInClientTenant(db, () => service.inviteFromClient('contador@estudio.com', 'client-1', 'client-user-1')),
    ).rejects.toThrow('Ya existe una relación');
    expect(db.tenantMembership.create).not.toHaveBeenCalled();
  });

  it('rechaza un identificador que no resuelve a ninguna cuenta (NotFoundException)', async () => {
    const queryRaw = jest.fn().mockResolvedValueOnce([]);
    const prisma = { $queryRaw: queryRaw } as unknown as PrismaService;
    const service = new MembershipsService(prisma, makeAuthService());
    const db = { tenantMembership: { findFirst: jest.fn(), create: jest.fn() } };

    await expect(
      runInClientTenant(db, () => service.inviteFromClient('nadie@nada.com', 'client-1', 'client-user-1')),
    ).rejects.toThrow('el estudio contable necesita tener su propia cuenta');
  });

  it('rechaza un email ambiguo (mas de un tenant con el mismo email)', async () => {
    const queryRaw = jest.fn().mockResolvedValueOnce([
      { tenant_id: 'studio-1', tenant_name: 'Estudio A' },
      { tenant_id: 'studio-2', tenant_name: 'Estudio B' },
    ]);
    const prisma = { $queryRaw: queryRaw } as unknown as PrismaService;
    const service = new MembershipsService(prisma, makeAuthService());
    const db = { tenantMembership: { findFirst: jest.fn(), create: jest.fn() } };

    await expect(
      runInClientTenant(db, () => service.inviteFromClient('compartido@x.com', 'client-1', 'client-user-1')),
    ).rejects.toThrow('más de una cuenta');
  });
});

describe('MembershipsService.requestFromStudio', () => {
  it('resuelve por CUIT y crea la fila abriendo withTenantContext del tenant CLIENTE (el estudio no tiene contexto propio ahi)', async () => {
    const fakeTx = {
      tenantMembership: {
        create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({
            id: 'membership-new',
            tenantId: data['tenantId'],
            direction: data['direction'],
            status: data['status'],
            inviteeIdentifier: data['inviteeIdentifier'],
            createdAt: new Date('2026-09-04'),
            respondedAt: null,
          }),
        ),
      },
      $executeRaw: jest.fn().mockResolvedValue(undefined),
    };
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce([{ tenant_id: 'client-1', tenant_name: 'Cliente Demo SA' }])
      .mockResolvedValueOnce([]);
    const prisma = {
      $queryRaw: queryRaw,
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(fakeTx)),
    } as unknown as PrismaService;
    const service = new MembershipsService(prisma, makeAuthService());
    const db = { user: { findUnique: jest.fn() } };

    const result = await runInStudioTenant(db, () =>
      service.requestFromStudio('30-71659554-9', 'studio-1', 'studio-user-1'),
    );

    expect(fakeTx.tenantMembership.create).toHaveBeenCalledWith({
      data: {
        tenantId: 'client-1',
        homeTenantId: 'studio-1',
        inviteeIdentifier: '30-71659554-9',
        direction: 'ACCOUNTANT_REQUESTED',
        status: 'PENDING',
        initiatedByUserId: 'studio-user-1',
      },
    });
    expect(result.clientTenantName).toBe('Cliente Demo SA');
  });

  it('rechaza un identificador que no tiene 11 digitos ni es un email', async () => {
    const prisma = { $queryRaw: jest.fn() } as unknown as PrismaService;
    const service = new MembershipsService(prisma, makeAuthService());
    const db = { user: { findUnique: jest.fn() } };

    await expect(
      runInStudioTenant(db, () => service.requestFromStudio('123', 'studio-1', 'studio-user-1')),
    ).rejects.toThrow('email o un CUIT válido');
  });
});

describe('MembershipsService.respond', () => {
  it('el ESTUDIO puede responder una invitacion CLIENT_INVITED (RLS del lado cliente no la ve, pasa por list_studio_memberships)', async () => {
    const fakeTx = {
      tenantMembership: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'membership-1',
          tenantId: 'client-1',
          homeTenantId: 'studio-1',
          direction: 'CLIENT_INVITED',
          status: 'PENDING',
        }),
        update: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({
            id: 'membership-1',
            tenantId: 'client-1',
            direction: 'CLIENT_INVITED',
            status: data['status'],
            inviteeIdentifier: null,
            createdAt: new Date('2026-09-01'),
            respondedAt: data['respondedAt'],
          }),
        ),
      },
      tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'client-1', name: 'Cliente Demo SA' }) },
      $executeRaw: jest.fn().mockResolvedValue(undefined),
    };
    const queryRaw = jest.fn().mockResolvedValueOnce([makeMembershipRow({ status: 'PENDING' })]);
    const prisma = {
      $queryRaw: queryRaw,
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(fakeTx)),
    } as unknown as PrismaService;
    const service = new MembershipsService(prisma, makeAuthService());
    const dbStudio = { tenantMembership: { findUnique: jest.fn().mockResolvedValue(null) } };

    const result = await runInStudioTenant(dbStudio, () => service.respond('membership-1', 'studio-1', 'ACCEPTED'));

    expect(fakeTx.tenantMembership.update).toHaveBeenCalledWith({
      where: { id: 'membership-1' },
      data: { status: 'ACCEPTED', respondedAt: expect.any(Date) },
    });
    expect(result.status).toBe('ACCEPTED');
  });

  it('rechaza que el CLIENTE responda su propia invitacion CLIENT_INVITED - le corresponde al estudio, no a quien la mando', async () => {
    const fakeTx = {
      tenantMembership: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'membership-1',
          tenantId: 'client-1',
          homeTenantId: 'studio-1',
          direction: 'CLIENT_INVITED',
          status: 'PENDING',
        }),
        update: jest.fn(),
      },
      $executeRaw: jest.fn().mockResolvedValue(undefined),
    };
    const prisma = {
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(fakeTx)),
    } as unknown as PrismaService;
    const service = new MembershipsService(prisma, makeAuthService());
    const dbClient = {
      tenantMembership: { findUnique: jest.fn().mockResolvedValue({ id: 'membership-1', tenantId: 'client-1' }) },
    };

    await expect(
      runInClientTenant(dbClient, () => service.respond('membership-1', 'client-1', 'ACCEPTED')),
    ).rejects.toThrow('No te corresponde responder');
    expect(fakeTx.tenantMembership.update).not.toHaveBeenCalled();
  });

  it('rechaza responder una solicitud que ya no esta PENDING', async () => {
    const fakeTx = {
      tenantMembership: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'membership-1',
          tenantId: 'client-1',
          homeTenantId: 'studio-1',
          direction: 'ACCOUNTANT_REQUESTED',
          status: 'ACCEPTED',
        }),
        update: jest.fn(),
      },
      $executeRaw: jest.fn().mockResolvedValue(undefined),
    };
    const prisma = {
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(fakeTx)),
    } as unknown as PrismaService;
    const service = new MembershipsService(prisma, makeAuthService());
    const dbClient = {
      tenantMembership: { findUnique: jest.fn().mockResolvedValue({ id: 'membership-1', tenantId: 'client-1' }) },
    };

    await expect(
      runInClientTenant(dbClient, () => service.respond('membership-1', 'client-1', 'ACCEPTED')),
    ).rejects.toThrow('ya fue respondida');
    expect(fakeTx.tenantMembership.update).not.toHaveBeenCalled();
  });
});

describe('MembershipsService.revoke', () => {
  it('suspende todas las filas espejo ya creadas para esta membership y la marca REVOKED', async () => {
    const fakeTx = {
      tenantMembership: {
        findUnique: jest.fn().mockResolvedValue({ id: 'membership-1', tenantId: 'client-1', status: 'ACCEPTED' }),
        update: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({
            id: 'membership-1',
            tenantId: 'client-1',
            direction: 'CLIENT_INVITED',
            status: data['status'],
            inviteeIdentifier: null,
            createdAt: new Date('2026-09-01'),
            respondedAt: data['respondedAt'],
          }),
        ),
      },
      tenantMembershipLink: {
        findMany: jest.fn().mockResolvedValue([{ linkedUserId: 'linked-user-1' }, { linkedUserId: 'linked-user-2' }]),
      },
      user: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
      tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'client-1', name: 'Cliente Demo SA' }) },
      $executeRaw: jest.fn().mockResolvedValue(undefined),
    };
    const prisma = {
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(fakeTx)),
    } as unknown as PrismaService;
    const service = new MembershipsService(prisma, makeAuthService());
    const dbClient = {
      tenantMembership: { findUnique: jest.fn().mockResolvedValue({ id: 'membership-1', tenantId: 'client-1' }) },
    };

    const result = await runInClientTenant(dbClient, () => service.revoke('membership-1', 'client-1'));

    expect(fakeTx.user.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['linked-user-1', 'linked-user-2'] } },
      data: { status: 'SUSPENDED' },
    });
    expect(fakeTx.tenantMembership.update).toHaveBeenCalledWith({
      where: { id: 'membership-1' },
      data: { status: 'REVOKED', respondedAt: expect.any(Date) },
    });
    expect(result.status).toBe('REVOKED');
  });

  it('rechaza revocar una membership que no esta ACCEPTED', async () => {
    const fakeTx = {
      tenantMembership: {
        findUnique: jest.fn().mockResolvedValue({ id: 'membership-1', tenantId: 'client-1', status: 'PENDING' }),
        update: jest.fn(),
      },
      tenantMembershipLink: { findMany: jest.fn() },
      user: { updateMany: jest.fn() },
      $executeRaw: jest.fn().mockResolvedValue(undefined),
    };
    const prisma = {
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(fakeTx)),
    } as unknown as PrismaService;
    const service = new MembershipsService(prisma, makeAuthService());
    const dbClient = {
      tenantMembership: { findUnique: jest.fn().mockResolvedValue({ id: 'membership-1', tenantId: 'client-1' }) },
    };

    await expect(runInClientTenant(dbClient, () => service.revoke('membership-1', 'client-1'))).rejects.toThrow(
      'Sólo se puede revocar una relación activa',
    );
    expect(fakeTx.user.updateMany).not.toHaveBeenCalled();
  });
});
