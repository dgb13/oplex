import { UnauthorizedException } from '@nestjs/common';
import type { AuthEmailSender } from '@plexo/auth-email';
import type { PrismaService } from '@plexo/database';
import { createHash } from 'node:crypto';
import type { LegalService } from '../legal/legal.service.js';
import type { AuthService } from './auth.service.js';
import { SignupService } from './signup.service.js';
import type { ProvisionedTenant, TenantProvisioningService } from './tenant-provisioning.service.js';

function makePrisma(fakeTx: Record<string, unknown>) {
  const txWithExecuteRaw = { $executeRaw: jest.fn().mockResolvedValue(undefined), ...fakeTx };
  return {
    $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(txWithExecuteRaw)),
  } as unknown as PrismaService;
}

function makeTenantProvisioningService(result: ProvisionedTenant) {
  return { provision: jest.fn().mockResolvedValue(result) } as unknown as TenantProvisioningService;
}

function makeAuthService() {
  return { buildAccessToken: jest.fn().mockResolvedValue('signed.jwt.token') } as unknown as AuthService;
}

function makeAuthEmailSender() {
  return {
    sendVerificationCode: jest.fn().mockResolvedValue(undefined),
    sendPasswordResetLink: jest.fn().mockResolvedValue(undefined),
  } as unknown as AuthEmailSender;
}

function makeLegalService() {
  return {
    acceptCurrentTerms: jest.fn().mockResolvedValue({ version: '1.0', acceptedAt: new Date() }),
  } as unknown as LegalService;
}

describe('SignupService.signup', () => {
  it('provisions the tenant unverified and sends a 6-digit code', async () => {
    const fakeTx = {
      emailVerificationCode: { upsert: jest.fn().mockResolvedValue({}) },
    };
    const prisma = makePrisma(fakeTx);
    const tenantProvisioningService = makeTenantProvisioningService({ tenantId: 'tenant-1', userId: 'user-1' });
    const authEmailSender = makeAuthEmailSender();
    const legalService = makeLegalService();
    const service = new SignupService(prisma, tenantProvisioningService, makeAuthService(), authEmailSender, legalService);

    const result = await service.signup(
      {
        tenantName: 'Nueva Empresa',
        email: 'nueva@demo.com',
        password: 'password123',
        acceptTerms: true,
      },
      { ip: '1.2.3.4', userAgent: 'test' },
    );

    // Prueba de aceptación del contrato registrada para el dueño nuevo.
    expect(legalService.acceptCurrentTerms).toHaveBeenCalledWith({ ip: '1.2.3.4', userAgent: 'test' }, 'user-1');

    expect(tenantProvisioningService.provision).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Nueva Empresa',
        ownerEmail: 'nueva@demo.com',
        autoVerifyEmail: false,
        mustChangePassword: false,
      }),
    );
    expect(fakeTx.emailVerificationCode.upsert).toHaveBeenCalled();
    expect(authEmailSender.sendVerificationCode).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'nueva@demo.com', code: expect.stringMatching(/^\d{6}$/) }),
    );
    expect(result).toEqual({ tenantId: expect.any(String), email: 'nueva@demo.com' });
  });
});

