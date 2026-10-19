import { BadRequestException, ForbiddenException, HttpException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CalendarEventService } from '@plexo/calendar';
import { CompaniesService, type CreateCompanyDto, type UpdateCompanyDto } from '@plexo/companies';
import { QuoteService, type CreateQuoteDto } from '@plexo/quotes';
import {
  AssistantActionStatus,
  getTenantDb,
  getTenantId,
  PrismaService,
  withTenantContext,
  type AssistantAction,
  type AssistantChannel,
  type Prisma,
} from '@plexo/database';
import type { AuthenticatedUser } from '@plexo/types';
import { AssistantAccessService, type AssistantAccess } from './assistant-access.service.js';
import { actionByKind, actionByTool, type AssistantActionDef } from './assistant-actions.catalog.js';
import { startOfArgentinaDay } from './assistant-history.service.js';

/** De dónde viene la propuesta: se guarda con la acción para el Historial. */
export interface ActionTurn {
  conversationId: string;
  questionMessageId: string | null;
  channel: AssistantChannel;
}

/** Lo que el widget dibuja como tarjeta con Confirmar / Cancelar. Viaja como
 * `data` del evento tool_result y se guarda en AssistantMessage.toolCalls. */
export interface AssistantActionCard {
  type: 'assistant_action';
  id: string;
  label: string;
  status: AssistantActionStatus;
  summary: string;
  expiresAt: string | null;
}

export interface ActionToolOutcome {
  // Lo que se le devuelve al modelo como tool_result.
  content: string;
  isError: boolean;
  card?: AssistantActionCard;
}

export interface ActionReply {
  reply: string;
  card: AssistantActionCard;
}

interface Prepared {
  payload: Record<string, unknown>;
  summary: string;
}

interface Executed {
  entityType: string;
  entityId: string;
  entityLabel: string;
  done: string;
}

// "SÍ" / "NO" de quien tiene una acción esperando. Sólo el mensaje entero
// (con signos), nunca una frase que lo contenga: "sí, pero cambiale la
// fecha" tiene que llegar al modelo, no confirmar.
const YES_REPLY = /^\s*(s[ií]+|dale|ok(ey)?|confirm(o|ar|ado)|de una|listo)\s*[.!¡]*\s*$/i;
const NO_REPLY = /^\s*(no|cancel(a|ar|alo|ado)?|dejalo|nada)\s*[.!¡]*\s*$/i;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WEEKDAY_DATE = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: '2-digit', month: '2-digit', timeZone: 'UTC' });
const MONEY = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const QTY = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 3 });
// Una cotización larga se arma mejor desde la web, donde se ve entera.
const MAX_QUOTE_LINES = 20;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatMoney(value: number): string {
  return MONEY.format(value);
}

function formatQty(value: number): string {
  return QTY.format(value);
}

function str(input: unknown, key: string): string {
  const value = (input as Record<string, unknown> | null | undefined)?.[key];
  return typeof value === 'string' ? value.trim() : '';
}

function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function formatCuit(digits: string): string {
  return `${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits.slice(10)}`;
}

function errorText(err: unknown): string {
  // Errores de Prisma (P2002 = dato repetido, etc.): el texto crudo es
  // ilegible para quien pidió la acción y no le dice qué hacer.
  const prismaCode = err && typeof err === 'object' ? (err as { code?: unknown }).code : undefined;
  if (typeof prismaCode === 'string' && /^P\d{4}$/.test(prismaCode)) {
    return prismaCode === 'P2002'
      ? 'ya hay otro registro con el mismo dato (por ejemplo, el mismo número de documento). Probá hacerlo desde la web'
      : 'no se pudo guardar en la base. Probá hacerlo desde la web';
  }
  if (err instanceof HttpException) {
    const response = err.getResponse();
    const message = typeof response === 'object' && response ? (response as { message?: unknown }).message : response;
    return Array.isArray(message) ? message.join(', ') : String(message ?? err.message);
  }
  return err instanceof Error ? err.message : 'Error desconocido';
}

function toCard(action: AssistantAction, def: AssistantActionDef | undefined): AssistantActionCard {
  return {
    type: 'assistant_action',
    id: action.id,
    label: def?.label ?? action.kind,
    status: action.status,
    summary: action.summary,
    expiresAt: action.expiresAt?.toISOString() ?? null,
  };
}

