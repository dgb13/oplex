import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AUTH_EMAIL_SENDER, type AuthEmailSender } from '@plexo/auth-email';
import { getTenantDb, getTenantId, getUserId, type SupportTicketType } from '@plexo/database';
import { formatRoles, OPLEX_SUPPORT_EMAIL } from '@plexo/types';
import { newTicketForSupportMail, ticketReceivedMail, userReplyForSupportMail } from './support-email.js';
import { readSupportFile, storeSupportFile, validateSupportFiles, type IncomingSupportFile } from './support-files.js';

const FRONTEND_URL = process.env['FRONTEND_URL'] ?? 'http://localhost:4200';

export const SUPPORT_TYPES: SupportTicketType[] = ['ERROR', 'QUESTION', 'SUGGESTION'];

export interface CreateTicketInput {
  type: SupportTicketType;
  module: string;
  subject: string;
  body: string;
  context: Record<string, string> | null;
}

export function adminTicketUrl(tenantId: string, ticketId: string): string {
  return `${FRONTEND_URL}/admin/support?ticket=${tenantId}.${ticketId}`;
}

export function userTicketUrl(ticketId: string): string {
  return `${FRONTEND_URL}/support?ticket=${ticketId}`;
}

export function validateTicketText(subject: string, body: string): void {
  if (subject.length < 3 || subject.length > 150) {
    throw new BadRequestException('El asunto tiene que tener entre 3 y 150 caracteres.');
  }
  if (body.length < 5 || body.length > 8000) {
    throw new BadRequestException('Contanos el detalle (entre 5 y 8000 caracteres).');
  }
}

/**
 * Soporte, lado del usuario: crear consultas, verlas y responder. Corre en
 * el contexto del tenant del request (RLS). Cada usuario ve sólo las suyas.
 * Los correos salen después de guardar: si Resend falla, la consulta ya
 * quedó registrada y el admin la ve en el panel igual.
 */