describe('SignupService.verifyEmail', () => {
  const dto = { tenantId: 'tenant-1', email: 'nueva@demo.com', code: '123456' };

  function makeVerifyPrisma(codeRow: unknown, user: unknown = { id: 'user-1', email: dto.email }) {
    const fakeTx = {
      user: { findUnique: jest.fn().mockResolvedValue(user), update: jest.fn().mockResolvedValue(user) },
      emailVerificationCode: {
        findUnique: jest.fn().mockResolvedValue(codeRow),
        update: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
      },
      userModuleAccess: { findMany: jest.fn().mockResolvedValue([]) },
    };
    return { prisma: makePrisma(fakeTx), fakeTx };
  }

  it('verifies with the correct code and returns an access token', async () => {
    const codeHash = createHash('sha256').update('123456').digest('hex');
    const { prisma, fakeTx } = makeVerifyPrisma({
      codeHash,
      expiresAt: new Date(Date.now() + 60_000),
      attemptCount: 0,
    });
    const authService = makeAuthService();
    const service = new SignupService(
      prisma,
      {} as unknown as TenantProvisioningService,
      authService,
      makeAuthEmailSender(),
      makeLegalService(),
    );

    const result = await service.verifyEmail(dto);

    expect(fakeTx.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { emailVerifiedAt: expect.any(Date) },
    });
    expect(fakeTx.emailVerificationCode.delete).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
    expect(authService.buildAccessToken).toHaveBeenCalled();
    expect(result).toEqual({ accessToken: 'signed.jwt.token' });
  });

  it('rejects and increments attemptCount on a wrong code', async () => {
    const codeHash = createHash('sha256').update('000000').digest('hex');
    const { prisma, fakeTx } = makeVerifyPrisma({
      codeHash,
      expiresAt: new Date(Date.now() + 60_000),
      attemptCount: 0,
    });
    const service = new SignupService(
      prisma,
      {} as unknown as TenantProvisioningService,
      makeAuthService(),
      makeAuthEmailSender(),
      makeLegalService(),
    );

    await expect(service.verifyEmail(dto)).rejects.toThrow(UnauthorizedException);
    expect(fakeTx.emailVerificationCode.update).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      data: { attemptCount: { increment: 1 } },
    });
  });

  it('rejects an expired code without checking attempts', async () => {
    const codeHash = createHash('sha256').update('123456').digest('hex');
    const { prisma } = makeVerifyPrisma({
      codeHash,
      expiresAt: new Date(Date.now() - 1_000),
      attemptCount: 0,
    });
    const service = new SignupService(
      prisma,
      {} as unknown as TenantProvisioningService,
      makeAuthService(),
      makeAuthEmailSender(),
      makeLegalService(),
    );

    await expect(service.verifyEmail(dto)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects once the max attempt count is reached, even with the right code', async () => {
    const codeHash = createHash('sha256').update('123456').digest('hex');
    const { prisma } = makeVerifyPrisma({
      codeHash,
      expiresAt: new Date(Date.now() + 60_000),
      attemptCount: 5,
    });
    const service = new SignupService(
      prisma,
      {} as unknown as TenantProvisioningService,
      makeAuthService(),
      makeAuthEmailSender(),
      makeLegalService(),
    );

    await expect(service.verifyEmail(dto)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects when no user exists for that tenant/email', async () => {
    const { prisma } = makeVerifyPrisma(null, null);
    const service = new SignupService(
      prisma,
      {} as unknown as TenantProvisioningService,
      makeAuthService(),
      makeAuthEmailSender(),
      makeLegalService(),
    );

    await expect(service.verifyEmail(dto)).rejects.toThrow(UnauthorizedException);
  });
});

describe('SignupService.resendCode', () => {
  const dto = { tenantId: 'tenant-1', email: 'nueva@demo.com' };

  it('issues a new code when there is no cooldown in effect', async () => {
    const fakeTx = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'user-1', email: dto.email, emailVerifiedAt: null }) },
      emailVerificationCode: {
        findUnique: jest.fn().mockResolvedValue({ lastSentAt: new Date(Date.now() - 120_000) }),
        upsert: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = makePrisma(fakeTx);
    const authEmailSender = makeAuthEmailSender();
    const service = new SignupService(
      prisma,
      {} as unknown as TenantProvisioningService,
      makeAuthService(),
      authEmailSender,
    );

    const result = await service.resendCode(dto);

    expect(fakeTx.emailVerificationCode.upsert).toHaveBeenCalled();
    expect(authEmailSender.sendVerificationCode).toHaveBeenCalled();
    expect(result).toEqual({ ok: true });
  });

  it('rejects when still inside the cooldown window', async () => {
    const fakeTx = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'user-1', email: dto.email, emailVerifiedAt: null }) },
      emailVerificationCode: {
        findUnique: jest.fn().mockResolvedValue({ lastSentAt: new Date() }),
        upsert: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = makePrisma(fakeTx);
    const service = new SignupService(
      prisma,
      {} as unknown as TenantProvisioningService,
      makeAuthService(),
      makeAuthEmailSender(),
      makeLegalService(),
    );

    await expect(service.resendCode(dto)).rejects.toThrow();
    expect(fakeTx.emailVerificationCode.upsert).not.toHaveBeenCalled();
  });

  it('no-ops (but still returns ok) when the account is already verified', async () => {
    const fakeTx = {
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'user-1', email: dto.email, emailVerifiedAt: new Date() }),
      },
      emailVerificationCode: { findUnique: jest.fn(), upsert: jest.fn() },
    };
    const prisma = makePrisma(fakeTx);
    const authEmailSender = makeAuthEmailSender();
    const service = new SignupService(
      prisma,
      {} as unknown as TenantProvisioningService,
      makeAuthService(),
      authEmailSender,
    );

    const result = await service.resendCode(dto);

    expect(authEmailSender.sendVerificationCode).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true });
  });
});
