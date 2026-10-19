import { tenantContextStorage, type PrismaService } from '@plexo/database';
import type { AuthenticatedUser } from '@plexo/types';

jest.mock('@plexo/receivables', () => ({}));
jest.mock('@plexo/pos', () => ({}));
jest.mock('@plexo/reports-sales', () => ({}));
jest.mock('@plexo/inventory', () => ({}));
jest.mock('@plexo/payables', () => ({}));
jest.mock('@plexo/purchases', () => ({}));
jest.mock('@plexo/calendar', () => ({}));
jest.mock('@plexo/quotes', () => ({}));
jest.mock('@plexo/invoicing', () => ({}));
jest.mock('@plexo/mercadopago', () => ({}));
jest.mock('@plexo/tenant-settings', () => ({ resolveEmailFrom: () => undefined }));
jest.mock('@plexo/companies', () => ({
  COMPANY_ROLE_EDITORS: { CUSTOMER: ['OWNER', 'ADMIN', 'SALES'], SUPPLIER: [], BRANCH: [] },
}));

import type { CalendarEventService } from '@plexo/calendar';
import type { CompaniesService } from '@plexo/companies';
import type { InvoicingService } from '@plexo/invoicing';
import type { MercadoPagoPaymentService } from '@plexo/mercadopago';
import type { QuoteService } from '@plexo/quotes';
import type { TenantSettingsService } from '@plexo/tenant-settings';
import {
  accessFromConfig,
  normalizeActionLevels,
  normalizeActionRoles,
  type AssistantAccess,
  type AssistantAccessService,
} from './assistant-access.service.js';
import { AssistantActionsService, parseInvoiceReference, type ActionTurn } from './assistant-actions.service.js';
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

