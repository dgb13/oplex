import { BadRequestException, Controller, Get, Param, ParseUUIDPipe, Post, Req, StreamableFile } from '@nestjs/common';
import type { SupportTicketType } from '@plexo/database';
import { AllowWhenReadOnly } from '@plexo/subscriptions';
import type { FastifyRequest } from 'fastify';
import { parseSupportContext, readSupportForm } from './support-multipart.js';
import { SUPPORT_TYPES, SupportService } from './support.service.js';

const MODULES_MAX = 60;

/** "Ayuda y soporte" del usuario. Anda aunque la cuenta esté en sólo lectura:
 * justo ahí es cuando más se necesita escribirnos. */
@AllowWhenReadOnly()
@Controller('support')
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Get('tickets')
  list() {
    return this.support.listMine();
  }

  @Get('unread')
  unread() {
    return this.support.unreadCount();
  }

  /** Multipart: type, module, subject, body, context (JSON) y files[]. */
  @Post('tickets')
  async create(@Req() req: FastifyRequest) {
    const { fields, files } = await readSupportForm(req);
    const type = fields['type'] as SupportTicketType;
    if (!SUPPORT_TYPES.includes(type)) throw new BadRequestException('Elegí si es un error, una consulta o una sugerencia.');
    const module = (fields['module'] ?? '').trim().slice(0, MODULES_MAX) || 'Otra';
    return this.support.create(
      {
        type,
        module,
        subject: (fields['subject'] ?? '').trim(),
        body: (fields['body'] ?? '').trim(),
        context: parseSupportContext(fields['context']),
      },
      files,
    );
  }

  @Get('tickets/:id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.support.getMine(id);
  }

  /** Multipart: body y files[]. */
  @Post('tickets/:id/messages')
  async reply(@Param('id', ParseUUIDPipe) id: string, @Req() req: FastifyRequest) {
    const { fields, files } = await readSupportForm(req);
    return this.support.reply(id, fields['body'] ?? '', files);
  }

  @Get('attachments/:id')
  async attachment(@Param('id', ParseUUIDPipe) id: string) {
    const file = await this.support.getAttachment(id);
    return new StreamableFile(file.buffer, {
      type: file.mimeType,
      disposition: `inline; filename="${encodeURIComponent(file.fileName)}"`,
    });
  }
}