@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);

  constructor(@Inject(AUTH_EMAIL_SENDER) private readonly email: AuthEmailSender) {}

  async create(input: CreateTicketInput, files: IncomingSupportFile[]) {
    validateTicketText(input.subject, input.body);
    validateSupportFiles(files);
    const db = getTenantDb();
    const tenantId = getTenantId();
    const userId = getUserId();
    if (!userId) throw new BadRequestException('Sesión inválida');
    const [user, tenant] = await Promise.all([
      db.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, name: true, roles: true } }),
      db.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { name: true, taxId: true } }),
    ]);

    const stored = await Promise.all(files.map(async (f) => ({ ...f, storageKey: await storeSupportFile(tenantId, f) })));
    const ticket = await db.supportTicket.create({
      data: {
        tenantId,
        userId,
        userEmail: user.email,
        userName: user.name,
        type: input.type,
        module: input.module,
        subject: input.subject,
        context: input.context ?? undefined,
      },
    });
    const message = await db.supportMessage.create({
      data: { tenantId, ticketId: ticket.id, authorKind: 'USER', authorEmail: user.email, body: input.body },
    });
    if (stored.length) {
      await db.supportAttachment.createMany({
        data: stored.map((f) => ({
          tenantId,
          ticketId: ticket.id,
          messageId: message.id,
          fileName: f.fileName,
          mimeType: f.mimeType,
          sizeBytes: f.buffer.length,
          storageKey: f.storageKey,
        })),
      });
    }

    try {
      await this.email.sendHtmlNotice({
        to: OPLEX_SUPPORT_EMAIL,
        replyTo: user.email,
        ...newTicketForSupportMail({
          number: ticket.number,
          type: input.type,
          module: input.module,
          subject: input.subject,
          body: input.body,
          tenantName: tenant.name,
          tenantTaxId: tenant.taxId,
          userEmail: user.email,
          userName: user.name,
          role: formatRoles(user.roles),
          context: input.context,
          attachmentCount: stored.length,
          adminUrl: adminTicketUrl(tenantId, ticket.id),
        }),
        attachments: stored.map((f) => ({ filename: f.fileName, content: f.buffer })),
      });
      await this.email.sendHtmlNotice({
        to: user.email,
        ...ticketReceivedMail({
          number: ticket.number,
          subject: input.subject,
          firstName: user.name?.split(' ')[0] || 'hola',
          appUrl: userTicketUrl(ticket.id),
        }),
      });
    } catch (err) {
      this.logger.error(`No se pudo avisar la consulta #${ticket.number}: ${(err as Error).message}`);
    }
    return { id: ticket.id, number: ticket.number };
  }

  async listMine() {
    const userId = getUserId();
    return getTenantDb().supportTicket.findMany({
      where: { userId: userId ?? '' },
      orderBy: { lastMessageAt: 'desc' },
      select: {
        id: true,
        number: true,
        type: true,
        module: true,
        subject: true,
        status: true,
        unreadByUser: true,
        lastMessageAt: true,
        createdAt: true,
      },
    });
  }

  async unreadCount(): Promise<{ unread: number }> {
    const userId = getUserId();
    const unread = await getTenantDb().supportTicket.count({ where: { userId: userId ?? '', unreadByUser: true } });
    return { unread };
  }

  async getMine(ticketId: string) {
    const db = getTenantDb();
    const ticket = await this.findOwnTicket(ticketId);
    const messages = await db.supportMessage.findMany({
      where: { ticketId, internal: false },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        authorKind: true,
        body: true,
        createdAt: true,
        attachments: { select: { id: true, fileName: true, mimeType: true, sizeBytes: true } },
      },
    });
    if (ticket.unreadByUser) {
      await db.supportTicket.update({ where: { id: ticketId }, data: { unreadByUser: false } });
    }
    return { ...ticket, unreadByUser: false, messages };
  }

  async reply(ticketId: string, body: string, files: IncomingSupportFile[]) {
    if (body.trim().length < 2 || body.length > 8000) {
      throw new BadRequestException('Escribí tu respuesta (hasta 8000 caracteres).');
    }
    validateSupportFiles(files);
    const db = getTenantDb();
    const tenantId = getTenantId();
    const ticket = await this.findOwnTicket(ticketId);
    const stored = await Promise.all(files.map(async (f) => ({ ...f, storageKey: await storeSupportFile(tenantId, f) })));
    const message = await db.supportMessage.create({
      data: { tenantId, ticketId, authorKind: 'USER', authorEmail: ticket.userEmail, body: body.trim() },
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
    // Responder reabre la consulta si estaba esperando o resuelta.
    await db.supportTicket.update({
      where: { id: ticketId },
      data: {
        unreadByAdmin: true,
        lastMessageAt: new Date(),
        ...(ticket.status === 'WAITING_USER' || ticket.status === 'RESOLVED'
          ? { status: 'IN_PROGRESS', resolvedAt: null }
          : {}),
      },
    });

    try {
      const tenant = await db.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { name: true } });
      await this.email.sendHtmlNotice({
        to: OPLEX_SUPPORT_EMAIL,
        replyTo: ticket.userEmail,
        ...userReplyForSupportMail({
          number: ticket.number,
          subject: ticket.subject,
          tenantName: tenant.name,
          userEmail: ticket.userEmail,
          body: body.trim(),
          adminUrl: adminTicketUrl(tenantId, ticketId),
        }),
        attachments: stored.map((f) => ({ filename: f.fileName, content: f.buffer })),
      });
    } catch (err) {
      this.logger.error(`No se pudo avisar la respuesta en #${ticket.number}: ${(err as Error).message}`);
    }
    return { ok: true };
  }

  /** Un adjunto de una consulta propia, nunca de una nota interna. */
  async getAttachment(attachmentId: string) {
    const db = getTenantDb();
    const att = await db.supportAttachment.findUnique({
      where: { id: attachmentId },
      include: { ticket: { select: { userId: true } }, message: { select: { internal: true } } },
    });
    if (!att || att.ticket.userId !== getUserId() || att.message.internal) {
      throw new NotFoundException('No existe ese archivo');
    }
    return { fileName: att.fileName, mimeType: att.mimeType, buffer: await readSupportFile(att.storageKey) };
  }

  private async findOwnTicket(ticketId: string) {
    const ticket = await getTenantDb().supportTicket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        number: true,
        userId: true,
        userEmail: true,
        type: true,
        module: true,
        subject: true,
        status: true,
        unreadByUser: true,
        createdAt: true,
        lastMessageAt: true,
      },
    });
    if (!ticket || ticket.userId !== getUserId()) throw new NotFoundException('No existe esa consulta');
    return ticket;
  }
}
