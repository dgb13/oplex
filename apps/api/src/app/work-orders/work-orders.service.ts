import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { getTenantDb, getTenantId, getUserId, Prisma, PrismaService, takeDocumentNumber } from '@plexo/database';
import { CustomerAssetsService } from '../customer-assets/customer-assets.service.js';
import type {
  CreateWorkOrderDto,
  ListWorkOrdersQuery,
  UpdateWorkOrderDto,
  UpdateWorkOrderStatusesDto,
} from './dto/work-order.dto.js';

/** Forma de BusinessTemplate.config.workOrder (migración de rubros). */
export interface TemplateWorkOrder {
  docName: string;
  statuses: { name: string; final?: boolean; notifiesCustomer?: boolean }[];
}

const DEFAULT_DOC_NAME = 'Orden de trabajo';

const ORDER_INCLUDE = {
  customer: { select: { id: true, name: true, phone: true } },
  asset: { select: { id: true, identifier: true, typeId: true, values: true, type: { select: { name: true } } } },
  status: true,
} as const;

type OrderRow = Prisma.WorkOrderGetPayload<{ include: typeof ORDER_INCLUDE }>;

function toOrderView(row: OrderRow) {
  return {
    id: row.id,
    number: row.number,
    description: row.description,
    intakeNotes: row.intakeNotes,
    assetSnapshot: (row.assetSnapshot ?? null) as Record<string, unknown> | null,
    assignedUserId: row.assignedUserId,
    promisedAt: row.promisedAt,
    quoteId: row.quoteId,
    invoiceId: row.invoiceId,
    closedAt: row.closedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    customer: row.customer,
    asset: row.asset
      ? { id: row.asset.id, identifier: row.asset.identifier, typeId: row.asset.typeId, typeName: row.asset.type.name }
      : null,
    status: {
      id: row.status.id,
      name: row.status.name,
      isFinal: row.status.isFinal,
      notifiesCustomer: row.status.notifiesCustomer,
    },
  };
}

/** "Orden de trabajo" -> "Órdenes de trabajo", "Pedido" -> "Pedidos": se
 * pluraliza la primera palabra (el resto es "de trabajo", "de servicio"). */
export function pluralizeDocName(docName: string): string {
  const [first, ...rest] = docName.trim().split(/\s+/);
  if (!first) return docName;
  const known: Record<string, string> = { Orden: 'Órdenes', Reserva: 'Reservas', Contrato: 'Contratos' };
  const plural =
    known[first] ?? (/[aeiouáéíóú]$/i.test(first) ? `${first}s` : /z$/i.test(first) ? `${first.slice(0, -1)}ces` : `${first}es`);
  return [plural, ...rest].join(' ');
}

/**
 * Órdenes de trabajo (etapa 4 del plan de rubros): un trabajo para un
 * cliente, sobre una de sus fichas, con estados por negocio. Se enlaza con
 * Cotizaciones y Facturación en vez de repetir sus líneas.
 */
