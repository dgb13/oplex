import { tenantContextStorage } from '@plexo/database';
import type { PrismaService } from '@plexo/database';

jest.mock('@plexo/companies', () => ({
  COMPANY_ROLE_EDITORS: { CUSTOMER: ['OWNER', 'ADMIN', 'SALES'], SUPPLIER: [], BRANCH: [] },
}));

import { AssistantHistoryService, startOfArgentinaDay } from './assistant-history.service.js';

function runInTenant<T>(db: Record<string, unknown>, fn: () => T): T {
  return tenantContextStorage.run({ tenantId: 'tenant-1', userId: 'user-1', tx: db as never }, fn);
}

const t = (iso: string) => new Date(iso);

function message(overrides: Record<string, unknown>) {
  return {
    id: 'm',
    conversationId: 'conv-1',
    role: 'USER',
    content: '',
    channel: 'WEB',
    intent: null,
    toolCalls: null,
    feedback: null,
    blockedTopic: null,
    createdAt: t('2026-10-19T12:00:00Z'),
    conversation: { userId: 'user-1' },
    ...overrides,
  };
}

function makeDb(questions: unknown[], nearby: unknown[], users: unknown[] = [], actions: unknown[] = []) {
  return {
    assistantMessage: {
      findMany: jest.fn().mockResolvedValueOnce(questions).mockResolvedValueOnce(nearby),
    },
    user: { findMany: jest.fn().mockResolvedValue(users) },
    assistantAction: { findMany: jest.fn().mockResolvedValue(actions) },
  };
}

