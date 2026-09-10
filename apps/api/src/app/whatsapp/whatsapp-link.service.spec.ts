import type { PrismaService } from '@plexo/database';
import { tenantContextStorage } from '@plexo/database';
import type { AuthenticatedUser } from '@plexo/types';
import { createHash } from 'node:crypto';
import { WhatsAppLinkService } from './whatsapp-link.service.js';

function runInTenant<T>(db: Record<string, unknown>, fn: () => T): T {
  return tenantContextStorage.run({ tenantId: 'tenant-1', userId: 'user-1', tx: db as never }, fn);
}

function makeUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    sub: 'user-1',
    tenantId: 'tenant-1',
    email: 'a@b.com',
    role: 'OWNER',
    moduleAccess: [],
    mustChangePassword: false,
    ...overrides,
  };
}

/** Mismo patrón que signup.service.spec.ts: $transaction sólo corre el
 * callback contra el fake tx, sin abrir nada real - confirmCode() abre su
 * propio withTenantContext(this.prisma, ...) internamente. */
function makePrisma(fakeTx: Record<string, unknown>) {
  const txWithExecuteRaw = { $executeRaw: jest.fn().mockResolvedValue(undefined), ...fakeTx };
  return { $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(txWithExecuteRaw)) } as unknown as PrismaService;
}

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