/**
 * Motor de acciones del asistente (etapa 3 de
 * docs/planesdemodulos/plan-asistente-fase2-gestion-acciones.md).
 *
 * El modelo propone con una herramienta → `propose` valida (nivel, rol,
 * permiso real, tope diario), resuelve nombres y arma la vista previa con
 * datos del sistema. En Borrador queda esperando el "SÍ" de quien la pidió
 * (botón en la web, o la palabra sola por WhatsApp - reconocida acá, nunca
 * por el modelo, así no se puede autoconfirmar). En Directa se ejecuta en el
 * momento. Al confirmar se vuelve a validar todo: la configuración pudo
 * cambiar en el medio.
 *
 * Todo corre dentro del contexto del tenant y del usuario que pidió, con los
 * mismos servicios que usa la web (CalendarEventService, CompaniesService),
 * así que valen sus mismas reglas de permisos y cupos.
 */
@Injectable()
export class AssistantActionsService {
  private readonly logger = new Logger(AssistantActionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly accessService: AssistantAccessService,
    private readonly calendarEventService: CalendarEventService,
    private readonly companiesService: CompaniesService,
    private readonly quoteService: QuoteService,
  ) {}

  async propose(
    user: AuthenticatedUser,
    access: AssistantAccess,
    toolName: string,
    input: unknown,
    turn: ActionTurn,
  ): Promise<ActionToolOutcome> {
    const def = actionByTool(toolName);
    const level = def ? access.allowedActions.get(def.id) : undefined;
    if (!def || !level) {
      return { content: 'Esta persona no tiene habilitada esa acción en Preferencias › Asistente.', isError: true };
    }

    const refusal = await this.dailyLimitRefusal(access);
    if (refusal) {
      return { content: refusal, isError: true };
    }

    let prepared: Prepared;
    try {
      prepared = await this.prepare(def, input, user, access, turn);
    } catch (err) {
      // Datos faltantes o ambiguos: el modelo se lo explica / repregunta.
      return { content: errorText(err), isError: true };
    }

    const db = getTenantDb();
    if (level === 'DRAFT') {
      // Una sola pendiente por persona: una propuesta nueva reemplaza a la
      // anterior (evita que un "SÍ" confirme algo viejo que ya no se ve).
      await db.assistantAction.updateMany({
        where: { userId: user.sub, status: AssistantActionStatus.PENDING_CONFIRMATION },
        data: { status: AssistantActionStatus.CANCELLED },
      });
      const action = await db.assistantAction.create({
        data: {
          tenantId: getTenantId(),
          conversationId: turn.conversationId,
          questionMessageId: turn.questionMessageId,
          userId: user.sub,
          channel: turn.channel,
          kind: def.kind,
          level,
          status: AssistantActionStatus.PENDING_CONFIRMATION,
          payload: prepared.payload as Prisma.InputJsonValue,
          summary: prepared.summary,
          expiresAt: new Date(Date.now() + access.limits.confirmExpiryMinutes * 60_000),
        },
      });
      const howToConfirm =
        turn.channel === 'WHATSAPP'
          ? `Mostrale el resumen y pedile que responda SÍ para confirmar o NO para cancelar. Vence en ${access.limits.confirmExpiryMinutes} minutos.`
          : 'Mostrale el resumen: en la pantalla tiene los botones Confirmar y Cancelar (también puede responder SÍ o NO).';
      return {
        content: JSON.stringify({ estado: 'esperando_confirmacion', resumen: prepared.summary, instruccion: howToConfirm }),
        isError: false,
        card: toCard(action, def),
      };
    }

    // Directa: se registra y se ejecuta en el mismo paso.
    const action = await db.assistantAction.create({
      data: {
        tenantId: getTenantId(),
        conversationId: turn.conversationId,
        questionMessageId: turn.questionMessageId,
        userId: user.sub,
        channel: turn.channel,
        kind: def.kind,
        level,
        status: AssistantActionStatus.PENDING_CONFIRMATION,
        payload: prepared.payload as Prisma.InputJsonValue,
        summary: prepared.summary,
      },
    });
    const result = await this.run(action, def, user);
    return {
      content: JSON.stringify(
        result.ok ? { estado: 'hecha', resumen: result.message } : { estado: 'fallo', motivo: result.message },
      ),
      isError: !result.ok,
      card: toCard(result.action, def),
    };
  }

  /** Botón Confirmar de la web, o "SÍ" por cualquier canal. */
  async confirm(user: AuthenticatedUser, actionId: string): Promise<ActionReply> {
    const action = await this.findOwnPending(user, actionId);
    const def = actionByKind(action.kind);
    if (action.expiresAt && action.expiresAt < new Date()) {
      const expired = await getTenantDb().assistantAction.update({
        where: { id: action.id },
        data: { status: AssistantActionStatus.EXPIRED },
      });
      return { reply: 'Esa confirmación ya venció y no se hizo nada. Pedímelo de nuevo si lo necesitás.', card: toCard(expired, def) };
    }

    // La configuración o el rol pudieron cambiar desde que se propuso.
    const access = await this.accessService.resolve(user);
    if (!def || !access.allowedActions.has(def.id)) {
      const cancelled = await getTenantDb().assistantAction.update({
        where: { id: action.id },
        data: { status: AssistantActionStatus.CANCELLED, errorMessage: 'La acción se deshabilitó antes de confirmarla' },
      });
      return { reply: 'Esa acción ya no está habilitada para vos, así que no se hizo.', card: toCard(cancelled, def) };
    }

    const result = await this.run(action, def, user);
    return { reply: result.ok ? `Listo: ${result.message}.` : `No se pudo hacer: ${result.message}`, card: toCard(result.action, def) };
  }

