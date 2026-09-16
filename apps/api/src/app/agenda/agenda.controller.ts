import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser } from '@plexo/auth';
import type { AuthenticatedUser, CalendarEntrySource } from '@plexo/types';
import { AgendaService } from './agenda.service.js';
import { CalendarQueryDto } from './dto/calendar-query.dto.js';

@Controller('calendar')
export class AgendaController {
  constructor(private readonly agendaService: AgendaService) {}

  @Get()
  getEntries(@CurrentUser() user: AuthenticatedUser, @Query() query: CalendarQueryDto) {
    const kinds = query.kinds?.split(',').filter(Boolean) as CalendarEntrySource[] | undefined;
    return this.agendaService.getCalendarEntries(user, new Date(query.from), new Date(query.to), kinds);
  }
}