describe('WhatsAppLinkService', () => {
  describe('requestLink', () => {
    it('normalizes the phone, generates a 6-digit code and stores only its hash', async () => {
      const upsert = jest.fn().mockResolvedValue({});
      const db = {
        whatsAppLink: { findUnique: jest.fn().mockResolvedValue(null) },
        whatsAppLinkRequest: { findUnique: jest.fn().mockResolvedValue(null), upsert },
      };
      const service = new WhatsAppLinkService(makePrisma({}));

      const result = await runInTenant(db, () => service.requestLink(makeUser(), '+54 9 11 1234-5678'));

      expect(result.phoneE164).toBe('+5491112345678');
      expect(result.code).toMatch(/^\d{6}$/);
      expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
      const upsertArgs = upsert.mock.calls[0][0];
      expect(upsertArgs.create.codeHash).toBe(hashCode(result.code));
      expect(upsertArgs.create.codeHash).not.toBe(result.code);
      expect(upsertArgs.create.phoneE164).toBe('+5491112345678');
    });

    it('rejects a phone with too few digits', async () => {
      const db = { whatsAppLink: { findUnique: jest.fn() }, whatsAppLinkRequest: { findUnique: jest.fn() } };
      const service = new WhatsAppLinkService(makePrisma({}));

      await expect(runInTenant(db, () => service.requestLink(makeUser(), '123'))).rejects.toThrow(/inválido/i);
    });

    it('refuses to issue a new code when the user already has a verified link', async () => {
      const db = {
        whatsAppLink: { findUnique: jest.fn().mockResolvedValue({ id: 'link-1', phoneE164: '+5491100000000' }) },
        whatsAppLinkRequest: { findUnique: jest.fn() },
      };
      const service = new WhatsAppLinkService(makePrisma({}));

      await expect(runInTenant(db, () => service.requestLink(makeUser(), '+5491112345678'))).rejects.toThrow(/ya tenés/i);
    });

    it('rejects a resend within the cooldown window', async () => {
      const db = {
        whatsAppLink: { findUnique: jest.fn().mockResolvedValue(null) },
        whatsAppLinkRequest: {
          findUnique: jest.fn().mockResolvedValue({ lastSentAt: new Date() }),
          upsert: jest.fn(),
        },
      };
      const service = new WhatsAppLinkService(makePrisma({}));

      await expect(runInTenant(db, () => service.requestLink(makeUser(), '+5491112345678'))).rejects.toThrow(/esperá/i);
    });
  });

  describe('getStatus', () => {
    it('reports not linked and no pending when neither row exists', async () => {
      const db = {
        whatsAppLink: { findUnique: jest.fn().mockResolvedValue(null) },
        whatsAppLinkRequest: { findUnique: jest.fn().mockResolvedValue(null) },
      };
      const service = new WhatsAppLinkService(makePrisma({}));

      const status = await runInTenant(db, () => service.getStatus(makeUser()));

      expect(status).toEqual({ linked: false, phoneE164: null, verifiedAt: null, pending: null });
    });

    it('reports the linked phone once verified', async () => {
      const verifiedAt = new Date();
      const db = {
        whatsAppLink: { findUnique: jest.fn().mockResolvedValue({ phoneE164: '+5491112345678', verifiedAt }) },
        whatsAppLinkRequest: { findUnique: jest.fn().mockResolvedValue(null) },
      };
      const service = new WhatsAppLinkService(makePrisma({}));

      const status = await runInTenant(db, () => service.getStatus(makeUser()));

      expect(status).toEqual({ linked: true, phoneE164: '+5491112345678', verifiedAt, pending: null });
    });

    it('ignores an expired pending request', async () => {
      const db = {
        whatsAppLink: { findUnique: jest.fn().mockResolvedValue(null) },
        whatsAppLinkRequest: {
          findUnique: jest.fn().mockResolvedValue({ phoneE164: '+5491112345678', expiresAt: new Date(Date.now() - 1000) }),
        },
      };
      const service = new WhatsAppLinkService(makePrisma({}));

      const status = await runInTenant(db, () => service.getStatus(makeUser()));

      expect(status.pending).toBeNull();
    });
  });

  describe('confirmCode', () => {
    it('creates the link and deletes the pending request when the code matches', async () => {
      const code = '123456';
      const create = jest.fn().mockResolvedValue({});
      const del = jest.fn().mockResolvedValue({});
      const fakeTx = {
        whatsAppLinkRequest: {
          findUnique: jest.fn().mockResolvedValue({
            phoneE164: '+5491112345678',
            codeHash: hashCode(code),
            expiresAt: new Date(Date.now() + 60_000),
            attemptCount: 0,
          }),
          delete: del,
        },
        whatsAppLink: { create },
      };
      const service = new WhatsAppLinkService(makePrisma(fakeTx));

      const outcome = await service.confirmCode('tenant-1', 'user-1', '+5491112345678', code);

      expect(outcome).toBe('ok');
      expect(create).toHaveBeenCalledWith({ data: { tenantId: 'tenant-1', userId: 'user-1', phoneE164: '+5491112345678' } });
      expect(del).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
    });

    it('returns not-found when there is no pending request for that user/phone', async () => {
      const fakeTx = { whatsAppLinkRequest: { findUnique: jest.fn().mockResolvedValue(null) } };
      const service = new WhatsAppLinkService(makePrisma(fakeTx));

      const outcome = await service.confirmCode('tenant-1', 'user-1', '+5491112345678', '123456');

      expect(outcome).toBe('not-found');
    });

    it('returns not-found when the phone does not match the pending request', async () => {
      const fakeTx = {
        whatsAppLinkRequest: {
          findUnique: jest.fn().mockResolvedValue({ phoneE164: '+5490000000000', codeHash: hashCode('123456'), expiresAt: new Date(Date.now() + 60_000), attemptCount: 0 }),
        },
      };
      const service = new WhatsAppLinkService(makePrisma(fakeTx));

      const outcome = await service.confirmCode('tenant-1', 'user-1', '+5491112345678', '123456');

      expect(outcome).toBe('not-found');
    });

    it('returns invalid and increments attemptCount on a wrong code', async () => {
      const update = jest.fn().mockResolvedValue({});
      const fakeTx = {
        whatsAppLinkRequest: {
          findUnique: jest.fn().mockResolvedValue({
            phoneE164: '+5491112345678',
            codeHash: hashCode('123456'),
            expiresAt: new Date(Date.now() + 60_000),
            attemptCount: 0,
          }),
          update,
        },
      };
      const service = new WhatsAppLinkService(makePrisma(fakeTx));

      const outcome = await service.confirmCode('tenant-1', 'user-1', '+5491112345678', '000000');

      expect(outcome).toBe('invalid');
      expect(update).toHaveBeenCalledWith({ where: { userId: 'user-1' }, data: { attemptCount: { increment: 1 } } });
    });

    it('returns invalid when the code expired', async () => {
      const fakeTx = {
        whatsAppLinkRequest: {
          findUnique: jest.fn().mockResolvedValue({
            phoneE164: '+5491112345678',
            codeHash: hashCode('123456'),
            expiresAt: new Date(Date.now() - 1000),
            attemptCount: 0,
          }),
        },
      };
      const service = new WhatsAppLinkService(makePrisma(fakeTx));

      const outcome = await service.confirmCode('tenant-1', 'user-1', '+5491112345678', '123456');

      expect(outcome).toBe('invalid');
    });

    it('returns too-many-attempts once the cap is reached', async () => {
      const fakeTx = {
        whatsAppLinkRequest: {
          findUnique: jest.fn().mockResolvedValue({
            phoneE164: '+5491112345678',
            codeHash: hashCode('123456'),
            expiresAt: new Date(Date.now() + 60_000),
            attemptCount: 5,
          }),
        },
      };
      const service = new WhatsAppLinkService(makePrisma(fakeTx));

      const outcome = await service.confirmCode('tenant-1', 'user-1', '+5491112345678', '123456');

      expect(outcome).toBe('too-many-attempts');
    });
  });

  describe('unlink', () => {
    it('deletes the link for this user', async () => {
      const deleteMany = jest.fn().mockResolvedValue({ count: 1 });
      const db = { whatsAppLink: { deleteMany } };
      const service = new WhatsAppLinkService(makePrisma({}));

      await runInTenant(db, () => service.unlink(makeUser()));

      expect(deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
    });
  });
});