  async cancel(user: AuthenticatedUser, actionId: string): Promise<ActionReply> {
    const action = await this.findOwnPending(user, actionId);
    const cancelled = await getTenantDb().assistantAction.update({
      where: { id: action.id },
      data: { status: AssistantActionStatus.CANCELLED },
    });
    return { reply: 'Listo, lo cancelé. No se hizo nada.', card: toCard(cancelled, actionByKind(action.kind)) };
  }

  /** "SÍ" / "NO" sueltos de alguien con una acción esperando. null = no es
   * una respuesta corta, o no hay nada pendiente: el mensaje sigue el camino
   * normal (puede ser la respuesta a una repregunta del modelo). */
  async handleShortReply(user: AuthenticatedUser, text: string): Promise<ActionReply | null> {
    const yes = YES_REPLY.test(text);
    if (!yes && !NO_REPLY.test(text)) {
      return null;
    }
    const pending = await getTenantDb().assistantAction.findFirst({
      where: { userId: user.sub, status: AssistantActionStatus.PENDING_CONFIRMATION },
      orderBy: { createdAt: 'desc' },
    });
    if (!pending) {
      return null;
    }
    return yes ? this.confirm(user, pending.id) : this.cancel(user, pending.id);
  }

  /** Deshacer desde el Historial: Dueño/Admin, o quien la pidió. */
  async undo(user: AuthenticatedUser, actionId: string): Promise<AssistantActionCard> {
    const db = getTenantDb();
    const action = await db.assistantAction.findUnique({ where: { id: actionId } });
    if (!action) {
      throw new NotFoundException('Acción no encontrada');
    }
    if (action.userId !== user.sub && user.role !== 'OWNER' && user.role !== 'ADMIN') {
      throw new ForbiddenException('Sólo quien la pidió, el Dueño o un administrador pueden deshacerla');
    }
    if (action.status !== AssistantActionStatus.DONE || !action.entityId) {
      throw new BadRequestException('Sólo se puede deshacer una acción ya hecha');
    }

    switch (action.kind) {
      case 'REMINDER_CREATE':
        await this.calendarEventService.remove(action.entityId);
        break;
      case 'CUSTOMER_CREATE':
        // Desactivar (no borrar): sale de todas las listas, y si ya se usó en
        // algún documento, ese documento no queda apuntando a la nada.
        await this.companiesService.updateCompany(action.entityId, { active: false } as UpdateCompanyDto);
        break;
      case 'QUOTE_CREATE': {
        // Se anula (no se borra: ya consumió un número de la serie). Si ya
        // le llegó al cliente, no se puede deshacer desde acá.
        const quote = await this.quoteService.get(action.entityId);
        if (quote.sentAt) {
          throw new BadRequestException('Esa cotización ya se le mandó al cliente: anulala desde Cotizaciones si hace falta.');
        }
        await this.quoteService.cancel(action.entityId);
        break;
      }
      default:
        throw new BadRequestException('Esta acción no se puede deshacer');
    }

    const undone = await db.assistantAction.update({
      where: { id: action.id },
      data: { status: AssistantActionStatus.UNDONE, undoneAt: new Date(), undoneByUserId: user.sub },
    });
    await this.recordActivity(user.sub, `${action.entityType}.deleted`, action.entityType, action.entityId, `${action.summary} (deshecho desde el Asistente)`);
    return toCard(undone, actionByKind(action.kind));
  }

  /** Para el widget: el estado actual de las tarjetas guardadas en la
   * conversación (una que estaba esperando puede haberse confirmado o
   * vencido desde entonces). */
  async currentCards(ids: string[]): Promise<Map<string, AssistantActionCard>> {
    if (ids.length === 0) {
      return new Map();
    }
    const actions = await getTenantDb().assistantAction.findMany({ where: { id: { in: ids } } });
    return new Map(actions.map((a) => [a.id, toCard(a, actionByKind(a.kind))]));
  }

