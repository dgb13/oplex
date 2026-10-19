import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { Roles } from '@plexo/auth';
import { AssistantChannel } from '@plexo/database';
import { AssistantHistoryService } from './assistant-history.service.js';

// Mismo gate que Preferencias (PATCH /tenant-settings): el historial cruza a
// todos los usuarios del tenant, no es algo personal.
const HISTORY_ROLES = ['OWNER', 'ADMIN'] as const;

function parseChannel(raw: string | undefined): AssistantChannel | undefined {
  if (!raw) {
    return undefined;
  }
  if (raw !== AssistantChannel.WEB && raw !== AssistantChannel.WHATSAPP) {
    throw new BadRequestException('Canal inválido');
  }
  return raw;
}

function parseBefore(raw: string | undefined): Date | undefined {
  if (!raw) {
    return undefined;
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException('Cursor inválido');
  }
  return date;
}

@Controller('assistant/history')
export class AssistantHistoryController {
  constructor(private readonly assistantHistoryService: AssistantHistoryService) {}

  @Roles(...HISTORY_ROLES)
  @Get()
  list(
    @Query('channel') channel?: string,
    @Query('blocked') blocked?: string,
    @Query('actions') actions?: string,
    @Query('before') before?: string,
  ) {
    return this.assistantHistoryService.list({
      channel: parseChannel(channel),
      onlyBlocked: blocked === 'true',
      onlyActions: actions === 'true',
      before: parseBefore(before),
    });
  }

  @Roles(...HISTORY_ROLES)
  @Get('stats')
  stats() {
    return this.assistantHistoryService.statsToday();
  }
}
