import { BadRequestException, ForbiddenException, HttpException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CalendarEventService } from '@plexo/calendar';
import { CompaniesService, type CreateCompanyDto, type UpdateCompanyDto } from '@plexo/companies';
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
      prepared = await this.prepare(def, input, user);
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
    try {
      const executed = await this.execute(action, user);
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
      const message = errorText(err);
      this.logger.warn(`Acción ${def.id} (${action.id}) falló: ${message}`);
      const failed = await db.assistantAction.update({
        where: { id: action.id },
        data: { status: AssistantActionStatus.FAILED, errorMessage: message },
      });
      return { ok: false, message, action: failed };
    }
  }

  private prepare(def: AssistantActionDef, input: unknown, user: AuthenticatedUser): Promise<Prepared> {
    switch (def.kind) {
      case 'REMINDER_CREATE':
        return this.prepareReminder(input, user);
      case 'CUSTOMER_CREATE':
        return this.prepareCustomer(input);
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