  /** Marca como vencidas las que nadie confirmó (la confirmación ya las trata
   * como vencidas al mirarlas; esto es para que el Historial no muestre
   * "esperando" para siempre). Mismo patrón por tenant que el resto de los
   * schedulers. */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async expirePendingForAllTenants(now = new Date()): Promise<void> {
    const tenants = await this.prisma.$queryRaw<{ id: string }[]>`SELECT id FROM list_tenant_ids() AS id`;
    for (const { id: tenantId } of tenants) {
      try {
        await withTenantContext(this.prisma, tenantId, () =>
          getTenantDb().assistantAction.updateMany({
            where: { status: AssistantActionStatus.PENDING_CONFIRMATION, expiresAt: { lt: now } },
            data: { status: AssistantActionStatus.EXPIRED },
          }),
        );
      } catch (err) {
        this.logger.error(`Falló el vencimiento de acciones del asistente para el tenant ${tenantId}: ${(err as Error).message}`);
      }
    }
  }

  private async findOwnPending(user: AuthenticatedUser, actionId: string): Promise<AssistantAction> {
    const action = await getTenantDb().assistantAction.findUnique({ where: { id: actionId } });
    if (!action) {
      throw new NotFoundException('Acción no encontrada');
    }
    // Sólo quien la pidió confirma: ni el Dueño puede dar el "SÍ" por otro.
    if (action.userId !== user.sub) {
      throw new ForbiddenException('Sólo la persona que la pidió puede confirmarla o cancelarla');
    }
    if (action.status !== AssistantActionStatus.PENDING_CONFIRMATION) {
      throw new BadRequestException('Esta acción ya no está esperando confirmación');
    }
    return action;
  }

  private async dailyLimitRefusal(access: AssistantAccess): Promise<string | null> {
    const count = await getTenantDb().assistantAction.count({
      where: {
        status: { in: [AssistantActionStatus.DONE, AssistantActionStatus.PENDING_CONFIRMATION] },
        createdAt: { gte: startOfArgentinaDay(new Date()) },
      },
    });
    if (count >= access.limits.maxActionsPerDay) {
      return `La empresa llegó al tope de ${access.limits.maxActionsPerDay} acciones del asistente por día. Por hoy hay que hacerlo desde la web.`;
    }
    return null;
  }

  /** Ejecuta y deja la acción en DONE o FAILED. Nunca lanza: el error vuelve
   * como texto (al modelo, o a la persona que tocó Confirmar). */
  private async run(
    action: AssistantAction,
    def: AssistantActionDef,
    user: AuthenticatedUser,
  ): Promise<{ ok: boolean; message: string; action: AssistantAction }> {
    const db = getTenantDb();
    // Punto de guardado: si la base rechaza algo a mitad de la ejecución (ej.
    // un número de documento repetido), Postgres aborta la transacción
    // entera y ya no se podría ni marcar la acción como FAILED. Volviendo al
    // savepoint se descarta sólo lo que hizo la ejecución.
    await db.$executeRaw`SAVEPOINT assistant_action`;
    try {
      const executed = await this.execute(action, user);
      await db.$executeRaw`RELEASE SAVEPOINT assistant_action`;
      const done = await db.assistantAction.update({
        where: { id: action.id },
        data: {
          status: AssistantActionStatus.DONE,
          confirmedAt: new Date(),
          entityType: executed.entityType,
          entityId: executed.entityId,
        },
      });
      await this.recordActivity(user.sub, `${executed.entityType}.created`, executed.entityType, executed.entityId, `${executed.entityLabel} (por el Asistente)`);
      return { ok: true, message: executed.done, action: done };
    } catch (err) {
      await db.$executeRaw`ROLLBACK TO SAVEPOINT assistant_action`;
      const message = errorText(err);
      this.logger.warn(`Acción ${def.id} (${action.id}) falló: ${message}`);
      const failed = await db.assistantAction.update({
        where: { id: action.id },
        data: { status: AssistantActionStatus.FAILED, errorMessage: message },
      });
      return { ok: false, message, action: failed };
    }
  }

  private prepare(
    def: AssistantActionDef,
    input: unknown,
    user: AuthenticatedUser,
    access: AssistantAccess,
    turn: ActionTurn,
  ): Promise<Prepared> {
    switch (def.kind) {
      case 'REMINDER_CREATE':
        return this.prepareReminder(input, user);
      case 'CUSTOMER_CREATE':
        return this.prepareCustomer(input);
      case 'QUOTE_CREATE':
        return this.prepareQuote(input, access, turn);
      case 'QUOTE_EMAIL':
        return this.prepareQuoteEmail(input);
      default:
        throw new BadRequestException('Acción no disponible');
    }
  }

  private execute(action: AssistantAction, user: AuthenticatedUser): Promise<Executed> {
    switch (action.kind) {
      case 'REMINDER_CREATE':
        return this.executeReminder(action.payload as unknown as ReminderPayload, user);
      case 'CUSTOMER_CREATE':
        return this.executeCustomer(action.payload as unknown as CustomerPayload);
      case 'QUOTE_CREATE':
        return this.executeQuote(action.payload as unknown as QuotePayload);
      case 'QUOTE_EMAIL':
        return this.executeQuoteEmail(action.payload as unknown as QuoteEmailPayload);
      default:
        throw new BadRequestException('Acción no disponible');
    }
  }

