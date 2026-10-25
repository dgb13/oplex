import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AUTH_EMAIL_SENDER, type AuthEmailSender } from '@plexo/auth-email';
import {
  getTenantDb,
  PrismaService,
  withTenantContext,
  type SupportTicketPriority,
  type SupportTicketStatus,
} from '@plexo/database';
import { adminReplyMail } from './support-email.js';
import { readSupportFile, storeSupportFile, validateSupportFiles, type IncomingSupportFile } from './support-files.js';
import { userTicketUrl } from './support.service.js';

export interface AdminTicketRow {
  id: string;
  tenantId: string;
  tenantName: string;
  number: number;
  userEmail: string;
  userName: string | null;
  type: string;
  module: string;
  subject: string;
  status: SupportTicketStatus;
  priority: SupportTicketPriority;
  unreadByAdmin: boolean;
  lastMessageAt: Date;
  createdAt: Date;
}

/**
 * Bandeja de Soporte del backoffice. Las consultas son tablas de tenant con
 * RLS: se leen tenant por tenant (list_tenant_ids() + withTenantContext,
 * mismo recipe que el panel de Tenants). Con decenas de tenants es
 * instantáneo; si algún día son miles, conviene una función SECURITY
 * DEFINER que devuelva la bandeja de una.
 */
@Injectable()
export class AdminSupportService {
  private readonly logger = new Logger(AdminSupportService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(AUTH_EMAIL_SENDER) private readonly email: AuthEmailSender,
  ) {}

