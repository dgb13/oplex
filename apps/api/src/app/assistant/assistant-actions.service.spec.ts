import { tenantContextStorage, type PrismaService } from '@plexo/database';
import type { AuthenticatedUser } from '@plexo/types';

jest.mock('@plexo/receivables', () => ({}));
jest.mock('@plexo/pos', () => ({}));
jest.mock('@plexo/reports-sales', () => ({}));
jest.mock('@plexo/inventory', () => ({}));
jest.mock('@plexo/payables', () => ({}));
jest.mock('@plexo/purchases', () => ({}));
jest.mock('@plexo/calendar', () => ({}));
jest.mock('@plexo/companies', () => ({
  COMPANY_ROLE_EDITORS: { CUSTOMER: ['OWNER', 'ADMIN', 'SALES'], SUPPLIER: [], BRANCH: [] },
}));

import type { CalendarEventService } from '@plexo/calendar';
import type { CompaniesService } from '@plexo/companies';
import {
  accessFromConfig,
  normalizeActionLevels,
  normalizeActionRoles,
  type AssistantAccess,
  type AssistantAccessService,
} from './assistant-access.service.js';
import { AssistantActionsService, type ActionTurn } from './assistant-actions.service.js';
import { DEFAULT_TOPICS_BY_ROLE } from './assistant-topics.js';

const TURN: ActionTurn = { conversationId: 'conv-1', questionMessageId: 'q-1', channel: 'WHATSAPP' };

function makeUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return { sub: 'user-1', tenantId: 'tenant-1', email: 'a@b.com', role: 'SALES', moduleAccess: [], mustChangePassword: false, ...overrides };
}

function access(levels: Record<string, string>, role: AuthenticatedUser['role'] = 'SALES', maxActionsPerDay = 40): AssistantAccess {
  return accessFromConfig(
    {
      webEnabled: true,
      whatsappEnabled: true,
      salesOwnDataOnly: true,
      topicsByRole: DEFAULT_TOPICS_BY_ROLE,
      actionLevels: normalizeActionLevels(levels),
      actionRoles: normalizeActionRoles(null),
      maxQuoteAmountWhatsapp: null,
      maxActionsPerDay,
      confirmExpiryMinutes: 10,
    },
    { sub: 'user-1', role },
  );
}