  // ── Recordatorio / tarea ────────────────────────────────────────────────

  private async prepareReminder(input: unknown, user: AuthenticatedUser): Promise<Prepared> {
    const title = str(input, 'titulo').slice(0, 200);
    const date = str(input, 'fecha');
    const time = str(input, 'hora');
    const assignee = str(input, 'asignarA');
    if (!title) {
      throw new BadRequestException('Falta qué hay que hacer (el título del recordatorio).');
    }
    if (!DATE_RE.test(date) || Number.isNaN(new Date(`${date}T12:00:00Z`).getTime())) {
      throw new BadRequestException('Falta la fecha, o no es válida (formato yyyy-mm-dd).');
    }
    const todayAr = new Date(startOfArgentinaDay(new Date()).getTime() + 3 * 60 * 60_000).toISOString().slice(0, 10);
    if (date < todayAr) {
      throw new BadRequestException(`La fecha ${date} ya pasó. ¿Para qué día lo agendo?`);
    }
    if (time && !TIME_RE.test(time)) {
      throw new BadRequestException('La hora no es válida (formato HH:mm, 24 h).');
    }

    let assignedTo: { id: string; name: string } | null = null;
    if (assignee) {
      const people = await getTenantDb().user.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true, name: true, email: true },
      });
      const wanted = stripAccents(assignee);
      const matches = people.filter(
        (p) => stripAccents(p.email) === wanted || (p.name && stripAccents(p.name).includes(wanted)),
      );
      if (matches.length === 0) {
        throw new BadRequestException(`No encontré a "${assignee}" en el equipo de la empresa.`);
      }
      if (matches.length > 1) {
        throw new BadRequestException(
          `Hay más de una persona que coincide con "${assignee}": ${matches.map((p) => p.name || p.email).join(', ')}. ¿A cuál?`,
        );
      }
      if (matches[0].id !== user.sub) {
        assignedTo = { id: matches[0].id, name: matches[0].name || matches[0].email };
      }
    }

    const when = `${WEEKDAY_DATE.format(new Date(`${date}T12:00:00Z`))}${time ? ` a las ${time}` : ' (todo el día)'}`;
    const payload: ReminderPayload = { title, date, time: time || null, assignedToUserId: assignedTo?.id ?? null };
    return {
      payload: payload as unknown as Record<string, unknown>,
      summary: assignedTo ? `Tarea “${title}” para ${assignedTo.name}, ${when}` : `Recordatorio “${title}”, ${when}`,
    };
  }

  private async executeReminder(payload: ReminderPayload, user: AuthenticatedUser): Promise<Executed> {
    const event = await this.calendarEventService.create({
      title: payload.title,
      // Misma convención que la web: con hora, la hora de Argentina; sin
      // hora, mediodía UTC del día (no se corre de fecha por el huso).
      startsAt: payload.time
        ? new Date(`${payload.date}T${payload.time}:00-03:00`).toISOString()
        : `${payload.date}T12:00:00.000Z`,
      allDay: !payload.time,
      kind: payload.assignedToUserId ? 'TASK' : 'REMINDER',
      assignedTo: payload.assignedToUserId ?? user.sub,
    });
    return {
      entityType: 'calendarEvent',
      entityId: event.id,
      entityLabel: payload.title,
      done: payload.assignedToUserId ? `quedó asignada la tarea "${payload.title}"` : `quedó agendado "${payload.title}"`,
    };
  }

  // ── Cliente nuevo ───────────────────────────────────────────────────────

  private async prepareCustomer(input: unknown): Promise<Prepared> {
    let name = str(input, 'nombre').slice(0, 200);
    const rawCuit = str(input, 'cuit');
    const email = str(input, 'email');
    const phone = str(input, 'telefono').slice(0, 50);
    if (email && !EMAIL_RE.test(email)) {
      throw new BadRequestException(`El email "${email}" no parece válido.`);
    }

    const db = getTenantDb();
    let taxId: string | null = null;
    let taxCondition: string | null = null;
    let fiscalAddress: string | null = null;
    let arcaNote = '';
    if (rawCuit) {
      const digits = rawCuit.replace(/\D/g, '');
      if (digits.length !== 11) {
        throw new BadRequestException(`El CUIT "${rawCuit}" no tiene 11 números.`);
      }
      taxId = formatCuit(digits);
      const existing = await db.company.findFirst({ where: { taxId: { in: [digits, taxId] } }, select: { name: true } });
      if (existing) {
        throw new BadRequestException(`Ya hay una empresa cargada con el CUIT ${taxId}: ${existing.name}.`);
      }
      try {
        const padron = await this.companiesService.lookupAfip(digits);
        name = padron.name || name;
        taxCondition = padron.taxCondition;
        fiscalAddress = padron.fiscalAddress;
      } catch (err) {
        // Sin ARCA igual se puede cargar, si la persona dio el nombre.
        if (!name) {
          throw new BadRequestException(`No pude traer los datos de ARCA (${errorText(err)}). Decime el nombre o razón social.`);
        }
        arcaNote = ' · sin datos de ARCA';
      }
    }
    if (!name) {
      throw new BadRequestException('Falta el nombre o el CUIT del cliente.');
    }
    if (!taxId) {
      const sameName = await db.company.findFirst({
        where: { name: { equals: name, mode: 'insensitive' } },
        select: { name: true },
      });
      if (sameName) {
        throw new BadRequestException(`Ya hay una empresa llamada "${sameName.name}". Si es otra, pasame el CUIT.`);
      }
    }

    const payload: CustomerPayload = { name, taxId, email: email || null, phone: phone || null, taxCondition, fiscalAddress };
    const parts = [
      `Cliente “${name}”`,
      taxId ? `CUIT ${taxId}` : null,
      taxCondition,
      email || null,
      phone || null,
    ].filter(Boolean);
    return { payload: payload as unknown as Record<string, unknown>, summary: parts.join(' · ') + arcaNote };
  }

  private async executeCustomer(payload: CustomerPayload): Promise<Executed> {
    const company = await this.companiesService.createCompany({
      name: payload.name,
      taxId: payload.taxId ?? undefined,
      email: payload.email ?? undefined,
      phone: payload.phone ?? undefined,
      taxCondition: payload.taxCondition ?? undefined,
      fiscalAddress: payload.fiscalAddress ?? undefined,
      roles: ['CUSTOMER'],
    } as CreateCompanyDto);
    return { entityType: 'company', entityId: company.id, entityLabel: company.name, done: `quedó cargado el cliente "${company.name}"` };
  }

  // ── Cotización ──────────────────────────────────────────────────────────

  private async prepareQuote(input: unknown, access: AssistantAccess, turn: ActionTurn): Promise<Prepared> {
    const customer = await this.resolveCustomer(str(input, 'cliente'));
    const rawLines = (input as { lineas?: unknown } | null)?.lineas;
    if (!Array.isArray(rawLines) || rawLines.length === 0) {
      throw new BadRequestException('Faltan los artículos y las cantidades.');
    }
    if (rawLines.length > MAX_QUOTE_LINES) {
      throw new BadRequestException(`Son demasiados artículos para armarla por acá (más de ${MAX_QUOTE_LINES}): hacela desde la web.`);
    }

    const lines: QuotePayload['lines'] = [];
    for (const raw of rawLines) {
      const quantity = Number((raw as { cantidad?: unknown })?.cantidad);
      const article = str(raw, 'articulo');
      if (!article) {
        throw new BadRequestException('Hay una línea sin artículo.');
      }
      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new BadRequestException(`Falta la cantidad de "${article}".`);
      }
      const variant = await this.resolveVariant(article);
      lines.push({ articleVariantId: variant.id, label: variant.label, quantity, unitPrice: variant.unitPrice });
    }
    // Sin IVA a propósito: el IVA lo calcula QuoteService con la alícuota
    // vigente de cada artículo al crearla. Acá no se estima ni se inventa.
    const subtotal = round2(lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0));

    const currency = await getTenantDb().currency.findFirst({ orderBy: [{ isBase: 'desc' }, { code: 'asc' }] });
    if (!currency) {
      throw new BadRequestException('La empresa no tiene ninguna moneda cargada.');
    }
    const max = access.limits.maxQuoteAmountWhatsapp;
    if (turn.channel === 'WHATSAPP' && max !== null && subtotal > max) {
      throw new BadRequestException(
        `La cotización da ${currency.code} ${formatMoney(subtotal)} sin IVA y el tope por WhatsApp es ${currency.code} ${formatMoney(max)}: armala desde la web.`,
      );
    }

    // "Y mandásela": sólo si además tiene habilitado enviar por correo y el
    // cliente tiene email. Si no, se arma igual y se avisa por qué no sale.
    let sendEmail = false;
    let emailNote = '';
    if ((input as { enviarPorCorreo?: unknown } | null)?.enviarPorCorreo === true) {
      if (!access.allowedActions.has('correo')) {
        emailNote = ' · no se manda por correo: esa acción no está habilitada para vos';
      } else if (!customer.email) {
        emailNote = ' · no se manda por correo: el cliente no tiene email cargado';
      } else {
        sendEmail = true;
      }
    }

    const payload: QuotePayload = {
      customerId: customer.id,
      customerName: customer.name,
      customerEmail: customer.email,
      currencyId: currency.id,
      currencyCode: currency.code,
      lines,
      notes: str(input, 'notas').slice(0, 1000) || null,
      sendEmail,
    };
    const detail = lines.map((l) => `${formatQty(l.quantity)} × ${l.label} (${currency.code} ${formatMoney(l.unitPrice)})`).join(', ');
    return {
      payload: payload as unknown as Record<string, unknown>,
      summary:
        `Cotización para ${customer.name}: ${detail} · subtotal sin IVA ${currency.code} ${formatMoney(subtotal)}` +
        (sendEmail ? ` · y mandarla por correo a ${customer.email}` : '') +
        emailNote,
    };
  }

  private async executeQuote(payload: QuotePayload): Promise<Executed> {
    const quote = await this.quoteService.create({
      customerId: payload.customerId,
      currencyId: payload.currencyId,
      notes: payload.notes ?? undefined,
      lines: payload.lines.map((l) => ({ articleVariantId: l.articleVariantId, quantity: l.quantity, unitPrice: l.unitPrice })),
    } as CreateQuoteDto);
    const created = `quedó la Cotización ${quote.number} para ${payload.customerName} por ${payload.currencyCode} ${formatMoney(Number(quote.total))} (IVA incluido)`;
    if (!payload.sendEmail) {
      return { entityType: 'quote', entityId: quote.id, entityLabel: quote.number, done: created };
    }
    // Si el correo falla, la cotización igual queda hecha: se avisa y se
    // puede mandar desde la web, en vez de perder lo armado.
    try {
      await this.quoteService.sendEmail(quote.id);
      return { entityType: 'quote', entityId: quote.id, entityLabel: quote.number, done: `${created} y se mandó a ${payload.customerEmail}` };
    } catch (err) {
      return {
        entityType: 'quote',
        entityId: quote.id,
        entityLabel: quote.number,
        done: `${created}, pero no se pudo mandar el correo (${errorText(err)}); mandala desde Cotizaciones`,
      };
    }
  }

  // ── Enviar cotización por correo ────────────────────────────────────────

  private async prepareQuoteEmail(input: unknown): Promise<Prepared> {
    const raw = str(input, 'numero');
    const digits = raw.replace(/\D/g, '');
    if (!digits) {
      throw new BadRequestException('Falta el número de la cotización.');
    }
    const padded = digits.slice(-6).padStart(6, '0');
    const candidates = await getTenantDb().quote.findMany({
      where: { OR: [{ number: { equals: raw, mode: 'insensitive' } }, { number: { endsWith: `-${padded}` } }] },
      include: { customer: { select: { name: true, email: true } }, currency: { select: { code: true } } },
      take: 6,
    });
    if (candidates.length === 0) {
      throw new BadRequestException(`No encontré la cotización "${raw}".`);
    }
    if (candidates.length > 1) {
      throw new BadRequestException(
        `Hay más de una cotización con ese número: ${candidates.map((q) => `${q.number} (${q.customer.name})`).join(', ')}. ¿Cuál?`,
      );
    }
    const quote = candidates[0];
    if (quote.status === 'CANCELLED') {
      throw new BadRequestException(`La cotización ${quote.number} está anulada.`);
    }
    if (!quote.customer.email) {
      throw new BadRequestException(`${quote.customer.name} no tiene email cargado: cargalo en su ficha o mandala por WhatsApp desde la web.`);
    }
    const payload: QuoteEmailPayload = { quoteId: quote.id, number: quote.number, email: quote.customer.email };
    return {
      payload: payload as unknown as Record<string, unknown>,
      summary: `Mandar la Cotización ${quote.number} (${quote.customer.name}, ${quote.currency.code} ${formatMoney(Number(quote.total))}) a ${quote.customer.email}`,
    };
  }

  private async executeQuoteEmail(payload: QuoteEmailPayload): Promise<Executed> {
    await this.quoteService.sendEmail(payload.quoteId);
    return {
      entityType: 'quote',
      entityId: payload.quoteId,
      entityLabel: `${payload.number} enviada por correo`,
      done: `se mandó la Cotización ${payload.number} a ${payload.email}`,
    };
  }

  // ── Búsquedas por nombre ────────────────────────────────────────────────

  /** Cliente activo por CUIT o por nombre. Más de una coincidencia =
   * repregunta con las opciones (nunca elige solo). */
  private async resolveCustomer(raw: string): Promise<{ id: string; name: string; email: string | null }> {
    if (!raw) {
      throw new BadRequestException('Falta el cliente.');
    }
    const db = getTenantDb();
    const digits = raw.replace(/\D/g, '');
    const select = { id: true, name: true, email: true } as const;
    const base = { active: true, roles: { some: { role: 'CUSTOMER' as const } } };
    if (digits.length === 11) {
      const byCuit = await db.company.findFirst({ where: { ...base, taxId: { in: [digits, formatCuit(digits)] } }, select });
      if (byCuit) return byCuit;
    }
    const exact = await db.company.findMany({ where: { ...base, name: { equals: raw, mode: 'insensitive' } }, select, take: 2 });
    if (exact.length === 1) return exact[0];
    const matches = await db.company.findMany({
      where: { ...base, name: { contains: raw, mode: 'insensitive' } },
      select,
      orderBy: { name: 'asc' },
      take: 6,
    });
    if (matches.length === 0) {
      throw new BadRequestException(`No encontré ningún cliente que coincida con "${raw}". ¿Está cargado como cliente?`);
    }
    if (matches.length > 1) {
      throw new BadRequestException(`Hay varios clientes que coinciden con "${raw}": ${matches.map((m) => m.name).join(', ')}. ¿Cuál?`);
    }
    return matches[0];
  }

  /** Variante vendible (artículo activo, no insumo, con precio) por SKU o
   * por nombre. Mismo criterio de no adivinar: varias opciones = repregunta. */
  private async resolveVariant(raw: string): Promise<{ id: string; label: string; unitPrice: number }> {
    const db = getTenantDb();
    const select = {
      id: true,
      sku: true,
      color: true,
      size: true,
      unitPrice: true,
      article: { select: { name: true } },
    } as const;
    const sellable = { article: { active: true, isSupply: false } };
    const bySku = await db.articleVariant.findMany({ where: { ...sellable, sku: { equals: raw, mode: 'insensitive' } }, select, take: 2 });
    let found = bySku;
    if (found.length !== 1) {
      found = await db.articleVariant.findMany({
        where: { ...sellable, article: { ...sellable.article, name: { contains: raw, mode: 'insensitive' } } },
        select,
        orderBy: [{ article: { name: 'asc' } }, { sku: 'asc' }],
        take: 7,
      });
    }
    if (found.length === 0) {
      // Segundo intento: todas las palabras ("cemento portland" ↔ "Cemento
      // Portland x 50 kg"), por si el nombre no está escrito igual.
      const words = raw.split(/\s+/).filter((w) => w.length >= 3);
      if (words.length > 1) {
        found = await db.articleVariant.findMany({
          where: {
            ...sellable,
            AND: words.map((w) => ({ article: { name: { contains: w, mode: 'insensitive' as const } } })),
          },
          select,
          take: 7,
        });
      }
    }
    if (found.length === 0) {
      throw new BadRequestException(`No encontré ningún artículo a la venta que coincida con "${raw}".`);
    }
    const label = (v: (typeof found)[number]) =>
      [v.article.name, [v.color, v.size].filter(Boolean).join(' ')].filter(Boolean).join(' ') + ` (${v.sku})`;
    if (found.length > 1) {
      const options = found.slice(0, 6).map(label).join(', ');
      throw new BadRequestException(`Hay varios artículos que coinciden con "${raw}": ${options}${found.length > 6 ? '…' : ''}. ¿Cuál?`);
    }
    const variant = found[0];
    const unitPrice = Number(variant.unitPrice);
    if (!(unitPrice > 0)) {
      throw new BadRequestException(`${label(variant)} no tiene precio de venta cargado: hay que cargarlo en Inventario antes de cotizarlo.`);
    }
    return { id: variant.id, label: label(variant), unitPrice };
  }

  // Mismo registro que deja ActivityLogInterceptor para lo que se hace por la
  // web, con "(por el Asistente)" en la etiqueta para distinguirlo. Nunca
  // frena la acción si falla.
  private async recordActivity(userId: string, action: string, entityType: string | null, entityId: string | null, entityLabel: string) {
    try {
      await getTenantDb().userActivityLog.create({
        data: { tenantId: getTenantId(), userId, action, outcome: 'SUCCESS', entityType, entityId, entityLabel },
      });
    } catch (err) {
      this.logger.error(`No se pudo registrar en Actividad la acción del asistente: ${(err as Error).message}`);
    }
  }
}

interface ReminderPayload {
  title: string;
  date: string;
  time: string | null;
  assignedToUserId: string | null;
}

interface CustomerPayload {
  name: string;
  taxId: string | null;
  email: string | null;
  phone: string | null;
  taxCondition: string | null;
  fiscalAddress: string | null;
}

interface QuotePayload {
  customerId: string;
  customerName: string;
  customerEmail: string | null;
  currencyId: string;
  currencyCode: string;
  lines: Array<{ articleVariantId: string; label: string; quantity: number; unitPrice: number }>;
  notes: string | null;
  sendEmail: boolean;
}

interface QuoteEmailPayload {
  quoteId: string;
  number: string;
  email: string;
}