  async list(): Promise<AdminTicketRow[]> {
    const tenants = await this.prisma.$queryRaw<{ id: string }[]>`SELECT id FROM list_tenant_ids() AS id`;
    const rows: AdminTicketRow[] = [];
    for (const { id: tenantId } of tenants) {
      try {
        const found = await withTenantContext(this.prisma, tenantId, async () => {
          const db = getTenantDb();
          const tickets = await db.supportTicket.findMany({
            orderBy: { lastMessageAt: 'desc' },
            take: 200,
            select: {
              id: true,
              number: true,
              userEmail: true,
              userName: true,
              type: true,
              module: true,
              subject: true,
              status: true,
              priority: true,
              unreadByAdmin: true,
              lastMessageAt: true,
              createdAt: true,
            },
          });
          if (tickets.length === 0) return [];
          const tenant = await db.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { name: true } });
          return tickets.map((t) => ({ ...t, tenantId, tenantName: tenant.name }));
        });
        rows.push(...found);
      } catch (err) {
        this.logger.error(`No se pudieron leer las consultas de ${tenantId}: ${(err as Error).message}`);
      }
    }
    return rows.sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime());
  }

  /** Para el número al lado de "Soporte" en el menú del admin. */
  async counts(): Promise<{ open: number; unread: number }> {
    const rows = await this.list();
    return {
      open: rows.filter((r) => r.status !== 'RESOLVED').length,
      unread: rows.filter((r) => r.unreadByAdmin).length,
    };
  }

  async get(tenantId: string, ticketId: string) {
    await this.assertTenant(tenantId);
    return withTenantContext(this.prisma, tenantId, async () => {
      const db = getTenantDb();
      const ticket = await db.supportTicket.findUnique({ where: { id: ticketId } });
      if (!ticket) throw new NotFoundException('No existe esa consulta');
      const [messages, tenant, user] = await Promise.all([
        db.supportMessage.findMany({
          where: { ticketId },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            authorKind: true,
            authorEmail: true,
            body: true,
            internal: true,
            createdAt: true,
            attachments: { select: { id: true, fileName: true, mimeType: true, sizeBytes: true } },
          },
        }),
        db.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { name: true, taxId: true } }),
        db.user.findUnique({ where: { id: ticket.userId }, select: { id: true, role: true } }),
      ]);
      if (ticket.unreadByAdmin) {
        await db.supportTicket.update({ where: { id: ticketId }, data: { unreadByAdmin: false } });
      }
      return {
        ...ticket,
        unreadByAdmin: false,
        tenantName: tenant.name,
        tenantTaxId: tenant.taxId,
        userRole: user?.role ?? null,
        userExists: Boolean(user),
        messages,
      };
    });
  }

  async reply(
    tenantId: string,
    ticketId: string,
    input: { body: string; internal: boolean; adminEmail: string },
    files: IncomingSupportFile[],
  ) {
    const body = input.body.trim();
    if (body.length < 2 || body.length > 8000) throw new BadRequestException('Escribí la respuesta (hasta 8000 caracteres).');
    validateSupportFiles(files);
    await this.assertTenant(tenantId);
    const sent = await withTenantContext(this.prisma, tenantId, async () => {
      const db = getTenantDb();
      const ticket = await db.supportTicket.findUnique({ where: { id: ticketId } });
      if (!ticket) throw new NotFoundException('No existe esa consulta');
      const stored = await Promise.all(files.map(async (f) => ({ ...f, storageKey: await storeSupportFile(tenantId, f) })));
      const message = await db.supportMessage.create({
        data: { tenantId, ticketId, authorKind: 'ADMIN', authorEmail: input.adminEmail, body, internal: input.internal },
      });
      if (stored.length) {
        await db.supportAttachment.createMany({
          data: stored.map((f) => ({
            tenantId,
            ticketId,
            messageId: message.id,
            fileName: f.fileName,
            mimeType: f.mimeType,
            sizeBytes: f.buffer.length,
            storageKey: f.storageKey,
          })),
        });
      }
      if (!input.internal) {
        // Respondida: queda esperando al usuario (salvo que ya esté resuelta).
        await db.supportTicket.update({
          where: { id: ticketId },
          data: {
            unreadByUser: true,
            lastMessageAt: new Date(),
            ...(ticket.status === 'RESOLVED' ? {} : { status: 'WAITING_USER' }),
          },
        });
      }
      return { ticket, stored };
    });

    if (!input.internal) {
      try {
        await this.email.sendHtmlNotice({
          to: sent.ticket.userEmail,
          ...adminReplyMail({
            number: sent.ticket.number,
            subject: sent.ticket.subject,
            firstName: sent.ticket.userName?.split(' ')[0] || 'hola',
            body,
            appUrl: userTicketUrl(ticketId),
          }),
          attachments: sent.stored.map((f) => ({ filename: f.fileName, content: f.buffer })),
        });
      } catch (err) {
        this.logger.error(`No se pudo mandar la respuesta de #${sent.ticket.number}: ${(err as Error).message}`);
      }
    }
    return { ok: true };
  }

  async update(tenantId: string, ticketId: string, input: { status?: SupportTicketStatus; priority?: SupportTicketPriority }) {
    await this.assertTenant(tenantId);
    return withTenantContext(this.prisma, tenantId, async () => {
      const db = getTenantDb();
      const ticket = await db.supportTicket.findUnique({ where: { id: ticketId }, select: { id: true } });
      if (!ticket) throw new NotFoundException('No existe esa consulta');
      return db.supportTicket.update({
        where: { id: ticketId },
        data: {
          ...(input.priority ? { priority: input.priority } : {}),
          ...(input.status
            ? { status: input.status, resolvedAt: input.status === 'RESOLVED' ? new Date() : null }
            : {}),
        },
        select: { id: true, status: true, priority: true, resolvedAt: true },
      });
    });
  }

  async getAttachment(tenantId: string, attachmentId: string) {
    await this.assertTenant(tenantId);
    const att = await withTenantContext(this.prisma, tenantId, () =>
      getTenantDb().supportAttachment.findUnique({ where: { id: attachmentId } }),
    );
    if (!att) throw new NotFoundException('No existe ese archivo');
    return { fileName: att.fileName, mimeType: att.mimeType, buffer: await readSupportFile(att.storageKey) };
  }

  private async assertTenant(tenantId: string): Promise<void> {
    const found = await this.prisma.$queryRaw<{ id: string }[]>`SELECT id FROM list_tenant_ids() AS id WHERE id = ${tenantId}`;
    if (found.length === 0) throw new NotFoundException('No existe ese tenant');
  }
}