function action(overrides: Record<string, unknown> = {}) {
  return {
    id: 'act-1',
    tenantId: 'tenant-1',
    conversationId: 'conv-1',
    questionMessageId: 'q-1',
    userId: 'user-1',
    channel: 'WHATSAPP',
    kind: 'REMINDER_CREATE',
    level: 'DRAFT',
    status: 'PENDING_CONFIRMATION',
    payload: { title: 'Llamar a Pérez', date: '2099-01-15', time: '10:00', assignedToUserId: null },
    summary: 'Recordatorio “Llamar a Pérez”',
    entityType: null,
    entityId: null,
    expiresAt: new Date(Date.now() + 60_000),
    confirmedAt: null,
    undoneAt: null,
    undoneByUserId: null,
    errorMessage: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeDb(overrides: Record<string, unknown> = {}) {
  return {
    assistantAction: {
      count: jest.fn().mockResolvedValue(0),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve(action({ ...data, id: 'act-new' }))),
      update: jest.fn().mockImplementation(({ where, data }) => Promise.resolve(action({ id: where.id, ...data }))),
      findUnique: jest.fn().mockResolvedValue(action()),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    user: { findMany: jest.fn().mockResolvedValue([]) },
    company: { findFirst: jest.fn().mockResolvedValue(null) },
    userActivityLog: { create: jest.fn().mockResolvedValue({}) },
    ...overrides,
  };
}

function run<T>(db: Record<string, unknown>, fn: () => Promise<T>): Promise<T> {
  return tenantContextStorage.run({ tenantId: 'tenant-1', userId: 'user-1', tx: db as never }, fn);
}

function makeService(resolvedAccess: AssistantAccess = access({ recordatorio: 'DRAFT', cliente: 'DRAFT' })) {
  const calendar = { create: jest.fn().mockResolvedValue({ id: 'ev-1' }), remove: jest.fn() } as unknown as CalendarEventService;
  const companies = {
    createCompany: jest.fn().mockResolvedValue({ id: 'co-1', name: 'ACME SA' }),
    updateCompany: jest.fn(),
    lookupAfip: jest.fn(),
  } as unknown as CompaniesService;
  const accessService = { resolve: jest.fn().mockResolvedValue(resolvedAccess) } as unknown as AssistantAccessService;
  const service = new AssistantActionsService({} as PrismaService, accessService, calendar, companies);
  return { service, calendar, companies, accessService };
}

describe('AssistantActionsService', () => {
  describe('propose', () => {
    it('refuses an action the person does not have enabled, without touching anything', async () => {
      const { service, calendar } = makeService();
      const db = makeDb();

      const outcome = await run(db, () =>
        service.propose(makeUser(), access({ recordatorio: 'OFF' }), 'crear_recordatorio', { titulo: 'x', fecha: '2099-01-15' }, TURN),
      );

      expect(outcome.isError).toBe(true);
      expect(db.assistantAction.create).not.toHaveBeenCalled();
      expect(calendar.create).not.toHaveBeenCalled();
    });

    it('in Borrador, replaces any previous pending action and waits for the "SÍ" without creating the reminder', async () => {
      const { service, calendar } = makeService();
      const db = makeDb();

      const outcome = await run(db, () =>
        service.propose(
          makeUser(),
          access({ recordatorio: 'DRAFT' }),
          'crear_recordatorio',
          { titulo: 'Llamar a Pérez', fecha: '2099-01-15', hora: '10:00' },
          TURN,
        ),
      );

      expect(db.assistantAction.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', status: 'PENDING_CONFIRMATION' },
        data: { status: 'CANCELLED' },
      });
      const created = db.assistantAction.create.mock.calls[0][0].data;
      expect(created).toEqual(
        expect.objectContaining({
          status: 'PENDING_CONFIRMATION',
          level: 'DRAFT',
          kind: 'REMINDER_CREATE',
          questionMessageId: 'q-1',
          channel: 'WHATSAPP',
          expiresAt: expect.any(Date),
        }),
      );
      expect(created.summary).toMatch(/Llamar a Pérez.*a las 10:00/);
      expect(calendar.create).not.toHaveBeenCalled();
      expect(JSON.parse(outcome.content)).toEqual(expect.objectContaining({ estado: 'esperando_confirmacion' }));
      expect(JSON.parse(outcome.content).instruccion).toMatch(/SÍ/);
      expect(outcome.card).toEqual(expect.objectContaining({ type: 'assistant_action', status: 'PENDING_CONFIRMATION' }));
    });

    it('in Directa, creates it right away with the Agenda conventions and logs it in Actividad', async () => {
      const { service, calendar } = makeService();
      const db = makeDb();

      const outcome = await run(db, () =>
        service.propose(makeUser(), access({ recordatorio: 'DIRECT' }), 'crear_recordatorio', { titulo: 'Pagar luz', fecha: '2099-01-15' }, TURN),
      );

      expect(calendar.create).toHaveBeenCalledWith({
        title: 'Pagar luz',
        startsAt: '2099-01-15T12:00:00.000Z',
        allDay: true,
        kind: 'REMINDER',
        assignedTo: 'user-1',
      });
      expect(db.assistantAction.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'DONE', entityType: 'calendarEvent', entityId: 'ev-1' }) }),
      );
      expect(db.userActivityLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'calendarEvent.created', entityLabel: 'Pagar luz (por el Asistente)' }),
      });
      expect(JSON.parse(outcome.content).estado).toBe('hecha');
    });

    it('stores a timed reminder at that hour in Argentina', async () => {
      const { service, calendar } = makeService();

      await run(makeDb(), () =>
        service.propose(makeUser(), access({ recordatorio: 'DIRECT' }), 'crear_recordatorio', { titulo: 'x', fecha: '2099-01-15', hora: '10:00' }, TURN),
      );

      expect(calendar.create).toHaveBeenCalledWith(expect.objectContaining({ startsAt: '2099-01-15T13:00:00.000Z', allDay: false }));
    });

    it('asks which person when the assignee name matches more than one teammate', async () => {
      const { service } = makeService();
      const db = makeDb({
        user: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'u-2', name: 'Juan Pérez', email: 'jp@x.com' },
            { id: 'u-3', name: 'Juana Gómez', email: 'jg@x.com' },
          ]),
        },
      });

      const outcome = await run(db, () =>
        service.propose(makeUser(), access({ recordatorio: 'DRAFT' }), 'crear_recordatorio', { titulo: 'x', fecha: '2099-01-15', asignarA: 'juan' }, TURN),
      );

      expect(outcome.isError).toBe(true);
      expect(outcome.content).toMatch(/Juan Pérez, Juana Gómez/);
      expect(db.assistantAction.create).not.toHaveBeenCalled();
    });

    it('rejects a date that already passed', async () => {
      const { service } = makeService();

      const outcome = await run(makeDb(), () =>
        service.propose(makeUser(), access({ recordatorio: 'DRAFT' }), 'crear_recordatorio', { titulo: 'x', fecha: '2020-01-01' }, TURN),
      );

      expect(outcome).toEqual(expect.objectContaining({ isError: true, content: expect.stringMatching(/ya pasó/) }));
    });

    it('refuses once the company reached its daily cap of actions', async () => {
      const { service } = makeService();
      const db = makeDb();
      db.assistantAction.count.mockResolvedValue(5);

      const outcome = await run(db, () =>
        service.propose(makeUser(), access({ recordatorio: 'DRAFT' }, 'SALES', 5), 'crear_recordatorio', { titulo: 'x', fecha: '2099-01-15' }, TURN),
      );

      expect(outcome).toEqual(expect.objectContaining({ isError: true, content: expect.stringMatching(/tope de 5/) }));
    });

    it('fills a new customer from ARCA by CUIT, and refuses a CUIT that is already loaded', async () => {
      const { service, companies } = makeService();
      (companies.lookupAfip as jest.Mock).mockResolvedValue({
        name: 'ACME SA',
        taxCondition: 'Responsable Inscripto',
        fiscalAddress: 'Calle Falsa 123',
      });
      const db = makeDb();

      const outcome = await run(db, () =>
        service.propose(makeUser(), access({ cliente: 'DRAFT' }), 'cargar_cliente', { cuit: '30712345678', email: 'compras@acme.com' }, TURN),
      );

      expect(companies.lookupAfip).toHaveBeenCalledWith('30712345678');
      expect(db.assistantAction.create.mock.calls[0][0].data.payload).toEqual({
        name: 'ACME SA',
        taxId: '30-71234567-8',
        email: 'compras@acme.com',
        phone: null,
        taxCondition: 'Responsable Inscripto',
        fiscalAddress: 'Calle Falsa 123',
      });
      expect(JSON.parse(outcome.content).resumen).toMatch(/ACME SA.*30-71234567-8.*Responsable Inscripto/);

      const dupDb = makeDb({ company: { findFirst: jest.fn().mockResolvedValue({ name: 'ACME SA' }) } });
      const dup = await run(dupDb, () =>
        service.propose(makeUser(), access({ cliente: 'DRAFT' }), 'cargar_cliente', { cuit: '30-71234567-8' }, TURN),
      );
      expect(dup).toEqual(expect.objectContaining({ isError: true, content: expect.stringMatching(/Ya hay una empresa cargada/) }));
    });
  });

  describe('confirm', () => {
    it('only lets the person who asked confirm it - not even the owner on their behalf', async () => {
      const { service, calendar } = makeService();
      const db = makeDb();

      await expect(run(db, () => service.confirm(makeUser({ sub: 'owner-1', role: 'OWNER' }), 'act-1'))).rejects.toThrow(/Sólo la persona/);
      expect(calendar.create).not.toHaveBeenCalled();
    });

    it('marks an expired confirmation as EXPIRED and does nothing', async () => {
      const { service, calendar } = makeService();
      const db = makeDb();
      db.assistantAction.findUnique.mockResolvedValue(action({ expiresAt: new Date(Date.now() - 1000) }));

      const result = await run(db, () => service.confirm(makeUser(), 'act-1'));

      expect(result.card.status).toBe('EXPIRED');
      expect(result.reply).toMatch(/venció/);
      expect(calendar.create).not.toHaveBeenCalled();
    });

    it('re-checks the configuration: if the action was turned off meanwhile, it is cancelled, not executed', async () => {
      const { service, calendar } = makeService(access({ recordatorio: 'OFF' }));
      const db = makeDb();

      const result = await run(db, () => service.confirm(makeUser(), 'act-1'));

      expect(result.card.status).toBe('CANCELLED');
      expect(calendar.create).not.toHaveBeenCalled();
    });

    it('executes a pending reminder and reports it done', async () => {
      const { service, calendar } = makeService();
      const db = makeDb();

      const result = await run(db, () => service.confirm(makeUser(), 'act-1'));

      expect(calendar.create).toHaveBeenCalledWith(expect.objectContaining({ title: 'Llamar a Pérez', startsAt: '2099-01-15T13:00:00.000Z' }));
      expect(result.card.status).toBe('DONE');
      expect(result.reply).toMatch(/^Listo/);
    });

    it('leaves the action as FAILED with the reason when the real service refuses it', async () => {
      const { service, calendar } = makeService();
      (calendar.create as jest.Mock).mockRejectedValue(new Error('se cayó la base'));
      const db = makeDb();

      const result = await run(db, () => service.confirm(makeUser(), 'act-1'));

      expect(result.card.status).toBe('FAILED');
      expect(result.reply).toMatch(/se cayó la base/);
      expect(db.userActivityLog.create).not.toHaveBeenCalled();
    });
  });

  describe('handleShortReply', () => {
    it('confirms the pending action on a bare "SÍ" and cancels it on a bare "no"', async () => {
      const { service, calendar } = makeService();
      const db = makeDb();
      db.assistantAction.findFirst.mockResolvedValue(action());

      const yes = await run(db, () => service.handleShortReply(makeUser(), 'Sí!'));
      expect(yes?.card.status).toBe('DONE');
      expect(calendar.create).toHaveBeenCalledTimes(1);

      const no = await run(db, () => service.handleShortReply(makeUser(), 'no'));
      expect(no?.card.status).toBe('CANCELLED');
    });

    it('lets anything longer than a bare yes/no go to the model, and does nothing without a pending action', async () => {
      const { service, calendar } = makeService();
      const db = makeDb();
      db.assistantAction.findFirst.mockResolvedValue(action());

      await expect(run(db, () => service.handleShortReply(makeUser(), 'sí, pero cambiale la fecha al viernes'))).resolves.toBeNull();

      db.assistantAction.findFirst.mockResolvedValue(null);
      await expect(run(db, () => service.handleShortReply(makeUser(), 'sí'))).resolves.toBeNull();
      expect(calendar.create).not.toHaveBeenCalled();
    });
  });

  describe('undo', () => {
    it('deactivates a customer created by the assistant and records it', async () => {
      const { service, companies } = makeService();
      const db = makeDb();
      db.assistantAction.findUnique.mockResolvedValue(
        action({ kind: 'CUSTOMER_CREATE', status: 'DONE', entityType: 'company', entityId: 'co-1', summary: 'Cliente “ACME SA”' }),
      );

      const card = await run(db, () => service.undo(makeUser({ sub: 'owner-1', role: 'OWNER' }), 'act-1'));

      expect(companies.updateCompany).toHaveBeenCalledWith('co-1', { active: false });
      expect(card.status).toBe('UNDONE');
      expect(db.userActivityLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'company.deleted' }) });
    });

    it('does not let another non-admin user undo someone else’s action', async () => {
      const { service } = makeService();
      const db = makeDb();
      db.assistantAction.findUnique.mockResolvedValue(action({ status: 'DONE', entityId: 'ev-1' }));

      await expect(run(db, () => service.undo(makeUser({ sub: 'other', role: 'SALES' }), 'act-1'))).rejects.toThrow(/Sólo quien la pidió/);
    });
  });
});
