import { tenantContextStorage } from '@plexo/database';
import type { AuthenticatedUser } from '@plexo/types';
import { AssistantConversationService } from './assistant-conversation.service.js';
import type { AssistantSettingsService } from './assistant-settings.service.js';

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

const DEFAULT_SETTINGS = { assistantDisplayName: null, assistantRateLimitWindowMinutes: 5, assistantRateLimitMaxMessages: 20 };

function makeSettingsService(overrides: Partial<typeof DEFAULT_SETTINGS> = {}) {
  return { getSettings: jest.fn().mockResolvedValue({ ...DEFAULT_SETTINGS, ...overrides }) } as unknown as AssistantSettingsService;
}

describe('AssistantConversationService', () => {
  describe('getOrCreateActive', () => {
    it('returns the most recently created conversation for this user', async () => {
      const found = { id: 'conv-1', userId: 'user-1' };
      const db = { assistantConversation: { findFirst: jest.fn().mockResolvedValue(found), create: jest.fn() } };
      const service = new AssistantConversationService(makeSettingsService());

      const result = await runInTenant(db, () => service.getOrCreateActive(makeUser()));

      expect(db.assistantConversation.findFirst).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: { createdAt: 'desc' },
      });
      expect(db.assistantConversation.create).not.toHaveBeenCalled();
      expect(result).toBe(found);
    });

    it('creates a new conversation when the user has none yet', async () => {
      const created = { id: 'conv-new', userId: 'user-1' };
      const db = {
        assistantConversation: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue(created) },
      };
      const service = new AssistantConversationService(makeSettingsService());

      const result = await runInTenant(db, () => service.getOrCreateActive(makeUser()));

      expect(db.assistantConversation.create).toHaveBeenCalledWith({
        data: { tenantId: 'tenant-1', userId: 'user-1' },
      });
      expect(result).toBe(created);
    });
  });

  describe('getRecentHistory', () => {
    it('maps DB role (USER/ASSISTANT) to Anthropic role (user/assistant) and re-orders oldest-first', async () => {
      const db = {
        assistantConversation: { findFirst: jest.fn().mockResolvedValue({ id: 'conv-1' }), create: jest.fn() },
        assistantMessage: {
          findMany: jest.fn().mockResolvedValue([
            { role: 'ASSISTANT', content: 'segunda' },
            { role: 'USER', content: 'primera' },
          ]),
        },
      };
      const service = new AssistantConversationService(makeSettingsService());

      const { conversationId, history } = await runInTenant(db, () => service.getRecentHistory(makeUser()));

      expect(conversationId).toBe('conv-1');
      expect(history).toEqual([
        { role: 'user', content: 'primera' },
        { role: 'assistant', content: 'segunda' },
      ]);
    });
  });

  describe('assertNotRateLimited', () => {
    it('allows the request when under the configured limit', async () => {
      const db = { assistantMessage: { count: jest.fn().mockResolvedValue(19) } };
      const service = new AssistantConversationService(makeSettingsService({ assistantRateLimitMaxMessages: 20 }));

      await expect(runInTenant(db, () => service.assertNotRateLimited(makeUser()))).resolves.toBeUndefined();
    });

    it('rejects once the configured limit is reached', async () => {
      const db = { assistantMessage: { count: jest.fn().mockResolvedValue(20) } };
      const service = new AssistantConversationService(makeSettingsService({ assistantRateLimitMaxMessages: 20 }));

      await expect(runInTenant(db, () => service.assertNotRateLimited(makeUser()))).rejects.toThrow(/Demasiadas consultas/);
    });
  });

  describe('setFeedback', () => {
    it('rejects when the message belongs to a different user', async () => {
      const db = {
        assistantMessage: {
          findUnique: jest.fn().mockResolvedValue({ id: 'msg-1', role: 'ASSISTANT', conversation: { userId: 'other-user' } }),
        },
      };
      const service = new AssistantConversationService(makeSettingsService());

      await expect(runInTenant(db, () => service.setFeedback(makeUser(), 'msg-1', 'UP'))).rejects.toThrow(/otra persona/);
    });

    it('rejects feedback on a USER-authored message', async () => {
      const db = {
        assistantMessage: {
          findUnique: jest.fn().mockResolvedValue({ id: 'msg-1', role: 'USER', conversation: { userId: 'user-1' } }),
        },
      };
      const service = new AssistantConversationService(makeSettingsService());

      await expect(runInTenant(db, () => service.setFeedback(makeUser(), 'msg-1', 'UP'))).rejects.toThrow(/respuesta del asistente/);
    });

    it('saves feedback on the caller-owned assistant message', async () => {
      const db = {
        assistantMessage: {
          findUnique: jest.fn().mockResolvedValue({ id: 'msg-1', role: 'ASSISTANT', conversation: { userId: 'user-1' } }),
          update: jest.fn().mockResolvedValue({ id: 'msg-1', feedback: 'UP' }),
        },
      };
      const service = new AssistantConversationService(makeSettingsService());

      const result = await runInTenant(db, () => service.setFeedback(makeUser(), 'msg-1', 'UP'));

      expect(db.assistantMessage.update).toHaveBeenCalledWith({ where: { id: 'msg-1' }, data: { feedback: 'UP' } });
      expect(result).toEqual({ id: 'msg-1', feedback: 'UP' });
    });
  });
});