describe('AssistantHistoryService', () => {
  const service = new AssistantHistoryService({} as PrismaService);

  describe('list', () => {
    it('pairs each question with the assistant message that follows it in its conversation', async () => {
      const q1 = message({ id: 'q1', content: '¿Cuánto nos debe Norte?', createdAt: t('2026-10-19T12:00:00Z') });
      const r1 = message({
        id: 'r1',
        role: 'ASSISTANT',
        content: 'Debe $ 342.000',
        intent: 'DATOS',
        toolCalls: [{ tool: 'deuda_por_cliente', data: [] }],
        feedback: 'UP',
        createdAt: t('2026-10-19T12:00:05Z'),
      });
      const q2 = message({
        id: 'q2',
        conversationId: 'conv-2',
        channel: 'WHATSAPP',
        content: '¿Cómo cargo un cliente?',
        createdAt: t('2026-10-19T11:00:00Z'),
        conversation: { userId: 'user-2' },
      });
      const r2 = message({ id: 'r2', conversationId: 'conv-2', role: 'ASSISTANT', content: 'Andá a Clientes', intent: 'AYUDA', createdAt: t('2026-10-19T11:00:03Z') });
      const db = makeDb([q1, q2], [q2, r2, q1, r1], [
        { id: 'user-1', name: 'Lucía Gómez', email: 'l@x.com', roles: ['OWNER'] },
        { id: 'user-2', name: null, email: 'm@x.com', roles: ['SALES'] },
      ]);

      const page = await runInTenant(db, () => service.list());

      expect(page.nextCursor).toBeNull();
      expect(page.entries).toEqual([
        expect.objectContaining({
          id: 'q1',
          channel: 'WEB',
          user: { id: 'user-1', name: 'Lucía Gómez', roles: ['OWNER'] },
          answer: 'Debe $ 342.000',
          status: 'ANSWERED_WITH_DATA',
          tools: ['deuda por cliente'],
          feedback: 'UP',
        }),
        expect.objectContaining({
          id: 'q2',
          channel: 'WHATSAPP',
          user: { id: 'user-2', name: 'm@x.com', roles: ['SALES'] },
          status: 'HELP',
          tools: [],
        }),
      ]);
    });

    it('marks a question with no reply after it as NO_REPLY instead of borrowing the next question', async () => {
      const q1 = message({ id: 'q1', createdAt: t('2026-10-19T12:00:00Z') });
      const q2 = message({ id: 'q2', createdAt: t('2026-10-19T12:01:00Z') });
      const db = makeDb([q2, q1], [q1, q2]);

      const page = await runInTenant(db, () => service.list());

      expect(page.entries.map((e) => [e.id, e.status, e.answer])).toEqual([
        ['q2', 'NO_REPLY', null],
        ['q1', 'NO_REPLY', null],
      ]);
    });

    it('flags a data question answered without tools (WhatsApp stores only the tool name)', async () => {
      const q = message({ id: 'q', channel: 'WHATSAPP' });
      const withoutTools = message({ id: 'r', role: 'ASSISTANT', intent: 'DATOS', toolCalls: null, createdAt: t('2026-10-19T12:00:02Z') });
      const db = makeDb([q], [q, withoutTools]);

      const page = await runInTenant(db, () => service.list());

      expect(page.entries[0].status).toBe('ANSWERED_WITHOUT_DATA');

      const q2 = message({ id: 'q2', channel: 'WHATSAPP' });
      const withTool = message({ id: 'r2', role: 'ASSISTANT', intent: 'DATOS', toolCalls: [{ tool: 'saldo_caja' }], createdAt: t('2026-10-19T12:00:02Z') });
      const page2 = await runInTenant(makeDb([q2], [q2, withTool]), () => service.list());

      expect(page2.entries[0]).toEqual(expect.objectContaining({ status: 'ANSWERED_WITH_DATA', tools: ['saldo de caja'] }));
    });

    it('marks a question denied by topic permissions as BLOCKED, with the topic name', async () => {
      const q = message({ id: 'q', blockedTopic: 'ventas' });
      const r = message({ id: 'r', role: 'ASSISTANT', intent: 'DATOS', blockedTopic: 'ventas', createdAt: t('2026-10-19T12:00:01Z') });
      const db = makeDb([q], [q, r]);

      const page = await runInTenant(db, () => service.list({ onlyBlocked: true }));

      expect(page.entries[0]).toEqual(expect.objectContaining({ status: 'BLOCKED', blockedTopic: 'Ventas y facturación' }));
      expect(db.assistantMessage.findMany).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ where: { role: 'USER', blockedTopic: { not: null } } }),
      );
    });

    it('attaches the action the turn produced, undoable only when done and reversible', async () => {
      const q = message({ id: 'q' });
      const r = message({ id: 'r', role: 'ASSISTANT', intent: 'DATOS', createdAt: t('2026-10-19T12:00:02Z') });
      const act = {
        id: 'act-1',
        questionMessageId: 'q',
        kind: 'REMINDER_CREATE',
        level: 'DRAFT',
        status: 'DONE',
        summary: 'Recordatorio “Llamar a Pérez”',
        errorMessage: null,
        entityId: 'ev-1',
      };
      const db = makeDb([q], [q, r], [], [act]);

      const page = await runInTenant(db, () => service.list());

      expect(page.entries[0].action).toEqual({
        id: 'act-1',
        label: 'Agendar recordatorio o tarea',
        level: 'DRAFT',
        status: 'DONE',
        summary: 'Recordatorio “Llamar a Pérez”',
        errorMessage: null,
        undoable: true,
      });
    });

    it('returns a cursor when there are more questions than the page size', async () => {
      const questions = [
        message({ id: 'q3', createdAt: t('2026-10-19T12:03:00Z') }),
        message({ id: 'q2', createdAt: t('2026-10-19T12:02:00Z') }),
        message({ id: 'q1', createdAt: t('2026-10-19T12:01:00Z') }),
      ];
      const db = makeDb(questions, questions.slice(0, 2).reverse());

      const page = await runInTenant(db, () => service.list({ limit: 2, channel: 'WHATSAPP' as never }));

      expect(page.entries.map((e) => e.id)).toEqual(['q3', 'q2']);
      expect(page.nextCursor).toBe('2026-10-19T12:02:00.000Z');
      expect(db.assistantMessage.findMany).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ where: { role: 'USER', channel: 'WHATSAPP' }, take: 3 }),
      );
    });

    it('returns an empty page without further queries when there are no questions', async () => {
      const db = makeDb([], []);

      const page = await runInTenant(db, () => service.list());

      expect(page).toEqual({ entries: [], nextCursor: null });
      expect(db.assistantMessage.findMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('startOfArgentinaDay', () => {
    it('uses midnight in Argentina (UTC-3), not UTC', () => {
      // 01:30 UTC del 20/10 = 22:30 del 19/10 en Argentina.
      expect(startOfArgentinaDay(t('2026-10-20T01:30:00Z')).toISOString()).toBe('2026-10-19T03:00:00.000Z');
      expect(startOfArgentinaDay(t('2026-10-20T03:00:00Z')).toISOString()).toBe('2026-10-20T03:00:00.000Z');
    });
  });
});