@Injectable()
export class WorkOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assets: CustomerAssetsService,
  ) {}

  /** Estados y nombre del documento del rubro, si el negocio todavía no
   * tiene. Lo llama BusinessProfileService.choose y, para quien eligió
   * antes de esta etapa, getConfig. */
  async ensureFromTemplate(workOrder: TemplateWorkOrder): Promise<void> {
    const db = getTenantDb();
    const tenantId = getTenantId();
    if ((await db.workOrderStatus.count()) === 0 && workOrder.statuses.length > 0) {
      await db.workOrderStatus.createMany({
        data: workOrder.statuses.map((s, i) => ({
          tenantId,
          name: s.name,
          sortOrder: i,
          isFinal: Boolean(s.final),
          notifiesCustomer: Boolean(s.notifiesCustomer),
        })),
      });
    }
    await db.tenantSettings.upsert({
      where: { tenantId },
      create: { tenantId, workOrderDocName: workOrder.docName },
      update: {},
    });
    const settings = await db.tenantSettings.findUnique({ where: { tenantId } });
    if (!settings?.workOrderDocName) {
      await db.tenantSettings.update({ where: { tenantId }, data: { workOrderDocName: workOrder.docName } });
    }
  }

  /** Nombre del documento y estados del negocio. Si no tiene estados, se
   * crean los del rubro o, sin rubro, unos genéricos. */
  async getConfig() {
    const db = getTenantDb();
    const tenantId = getTenantId();
    if ((await db.workOrderStatus.count()) === 0) {
      const settings = await db.tenantSettings.findUnique({ where: { tenantId } });
      const template = settings?.businessTemplateKey
        ? await this.prisma.businessTemplate.findUnique({ where: { key: settings.businessTemplateKey } })
        : null;
      const fromTemplate = (template?.config as { workOrder?: TemplateWorkOrder } | undefined)?.workOrder;
      await this.ensureFromTemplate(
        fromTemplate ?? {
          docName: DEFAULT_DOC_NAME,
          statuses: [
            { name: 'Recibido' },
            { name: 'En proceso' },
            { name: 'Listo para retirar', notifiesCustomer: true },
            { name: 'Entregado', final: true },
          ],
        },
      );
    }
    const [settings, statuses] = await Promise.all([
      db.tenantSettings.findUnique({ where: { tenantId } }),
      db.workOrderStatus.findMany({ orderBy: { sortOrder: 'asc' } }),
    ]);
    const docName = settings?.workOrderDocName || DEFAULT_DOC_NAME;
    return {
      docName,
      pluralName: pluralizeDocName(docName),
      statuses: statuses.map((s) => ({
        id: s.id,
        name: s.name,
        sortOrder: s.sortOrder,
        isFinal: s.isFinal,
        notifiesCustomer: s.notifiesCustomer,
        active: s.active,
      })),
    };
  }

  /** Configuración: renombrar, reordenar (por el orden de la lista),
   * agregar o desactivar estados. Uno usado no se borra: se desactiva. */
  async updateConfig(dto: UpdateWorkOrderStatusesDto) {
    const db = getTenantDb();
    const tenantId = getTenantId();
    const existing = await db.workOrderStatus.findMany();
    const byId = new Map(existing.map((s) => [s.id, s]));
    const active = dto.statuses.filter((s) => s.active !== false);
    if (active.length < 2) throw new BadRequestException('Tiene que haber al menos dos estados activos');
    if (!active.some((s) => s.isFinal)) throw new BadRequestException('Marcá al menos un estado que cierre la orden (ej. Entregado)');
    if (active[0].isFinal) throw new BadRequestException('El primer estado no puede cerrar la orden');

    await db.$transaction(async (tx) => {
      for (const [i, s] of dto.statuses.entries()) {
        const data = {
          name: s.name.trim(),
          sortOrder: i,
          isFinal: Boolean(s.isFinal),
          notifiesCustomer: Boolean(s.notifiesCustomer),
          active: s.active !== false,
        };
        if (s.id && byId.has(s.id)) {
          await tx.workOrderStatus.update({ where: { tenantId_id: { tenantId, id: s.id } }, data });
        } else {
          await tx.workOrderStatus.create({ data: { tenantId, ...data } });
        }
      }
      // Los que no vinieron se desactivan (pueden tener órdenes).
      const sent = new Set(dto.statuses.map((s) => s.id).filter(Boolean));
      for (const s of existing) {
        if (!sent.has(s.id)) await tx.workOrderStatus.update({ where: { tenantId_id: { tenantId, id: s.id } }, data: { active: false } });
      }
      if (dto.docName) {
        await tx.tenantSettings.upsert({
          where: { tenantId },
          create: { tenantId, workOrderDocName: dto.docName.trim() },
          update: { workOrderDocName: dto.docName.trim() },
        });
      }
    });
    return this.getConfig();
  }

  /** Usuarios activos del negocio, para elegir el responsable. */
  async assignees() {
    const users = await getTenantDb().user.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
    });
    return users.map((u) => ({ id: u.id, name: u.name || u.email }));
  }

  async list(query: ListWorkOrdersQuery) {
    const search = query.q?.trim();
    const scope = query.scope ?? 'open';
    const rows = await getTenantDb().workOrder.findMany({
      where: {
        statusId: query.statusId,
        assetId: query.assetId,
        customerId: query.customerId,
        ...(scope === 'open' ? { closedAt: null } : scope === 'closed' ? { closedAt: { not: null } } : {}),
        ...(search
          ? {
              OR: [
                { number: { contains: search, mode: 'insensitive' as const } },
                { description: { contains: search, mode: 'insensitive' as const } },
                { customer: { name: { contains: search, mode: 'insensitive' as const } } },
                { asset: { identifierKey: { contains: search.toUpperCase().replace(/[^A-Z0-9]/g, '') || search } } },
              ],
            }
          : {}),
      },
      include: ORDER_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
    return rows.map(toOrderView);
  }

  async get(id: string) {
    const db = getTenantDb();
    const tenantId = getTenantId();
    const row = await db.workOrder.findUnique({
      where: { tenantId_id: { tenantId, id } },
      include: { ...ORDER_INCLUDE, statusChanges: { orderBy: { createdAt: 'asc' } } },
    });
    if (!row) throw new NotFoundException('Orden no encontrada');
    // La factura sale de la cotización (Facturación guarda Invoice.quoteId):
    // si se facturó desde Cotizaciones, la orden la toma sola.
    if (!row.invoiceId && row.quoteId) {
      const fromQuote = await db.invoice.findFirst({ where: { quoteId: row.quoteId }, select: { id: true } });
      if (fromQuote) {
        await db.workOrder.update({ where: { tenantId_id: { tenantId, id } }, data: { invoiceId: fromQuote.id } });
        row.invoiceId = fromQuote.id;
      }
    }
    const [quote, invoice, users] = await Promise.all([
      row.quoteId
        ? db.quote.findUnique({ where: { id: row.quoteId }, select: { id: true, number: true, status: true, total: true } })
        : null,
      row.invoiceId
        ? db.invoice.findUnique({
            where: { id: row.invoiceId },
            select: { id: true, documentLetter: true, pointOfSale: true, number: true, status: true, total: true },
          })
        : null,
      db.user.findMany({ select: { id: true, name: true, email: true } }),
    ]);
    const userName = new Map(users.map((u) => [u.id, u.name || u.email]));
    return {
      ...toOrderView(row),
      assignedUserName: row.assignedUserId ? (userName.get(row.assignedUserId) ?? null) : null,
      quote: quote ? { ...quote, total: quote.total.toString() } : null,
      invoice: invoice
        ? { id: invoice.id, label: `${invoice.documentLetter} ${invoice.pointOfSale}-${invoice.number}`, status: invoice.status, total: invoice.total.toString() }
        : null,
      history: row.statusChanges.map((c) => ({
        id: c.id,
        fromStatusId: c.fromStatusId,
        toStatusId: c.toStatusId,
        userName: c.userId ? (userName.get(c.userId) ?? null) : null,
        createdAt: c.createdAt,
      })),
    };
  }

  async create(dto: CreateWorkOrderDto) {
    const db = getTenantDb();
    const tenantId = getTenantId();
    const userId = getUserId();
    if (!userId) throw new BadRequestException('Falta el usuario');
    const customer = await db.company.findUnique({ where: { id: dto.customerId }, include: { roles: true } });
    if (!customer || !customer.roles.some((r) => r.role === 'CUSTOMER')) throw new BadRequestException('Elegí un cliente');

    let assetSnapshot: Prisma.InputJsonValue | undefined;
    if (dto.assetId) {
      let asset = await this.assets.get(dto.assetId);
      if (asset.company.id !== dto.customerId) throw new BadRequestException('Esa ficha es de otro cliente');
      // Lo que cambió al ingresar (los km de hoy) se guarda en la ficha.
      if (dto.assetValues && Object.keys(dto.assetValues).length > 0) {
        asset = await this.assets.update(asset.id, { values: { ...asset.values, ...dto.assetValues } });
      }
      assetSnapshot = asset.values as Prisma.InputJsonValue;
    }

    const config = await this.getConfig();
    const first = config.statuses.find((s) => s.active);
    if (!first) throw new BadRequestException('Configurá los estados de las órdenes');
    const number = await takeDocumentNumber({
      increment: async () => {
        const updated = await db.tenantSettings.upsert({
          where: { tenantId },
          create: { tenantId, workOrderNextNumber: 2 },
          update: { workOrderNextNumber: { increment: 1 } },
          select: { workOrderPrefix: true, workOrderNextNumber: true },
        });
        return { prefix: updated.workOrderPrefix, next: updated.workOrderNextNumber };
      },
      setNext: async (next) => {
        await db.tenantSettings.update({ where: { tenantId }, data: { workOrderNextNumber: next } });
      },
      exists: async (n) => !!(await db.workOrder.findFirst({ where: { number: n }, select: { id: true } })),
      numbersWithPrefix: async (prefix) =>
        (await db.workOrder.findMany({ where: { number: { startsWith: `${prefix}-` } }, select: { number: true } })).map((r) => r.number),
    });

    const created = await db.workOrder.create({
      data: {
        tenantId,
        number,
        customerId: dto.customerId,
        assetId: dto.assetId,
        statusId: first.id,
        description: dto.description.trim(),
        intakeNotes: dto.intakeNotes?.trim() || null,
        assetSnapshot,
        assignedUserId: dto.assignedUserId,
        promisedAt: dto.promisedAt ? new Date(dto.promisedAt) : null,
        createdByUserId: userId,
        // tenantId lo pone Prisma (relación compuesta [tenantId, workOrderId]).
        statusChanges: { create: { toStatusId: first.id, userId } },
      },
    });
    return this.get(created.id);
  }

  async update(id: string, dto: UpdateWorkOrderDto) {
    const db = getTenantDb();
    const tenantId = getTenantId();
    const order = await db.workOrder.findUnique({ where: { tenantId_id: { tenantId, id } } });
    if (!order) throw new NotFoundException('Orden no encontrada');
    if (dto.quoteId) {
      const quote = await db.quote.findUnique({ where: { id: dto.quoteId } });
      if (!quote || quote.customerId !== order.customerId) throw new BadRequestException('La cotización tiene que ser del mismo cliente');
    }
    if (dto.invoiceId) {
      const invoice = await db.invoice.findUnique({ where: { id: dto.invoiceId } });
      if (!invoice || invoice.customerId !== order.customerId) throw new BadRequestException('La factura tiene que ser del mismo cliente');
    }
    await db.workOrder.update({
      where: { tenantId_id: { tenantId, id } },
      data: {
        description: dto.description?.trim(),
        intakeNotes: dto.intakeNotes === undefined ? undefined : dto.intakeNotes.trim() || null,
        assignedUserId: dto.assignedUserId,
        promisedAt: dto.promisedAt === undefined ? undefined : dto.promisedAt ? new Date(dto.promisedAt) : null,
        quoteId: dto.quoteId,
        invoiceId: dto.invoiceId,
      },
    });
    return this.get(id);
  }

  async changeStatus(id: string, statusId: string) {
    const db = getTenantDb();
    const tenantId = getTenantId();
    const order = await db.workOrder.findUnique({ where: { tenantId_id: { tenantId, id } } });
    if (!order) throw new NotFoundException('Orden no encontrada');
    const status = await db.workOrderStatus.findUnique({ where: { tenantId_id: { tenantId, id: statusId } } });
    if (!status || !status.active) throw new BadRequestException('Estado inválido');
    if (order.statusId === statusId) return this.get(id);
    await db.workOrder.update({
      where: { tenantId_id: { tenantId, id } },
      data: {
        statusId,
        closedAt: status.isFinal ? (order.closedAt ?? new Date()) : null,
        statusChanges: { create: { fromStatusId: order.statusId, toStatusId: statusId, userId: getUserId() } },
      },
    });
    return this.get(id);
  }

  /** Link de WhatsApp (wa.me) con el aviso armado, al teléfono del cliente
   * o al que se pase. No usa la API de Meta: abre WhatsApp con el texto. */
  async whatsappLink(id: string, phone?: string) {
    const db = getTenantDb();
    const tenantId = getTenantId();
    const order = await db.workOrder.findUnique({ where: { tenantId_id: { tenantId, id } }, include: ORDER_INCLUDE });
    if (!order) throw new NotFoundException('Orden no encontrada');
    const digits = (phone ?? order.customer.phone ?? '').replace(/[^0-9]/g, '');
    if (!digits) throw new BadRequestException('El cliente no tiene teléfono cargado');
    const [settings, tenant] = await Promise.all([
      db.tenantSettings.findUnique({ where: { tenantId } }),
      db.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
    ]);
    const from = settings?.tradeName || tenant?.name || '';
    const what = order.asset ? `tu ${order.asset.type.name.toLowerCase()} ${order.asset.identifier}` : `tu trabajo (${order.number})`;
    const message = order.status.notifiesCustomer
      ? `Hola ${order.customer.name}, ${what} ya está listo para retirar.${from ? ` — ${from}` : ''}`
      : `Hola ${order.customer.name}, te escribimos por ${what}: está en "${order.status.name}".${from ? ` — ${from}` : ''}`;
    return { url: `https://wa.me/${digits}?text=${encodeURIComponent(message)}`, message };
  }
}