function makeDb<T extends Record<string, unknown>>(overrides: T = {} as T) {
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
    $executeRaw: jest.fn().mockResolvedValue(0),
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
  const quotes = {
    create: jest.fn().mockResolvedValue({ id: 'quote-1', number: 'MR-000045', total: '155519.00' }),
    sendEmail: jest.fn().mockResolvedValue({}),
    get: jest.fn().mockResolvedValue({ sentAt: null }),
    cancel: jest.fn(),
  } as unknown as QuoteService;
  const accessService = { resolve: jest.fn().mockResolvedValue(resolvedAccess) } as unknown as AssistantAccessService;
  const payments = {
    createPaymentLink: jest.fn().mockResolvedValue({ id: 'pi-1', initPoint: 'https://mpago.la/abc', amount: '54300' }),
  } as unknown as MercadoPagoPaymentService;
  const invoicing = { emailPaymentLink: jest.fn().mockResolvedValue(undefined) } as unknown as InvoicingService;
  const tenantSettings = { getSettings: jest.fn().mockResolvedValue({}) } as unknown as TenantSettingsService;
  const service = new AssistantActionsService(
    {} as PrismaService,
    accessService,
    calendar,
    companies,
    quotes,
    payments,
    invoicing,
    tenantSettings,
  );
  return { service, calendar, companies, quotes, payments, invoicing, accessService };
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
      // Vuelve al punto de guardado antes de marcarla FAILED: si no, una
      // transacción abortada por Postgres no deja escribir nada más.
      expect(db.$executeRaw.mock.calls.map((c: [TemplateStringsArray]) => c[0].join(''))).toEqual([
        'SAVEPOINT assistant_action',
        'ROLLBACK TO SAVEPOINT assistant_action',
      ]);
    });
  });

  it('explains a database rejection in plain words instead of the raw Prisma message', async () => {
    const { service, calendar } = makeService();
    (calendar.create as jest.Mock).mockRejectedValue(Object.assign(new Error('Invalid `prisma.calendarEvent.create()` invocation'), { code: 'P2002' }));

    const result = await run(makeDb(), () => service.confirm(makeUser(), 'act-1'));

    expect(result.reply).toMatch(/ya hay otro registro con el mismo dato/);
    expect(result.reply).not.toMatch(/prisma/i);
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

  describe('quotes', () => {
    const CUSTOMER = { id: 'cust-1', name: 'Construcciones Delta', email: 'compras@delta.com' };
    const CEMENT = { id: 'v-cem', sku: 'CEM-50', color: null, size: null, unitPrice: '12000', article: { name: 'Cemento x 50 kg' } };
    const SHOVEL = { id: 'v-pala', sku: 'PAL-01', color: null, size: null, unitPrice: '9500', article: { name: 'Pala ancha' } };

    function quoteDb(overrides: Record<string, unknown> = {}) {
      const findVariants = jest.fn().mockImplementation(({ where }) => {
        const sku = where.sku?.equals;
        const name = where.article?.name?.contains;
        if (sku) return Promise.resolve([]);
        if (name === 'cemento') return Promise.resolve([CEMENT]);
        if (name === 'pala') return Promise.resolve([SHOVEL]);
        if (name === 'arena') return Promise.resolve([]);
        return Promise.resolve([]);
      });
      return makeDb({
        company: {
          findFirst: jest.fn().mockResolvedValue(null),
          findMany: jest.fn().mockImplementation(({ where }) =>
            Promise.resolve(where.name?.equals ? [] : [CUSTOMER]),
          ),
        },
        articleVariant: { findMany: findVariants },
        currency: { findFirst: jest.fn().mockResolvedValue({ id: 'ars', code: 'ARS' }) },
        ...overrides,
      });
    }

    const both = { cotizacion: 'DRAFT', correo: 'DRAFT' };

    it('builds the proposal from the system: customer, article prices and a subtotal without VAT', async () => {
      const { service, quotes } = makeService();
      const db = quoteDb();

      const outcome = await run(db, () =>
        service.propose(
          makeUser(),
          access(both),
          'crear_cotizacion',
          { cliente: 'delta', lineas: [{ articulo: 'cemento', cantidad: 10 }, { articulo: 'pala', cantidad: 2 }], enviarPorCorreo: true },
          TURN,
        ),
      );

      const created = db.assistantAction.create.mock.calls[0][0].data;
      expect(created.payload).toEqual(
        expect.objectContaining({
          customerId: 'cust-1',
          currencyId: 'ars',
          sendEmail: true,
          lines: [
            { articleVariantId: 'v-cem', label: 'Cemento x 50 kg (CEM-50)', quantity: 10, unitPrice: 12000 },
            { articleVariantId: 'v-pala', label: 'Pala ancha (PAL-01)', quantity: 2, unitPrice: 9500 },
          ],
        }),
      );
      expect(created.summary).toContain('subtotal sin IVA ARS 139.000,00');
      expect(created.summary).toContain('mandarla por correo a compras@delta.com');
      expect(quotes.create).not.toHaveBeenCalled();
      expect(outcome.isError).toBe(false);
    });

    it('does not plan to email it when sending quotes is not enabled for the person, and says why', async () => {
      const { service } = makeService();
      const db = quoteDb();

      await run(db, () =>
        service.propose(
          makeUser(),
          access({ cotizacion: 'DRAFT', correo: 'OFF' }),
          'crear_cotizacion',
          { cliente: 'delta', lineas: [{ articulo: 'cemento', cantidad: 1 }], enviarPorCorreo: true },
          TURN,
        ),
      );

      const created = db.assistantAction.create.mock.calls[0][0].data;
      expect(created.payload.sendEmail).toBe(false);
      expect(created.summary).toMatch(/no se manda por correo: esa acción no está habilitada/);
    });

    it('refuses over the WhatsApp cap, pointing to the web', async () => {
      const { service } = makeService();
      const capped = access(both);
      capped.limits.maxQuoteAmountWhatsapp = 100000;

      const outcome = await run(quoteDb(), () =>
        service.propose(makeUser(), capped, 'crear_cotizacion', { cliente: 'delta', lineas: [{ articulo: 'cemento', cantidad: 10 }] }, TURN),
      );

      expect(outcome).toEqual(expect.objectContaining({ isError: true, content: expect.stringMatching(/tope por WhatsApp.*desde la web/) }));
    });

    it('asks which one when an article matches several, and refuses an article without a sale price', async () => {
      const { service } = makeService();
      const several = quoteDb({
        articleVariant: {
          findMany: jest.fn().mockImplementation(({ where }) =>
            Promise.resolve(where.sku ? [] : [CEMENT, { ...CEMENT, id: 'v-cem25', sku: 'CEM-25', article: { name: 'Cemento x 25 kg' } }]),
          ),
        },
      });
      const ambiguous = await run(several, () =>
        service.propose(makeUser(), access(both), 'crear_cotizacion', { cliente: 'delta', lineas: [{ articulo: 'cemento', cantidad: 1 }] }, TURN),
      );
      expect(ambiguous.content).toMatch(/Cemento x 50 kg \(CEM-50\), Cemento x 25 kg \(CEM-25\)/);

      const noPrice = quoteDb({
        articleVariant: { findMany: jest.fn().mockImplementation(({ where }) => Promise.resolve(where.sku ? [] : [{ ...CEMENT, unitPrice: '0' }])) },
      });
      const free = await run(noPrice, () =>
        service.propose(makeUser(), access(both), 'crear_cotizacion', { cliente: 'delta', lineas: [{ articulo: 'cemento', cantidad: 1 }] }, TURN),
      );
      expect(free.content).toMatch(/no tiene precio de venta/);
    });

    it('on "SÍ" creates the quote with the proposed lines and emails it; the real total comes from the quote', async () => {
      const { service, quotes } = makeService(access(both));
      const db = makeDb();
      db.assistantAction.findUnique.mockResolvedValue(
        action({
          kind: 'QUOTE_CREATE',
          payload: {
            customerId: 'cust-1',
            customerName: 'Construcciones Delta',
            customerEmail: 'compras@delta.com',
            currencyId: 'ars',
            currencyCode: 'ARS',
            lines: [{ articleVariantId: 'v-cem', label: 'Cemento', quantity: 10, unitPrice: 12000 }],
            notes: null,
            sendEmail: true,
          },
        }),
      );

      const result = await run(db, () => service.confirm(makeUser(), 'act-1'));

      expect(quotes.create).toHaveBeenCalledWith({
        customerId: 'cust-1',
        currencyId: 'ars',
        notes: undefined,
        lines: [{ articleVariantId: 'v-cem', quantity: 10, unitPrice: 12000 }],
      });
      expect(quotes.sendEmail).toHaveBeenCalledWith('quote-1');
      expect(result.reply).toMatch(/Cotización MR-000045.*ARS 155\.519,00.*se mandó a compras@delta\.com/);
    });

    it('keeps the quote done when the email fails, and says so', async () => {
      const { service, quotes } = makeService(access(both));
      (quotes.sendEmail as jest.Mock).mockRejectedValue(new Error('Resend caído'));
      const db = makeDb();
      db.assistantAction.findUnique.mockResolvedValue(
        action({
          kind: 'QUOTE_CREATE',
          payload: { customerId: 'c', customerName: 'Delta', customerEmail: 'x@y.com', currencyId: 'ars', currencyCode: 'ARS', lines: [], notes: null, sendEmail: true },
        }),
      );

      const result = await run(db, () => service.confirm(makeUser(), 'act-1'));

      expect(result.card.status).toBe('DONE');
      expect(result.reply).toMatch(/no se pudo mandar el correo \(Resend caído\)/);
    });

    it('finds an existing quote by its short number to email it, asking when the number is ambiguous', async () => {
      const { service } = makeService();
      const one = makeDb({
        quote: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'q-45', number: 'MR-000045', status: 'DRAFT', total: '1000', customer: { name: 'Delta', email: 'compras@delta.com' }, currency: { code: 'ARS' } },
          ]),
        },
      });
      await run(one, () => service.propose(makeUser(), access(both), 'enviar_cotizacion_por_correo', { numero: '45' }, TURN));
      expect(one.quote.findMany.mock.calls[0][0].where.OR).toContainEqual({ number: { endsWith: '-000045' } });
      expect(one.assistantAction.create.mock.calls[0][0].data.summary).toBe(
        'Mandar la Cotización MR-000045 (Delta, ARS 1.000,00) a compras@delta.com',
      );

      const two = makeDb({
        quote: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'a', number: 'MR-000045', status: 'DRAFT', total: '1', customer: { name: 'Delta', email: 'x' }, currency: { code: 'ARS' } },
            { id: 'b', number: 'JP-000045', status: 'DRAFT', total: '1', customer: { name: 'Sol', email: 'y' }, currency: { code: 'ARS' } },
          ]),
        },
      });
      const outcome = await run(two, () => service.propose(makeUser(), access(both), 'enviar_cotizacion_por_correo', { numero: '45' }, TURN));
      expect(outcome.content).toMatch(/MR-000045 \(Delta\), JP-000045 \(Sol\)/);
    });

    it('cancels an undone quote, but not one that already reached the customer', async () => {
      const { service, quotes } = makeService();
      const db = makeDb();
      db.assistantAction.findUnique.mockResolvedValue(action({ kind: 'QUOTE_CREATE', status: 'DONE', entityType: 'quote', entityId: 'quote-1' }));

      await run(db, () => service.undo(makeUser(), 'act-1'));
      expect(quotes.cancel).toHaveBeenCalledWith('quote-1');

      (quotes.get as jest.Mock).mockResolvedValue({ sentAt: new Date() });
      await expect(run(db, () => service.undo(makeUser(), 'act-1'))).rejects.toThrow(/ya se le mandó al cliente/);
    });
  });

  describe('payment link', () => {
    const INVOICE = {
      id: 'inv-120',
      documentLetter: 'B',
      pointOfSale: '00003',
      number: '00000120',
      balanceDue: '54300',
      customer: { name: 'Kiosco Sol', email: 'pagos@kioscosol.com' },
      currency: { code: 'ARS' },
    };

    it('reads "120", "A 3-120" and "00003-00000120" the way invoices are stored', () => {
      expect(parseInvoiceReference('120')).toEqual({ letter: undefined, number: '00000120' });
      expect(parseInvoiceReference('A 3-120')).toEqual({ letter: 'A', pointOfSale: '00003', number: '00000120' });
      expect(parseInvoiceReference('factura b 00003-00000120')).toEqual({ letter: 'B', pointOfSale: '00003', number: '00000120' });
      expect(parseInvoiceReference('la de ayer')).toBeNull();
    });

    it('proposes emailing the link for the current balance, without creating anything yet', async () => {
      const { service, payments, invoicing } = makeService();
      const db = makeDb({ invoice: { findMany: jest.fn().mockResolvedValue([INVOICE]) } });

      await run(db, () => service.propose(makeUser(), access({ link: 'DRAFT' }), 'mandar_link_de_pago', { factura: '120' }, TURN));

      expect(db.invoice.findMany.mock.calls[0][0].where).toEqual(
        expect.objectContaining({ number: '00000120', status: { not: 'CANCELLED' } }),
      );
      expect(db.assistantAction.create.mock.calls[0][0].data.summary).toBe(
        'Link de Mercado Pago de la Factura B 00003-00000120 (Kiosco Sol, saldo ARS 54.300,00) por correo a pagos@kioscosol.com',
      );
      expect(payments.createPaymentLink).not.toHaveBeenCalled();
      expect(invoicing.emailPaymentLink).not.toHaveBeenCalled();
    });

    it('asks which invoice when the number repeats, and refuses one without balance or customer email', async () => {
      const { service } = makeService();
      const two = makeDb({
        invoice: { findMany: jest.fn().mockResolvedValue([INVOICE, { ...INVOICE, id: 'x', documentLetter: 'A', customer: { name: 'Delta', email: 'd@x.com' } }]) },
      });
      const ambiguous = await run(two, () => service.propose(makeUser(), access({ link: 'DRAFT' }), 'mandar_link_de_pago', { factura: '120' }, TURN));
      expect(ambiguous.content).toMatch(/Factura B 00003-00000120 \(Kiosco Sol\), Factura A 00003-00000120 \(Delta\)/);

      const paid = makeDb({ invoice: { findMany: jest.fn().mockResolvedValue([{ ...INVOICE, balanceDue: '0' }]) } });
      const noBalance = await run(paid, () => service.propose(makeUser(), access({ link: 'DRAFT' }), 'mandar_link_de_pago', { factura: '120' }, TURN));
      expect(noBalance.content).toMatch(/no tiene saldo pendiente/);

      const noMail = makeDb({ invoice: { findMany: jest.fn().mockResolvedValue([{ ...INVOICE, customer: { name: 'Kiosco Sol', email: null } }]) } });
      const withoutEmail = await run(noMail, () => service.propose(makeUser(), access({ link: 'DRAFT' }), 'mandar_link_de_pago', { factura: '120' }, TURN));
      expect(withoutEmail.content).toMatch(/no tiene email cargado/);
    });

    it('on "SÍ" creates the Mercado Pago link and emails it to the customer', async () => {
      const { service, payments, invoicing } = makeService(access({ link: 'DRAFT' }));
      const db = makeDb({ tenant: { findUnique: jest.fn().mockResolvedValue({ name: 'Ferretería Demo' }) } });
      db.assistantAction.findUnique.mockResolvedValue(
        action({
          kind: 'PAYMENT_LINK',
          payload: { invoiceId: 'inv-120', invoiceLabel: 'Factura B 00003-00000120', customerName: 'Kiosco Sol', email: 'pagos@kioscosol.com', currencyCode: 'ARS' },
        }),
      );

      const result = await run(db, () => service.confirm(makeUser(), 'act-1'));

      expect(payments.createPaymentLink).toHaveBeenCalledWith({ documentType: 'INVOICE', documentId: 'inv-120' });
      expect(invoicing.emailPaymentLink).toHaveBeenCalledWith({
        to: 'pagos@kioscosol.com',
        invoiceLabel: 'Factura B 00003-00000120',
        amount: '54.300,00',
        currencyCode: 'ARS',
        url: 'https://mpago.la/abc',
        businessName: 'Ferretería Demo',
        from: undefined,
      });
      expect(result.reply).toMatch(/se mandó a pagos@kioscosol\.com el link de pago/);
    });

    it('reports it as not done when Mercado Pago is not connected', async () => {
      const { service, payments, invoicing } = makeService(access({ link: 'DRAFT' }));
      (payments.createPaymentLink as jest.Mock).mockRejectedValue(new Error('Esta empresa todavía no vinculó una cuenta de Mercado Pago'));
      const db = makeDb();
      db.assistantAction.findUnique.mockResolvedValue(
        action({ kind: 'PAYMENT_LINK', payload: { invoiceId: 'inv-120', invoiceLabel: 'F', customerName: 'K', email: 'k@x.com', currencyCode: 'ARS' } }),
      );

      const result = await run(db, () => service.confirm(makeUser(), 'act-1'));

      expect(result.card.status).toBe('FAILED');
      expect(result.reply).toMatch(/no vinculó una cuenta de Mercado Pago/);
      expect(invoicing.emailPaymentLink).not.toHaveBeenCalled();
    });
  });
});
