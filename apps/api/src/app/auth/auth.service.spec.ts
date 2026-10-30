import { UnauthorizedException } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import type { ActivityLogService } from '@plexo/activity-log';
import type { AuthEmailSender } from '@plexo/auth-email';
import { tenantContextStorage, type PrismaService } from '@plexo/database';
import * as bcrypt from 'bcryptjs';
import { AuthService, EmailNotVerifiedError } from './auth.service.js';
import type { LoginDto } from './dto/login.dto.js';

describe('AuthService', () => {
  const dto: LoginDto = {
    tenantId: 'tenant-1',
    email: 'owner@acme.test',
    password: 'correct-password',
  };

  const originalPlatformAdminEmails = process.env['PLATFORM_ADMIN_EMAILS'];
  beforeEach(() => {
    // Deterministic across environments - only the isPlatformAdmin tests
    // below opt back in explicitly.
    delete process.env['PLATFORM_ADMIN_EMAILS'];
  });
  afterAll(() => {
    if (originalPlatformAdminEmails === undefined) {
      delete process.env['PLATFORM_ADMIN_EMAILS'];
    } else {
      process.env['PLATFORM_ADMIN_EMAILS'] = originalPlatformAdminEmails;
    }
  });

  function makePrisma(
    user: unknown,
    moduleAccess: unknown[] = [],
    tenant: unknown = { id: 'tenant-1', status: 'ACTIVE' },
  ) {
    const fakeTx = {
      tenant: { findUnique: jest.fn().mockResolvedValue(tenant) },
      user: { findUnique: jest.fn().mockResolvedValue(user) },
      userModuleAccess: { findMany: jest.fn().mockResolvedValue(moduleAccess) },
      userActivityLog: { create: jest.fn().mockResolvedValue({}) },
      $executeRaw: jest.fn().mockResolvedValue(undefined),
    };
    return {
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(fakeTx)),
    } as unknown as PrismaService;
  }

  function makeJwt() {
    return {
      signAsync: jest.fn().mockResolvedValue('signed.jwt.token'),
    } as unknown as JwtService;
  }

  function makeActivityLogService() {
    return { listForUser: jest.fn() } as unknown as ActivityLogService;
  }

  function makeAuthEmailSender() {
    return {
      sendVerificationCode: jest.fn().mockResolvedValue(undefined),
      sendPasswordResetLink: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuthEmailSender;
  }

  it('throws when no user exists for that email in the tenant', async () => {
    const service = new AuthService(makePrisma(null), makeJwt(), makeActivityLogService(), makeAuthEmailSender());
    await expect(service.login(dto, '127.0.0.1')).rejects.toThrow(UnauthorizedException);
  });

  it('throws when the password does not match', async () => {
    const passwordHash = await bcrypt.hash('a-different-password', 4);
    const service = new AuthService(
      makePrisma({ id: 'user-1', email: dto.email, roles: ['OWNER'], passwordHash }),
      makeJwt(),
      makeActivityLogService(),
      makeAuthEmailSender(),
    );
    await expect(service.login(dto, '127.0.0.1')).rejects.toThrow(UnauthorizedException);
  });

  it('signs a token with the expected payload on valid credentials', async () => {
    const passwordHash = await bcrypt.hash(dto.password, 4);
    const jwt = makeJwt();
    const service = new AuthService(
      makePrisma(
        {
          id: 'user-1',
          email: dto.email,
          roles: ['OWNER'],
          passwordHash,
          mustChangePassword: false,
          emailVerifiedAt: new Date('2026-01-01'),
        },
        [{ module: 'accounting', canRead: true, canWrite: false }],
      ),
      jwt,
      makeActivityLogService(),
      makeAuthEmailSender(),
    );

    const result = await service.login(dto, '127.0.0.1');

    expect(result).toEqual({ accessToken: 'signed.jwt.token' });
    expect(jwt.signAsync).toHaveBeenCalledWith({
      sub: 'user-1',
      tenantId: dto.tenantId,
      email: dto.email,
      roles: ['OWNER'],
      moduleAccess: [{ module: 'accounting', canRead: true, canWrite: false }],
      mustChangePassword: false,
      isPlatformAdmin: false,
    });
  });

  it('carries mustChangePassword through to the JWT payload for an invited user', async () => {
    const passwordHash = await bcrypt.hash(dto.password, 4);
    const jwt = makeJwt();
    const service = new AuthService(
      makePrisma({
        id: 'user-1',
        email: dto.email,
        roles: ['VIEWER'],
        passwordHash,
        mustChangePassword: true,
        emailVerifiedAt: new Date('2026-01-01'),
      }),
      jwt,
      makeActivityLogService(),
      makeAuthEmailSender(),
    );

    await service.login(dto, '127.0.0.1');

    expect(jwt.signAsync).toHaveBeenCalledWith(
      expect.objectContaining({ mustChangePassword: true }),
    );
  });

  it('stamps isPlatformAdmin true when the email is in PLATFORM_ADMIN_EMAILS', async () => {
    process.env['PLATFORM_ADMIN_EMAILS'] = `other@acme.test, ${dto.email}`;
    const passwordHash = await bcrypt.hash(dto.password, 4);
    const jwt = makeJwt();
    const service = new AuthService(
      makePrisma({
        id: 'user-1',
        email: dto.email,
        roles: ['OWNER'],
        passwordHash,
        mustChangePassword: false,
        emailVerifiedAt: new Date('2026-01-01'),
      }),
      jwt,
      makeActivityLogService(),
      makeAuthEmailSender(),
    );

    await service.login(dto, '127.0.0.1');

    expect(jwt.signAsync).toHaveBeenCalledWith(
      expect.objectContaining({ isPlatformAdmin: true }),
    );
  });

  it('throws when the tenant is suspended even with correct credentials', async () => {
    const passwordHash = await bcrypt.hash(dto.password, 4);
    const jwt = makeJwt();
    const service = new AuthService(
      makePrisma(
        {
          id: 'user-1',
          email: dto.email,
          roles: ['OWNER'],
          passwordHash,
          mustChangePassword: false,
          emailVerifiedAt: new Date('2026-01-01'),
        },
        [],
        { id: 'tenant-1', status: 'SUSPENDED' },
      ),
      jwt,
      makeActivityLogService(),
      makeAuthEmailSender(),
    );

    await expect(service.login(dto, '127.0.0.1')).rejects.toThrow(UnauthorizedException);
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });

  it('throws when the individual user is suspended even with an active tenant and correct credentials', async () => {
    const passwordHash = await bcrypt.hash(dto.password, 4);
    const jwt = makeJwt();
    const service = new AuthService(
      makePrisma({
        id: 'user-1',
        email: dto.email,
        roles: ['SALES'],
        status: 'SUSPENDED',
        passwordHash,
        mustChangePassword: false,
        emailVerifiedAt: new Date('2026-01-01'),
      }),
      jwt,
      makeActivityLogService(),
      makeAuthEmailSender(),
    );

    await expect(service.login(dto, '127.0.0.1')).rejects.toThrow(UnauthorizedException);
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });

  it('throws EmailNotVerifiedError when the password is correct but the email is unverified', async () => {
    const passwordHash = await bcrypt.hash(dto.password, 4);
    const jwt = makeJwt();
    const service = new AuthService(
      makePrisma({
        id: 'user-1',
        email: dto.email,
        roles: ['OWNER'],
        passwordHash,
        mustChangePassword: false,
        emailVerifiedAt: null,
      }),
      jwt,
      makeActivityLogService(),
      makeAuthEmailSender(),
    );

    await expect(service.login(dto, '127.0.0.1')).rejects.toThrow(EmailNotVerifiedError);
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });

  it('signs a longer-lived token when rememberMe is set', async () => {
    const passwordHash = await bcrypt.hash(dto.password, 4);
    const jwt = makeJwt();
    const service = new AuthService(
      makePrisma({
        id: 'user-1',
        email: dto.email,
        roles: ['OWNER'],
        passwordHash,
        mustChangePassword: false,
        emailVerifiedAt: new Date('2026-01-01'),
      }),
      jwt,
      makeActivityLogService(),
      makeAuthEmailSender(),
    );

    await service.login({ ...dto, rememberMe: true }, '127.0.0.1');

    expect(jwt.signAsync).toHaveBeenCalledWith(expect.anything(), { expiresIn: '30d' });
  });

  describe('impersonate', () => {
    function makeImpersonationPrisma(user: unknown, moduleAccess: unknown[] = []) {
      const fakeTx = {
        user: { findUnique: jest.fn().mockResolvedValue(user) },
        userModuleAccess: { findMany: jest.fn().mockResolvedValue(moduleAccess) },
        userActivityLog: { create: jest.fn().mockResolvedValue({}) },
        $executeRaw: jest.fn().mockResolvedValue(undefined),
      };
      const prisma = {
        $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(fakeTx)),
      } as unknown as PrismaService;
      return { prisma, fakeTx };
    }

    const admin = { id: 'admin-1', email: 'super@plexo.test' };

    it('throws when the target user does not exist in that tenant', async () => {
      const { prisma } = makeImpersonationPrisma(null);
      const service = new AuthService(prisma, makeJwt(), makeActivityLogService(), makeAuthEmailSender());

      await expect(service.impersonate('tenant-2', 'user-404', admin)).rejects.toThrow();
    });

    it('signs a 15-minute token forcing mustChangePassword false and carrying impersonatedBy', async () => {
      const jwt = makeJwt();
      const { prisma } = makeImpersonationPrisma(
        { id: 'user-2', email: 'target@acme.test', roles: ['ADMIN'], mustChangePassword: true },
        [{ module: 'sales', canRead: true, canWrite: true }],
      );
      const service = new AuthService(prisma, jwt, makeActivityLogService(), makeAuthEmailSender());

      const result = await service.impersonate('tenant-2', 'user-2', admin);

      expect(result.accessToken).toBe('signed.jwt.token');
      expect(jwt.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: 'user-2',
          tenantId: 'tenant-2',
          email: 'target@acme.test',
          mustChangePassword: false,
          isPlatformAdmin: false,
          impersonatedBy: admin,
        }),
        { expiresIn: '15m' },
      );
    });

    it('records an activity log entry in the target tenant naming both parties', async () => {
      const { prisma, fakeTx } = makeImpersonationPrisma({
        id: 'user-2',
        email: 'target@acme.test',
        roles: ['ADMIN'],
        mustChangePassword: false,
      });
      const service = new AuthService(prisma, makeJwt(), makeActivityLogService(), makeAuthEmailSender());

      await service.impersonate('tenant-2', 'user-2', admin);

      expect(fakeTx.userActivityLog.create).toHaveBeenCalledWith({
        data: {
          tenantId: 'tenant-2',
          userId: admin.id,
          action: 'admin.impersonate',
          outcome: 'SUCCESS',
          entityLabel: `target@acme.test (impersonado por ${admin.email})`,
        },
      });
    });
  });

  describe('changePassword', () => {
    function makeTenantScopedPrisma(user: unknown) {
      return {
        user: { findUnique: jest.fn().mockResolvedValue(user), update: jest.fn().mockResolvedValue({}) },
      };
    }

    it('clears mustChangePassword once the password is successfully changed', async () => {
      const passwordHash = await bcrypt.hash('old-password', 4);
      const db = makeTenantScopedPrisma({ id: 'user-1', passwordHash, mustChangePassword: true });
      const service = new AuthService({} as PrismaService, makeJwt(), makeActivityLogService(), makeAuthEmailSender());

      await tenantContextStorage.run({ tenantId: 'tenant-1', tx: db as never }, () =>
        service.changePassword('user-1', { currentPassword: 'old-password', newPassword: 'new-password-1' }),
      );

      expect(db.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { passwordHash: expect.any(String), mustChangePassword: false },
      });
    });
  });

  describe('resolveTenant', () => {
    it('maps the SQL function rows to candidates', async () => {
      const prisma = {
        $queryRaw: jest.fn().mockResolvedValue([
          { tenant_id: 'tenant-1', tenant_name: 'Acme' },
          { tenant_id: 'tenant-2', tenant_name: 'Beta' },
        ]),
      } as unknown as PrismaService;
      const service = new AuthService(prisma, makeJwt(), makeActivityLogService(), makeAuthEmailSender());

      const result = await service.resolveTenant({ email: 'shared@acme.test' });

      expect(result).toEqual({
        candidates: [
          { tenantId: 'tenant-1', tenantName: 'Acme' },
          { tenantId: 'tenant-2', tenantName: 'Beta' },
        ],
      });
    });

    it('returns an empty list when no tenant matches', async () => {
      const prisma = { $queryRaw: jest.fn().mockResolvedValue([]) } as unknown as PrismaService;
      const service = new AuthService(prisma, makeJwt(), makeActivityLogService(), makeAuthEmailSender());

      const result = await service.resolveTenant({ email: 'nobody@acme.test' });

      expect(result).toEqual({ candidates: [] });
    });
  });

  describe('forgotPassword', () => {
    function makeForgotPasswordPrisma(rows: { tenant_id: string; user_id: string }[]) {
      const fakeTx = {
        passwordResetToken: {
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          create: jest.fn().mockResolvedValue({}),
        },
        $executeRaw: jest.fn().mockResolvedValue(undefined),
      };
      const prisma = {
        $queryRaw: jest.fn().mockResolvedValue(rows),
        $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(fakeTx)),
      } as unknown as PrismaService;
      return { prisma, fakeTx };
    }

    it('always returns ok:true, even with zero matching tenants (no user enumeration)', async () => {
      const { prisma } = makeForgotPasswordPrisma([]);
      const authEmailSender = makeAuthEmailSender();
      const service = new AuthService(prisma, makeJwt(), makeActivityLogService(), authEmailSender);

      const result = await service.forgotPassword({ email: 'nobody@acme.test' });

      expect(result).toEqual({ ok: true });
      expect(authEmailSender.sendPasswordResetLink).not.toHaveBeenCalled();
    });

    it('invalidates any previous unused token before creating a new one, then emails a reset link', async () => {
      const { prisma, fakeTx } = makeForgotPasswordPrisma([{ tenant_id: 'tenant-1', user_id: 'user-1' }]);
      const authEmailSender = makeAuthEmailSender();
      const service = new AuthService(prisma, makeJwt(), makeActivityLogService(), authEmailSender);

      await service.forgotPassword({ email: 'owner@acme.test' });

      expect(fakeTx.passwordResetToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', usedAt: null },
        data: { usedAt: expect.any(Date) },
      });
      expect(fakeTx.passwordResetToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ tenantId: 'tenant-1', userId: 'user-1' }),
      });
      expect(authEmailSender.sendPasswordResetLink).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'owner@acme.test',
          resetUrl: expect.stringContaining('tenantId=tenant-1'),
        }),
      );
    });

    it('sends one link per tenant when the same email matches several tenants', async () => {
      const { prisma } = makeForgotPasswordPrisma([
        { tenant_id: 'tenant-1', user_id: 'user-1' },
        { tenant_id: 'tenant-2', user_id: 'user-2' },
      ]);
      const authEmailSender = makeAuthEmailSender();
      const service = new AuthService(prisma, makeJwt(), makeActivityLogService(), authEmailSender);

      await service.forgotPassword({ email: 'shared@acme.test' });

      expect(authEmailSender.sendPasswordResetLink).toHaveBeenCalledTimes(2);
    });
  });

  describe('resetPassword', () => {
    function makeResetPasswordPrisma(tokenRow: unknown) {
      const fakeTx = {
        passwordResetToken: {
          findFirst: jest.fn().mockResolvedValue(tokenRow),
          update: jest.fn().mockResolvedValue({}),
        },
        user: { update: jest.fn().mockResolvedValue({}) },
        $executeRaw: jest.fn().mockResolvedValue(undefined),
      };
      const prisma = {
        $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(fakeTx)),
      } as unknown as PrismaService;
      return { prisma, fakeTx };
    }

    it('updates the password and marks the token used on a valid token', async () => {
      const { prisma, fakeTx } = makeResetPasswordPrisma({
        id: 'token-1',
        userId: 'user-1',
        expiresAt: new Date(Date.now() + 60_000),
      });
      const service = new AuthService(prisma, makeJwt(), makeActivityLogService(), makeAuthEmailSender());

      await service.resetPassword({ tenantId: 'tenant-1', token: 'raw-token', newPassword: 'new-password-1' });

      expect(fakeTx.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { passwordHash: expect.any(String) },
      });
      expect(fakeTx.passwordResetToken.update).toHaveBeenCalledWith({
        where: { id: 'token-1' },
        data: { usedAt: expect.any(Date) },
      });
    });

    it('rejects an expired token', async () => {
      const { prisma } = makeResetPasswordPrisma({
        id: 'token-1',
        userId: 'user-1',
        expiresAt: new Date(Date.now() - 1_000),
      });
      const service = new AuthService(prisma, makeJwt(), makeActivityLogService(), makeAuthEmailSender());

      await expect(
        service.resetPassword({ tenantId: 'tenant-1', token: 'raw-token', newPassword: 'new-password-1' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a token that does not exist (wrong or already-used)', async () => {
      const { prisma } = makeResetPasswordPrisma(null);
      const service = new AuthService(prisma, makeJwt(), makeActivityLogService(), makeAuthEmailSender());

      await expect(
        service.resetPassword({ tenantId: 'tenant-1', token: 'raw-token', newPassword: 'new-password-1' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
