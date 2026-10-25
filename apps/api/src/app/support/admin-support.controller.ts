import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Req, StreamableFile, UseGuards } from '@nestjs/common';
import { CurrentUser, PlatformAdminGuard } from '@plexo/auth';
import type { AuthenticatedUser } from '@plexo/types';
import type { FastifyRequest } from 'fastify';
import { AdminSupportService } from './admin-support.service.js';
import { UpdateSupportTicketDto } from './dto/update-support-ticket.dto.js';
import { readSupportForm } from './support-multipart.js';

/** Bandeja de Soporte del backoffice (sólo PLATFORM_ADMIN_EMAILS). */
@Controller('admin/support')
@UseGuards(PlatformAdminGuard)
export class AdminSupportController {
  constructor(private readonly support: AdminSupportService) {}

  @Get('tickets')
  list() {
    return this.support.list();
  }

  @Get('counts')
  counts() {
    return this.support.counts();
  }

  @Get('tickets/:tenantId/:id')
  get(@Param('tenantId') tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.support.get(tenantId, id);
  }

  @Patch('tickets/:tenantId/:id')
  update(
    @Param('tenantId') tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSupportTicketDto,
  ) {
    return this.support.update(tenantId, id, dto);
  }

  /** Multipart: body, internal ("true"/"false") y files[]. */
  @Post('tickets/:tenantId/:id/messages')
  async reply(
    @Param('tenantId') tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: FastifyRequest,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    const { fields, files } = await readSupportForm(req);
    return this.support.reply(
      tenantId,
      id,
      { body: fields['body'] ?? '', internal: fields['internal'] === 'true', adminEmail: admin.email },
      files,
    );
  }

  @Get('attachments/:tenantId/:id')
  async attachment(@Param('tenantId') tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    const file = await this.support.getAttachment(tenantId, id);
    return new StreamableFile(file.buffer, {
      type: file.mimeType,
      disposition: `inline; filename="${encodeURIComponent(file.fileName)}"`,
    });
  }
}
