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
    // `to` llega como fecha sola (YYYY-MM-DD), que parsea a medianoche UTC -
    // sin este ajuste, `to` sería el MISMO instante que un `from` del mismo
    // día (vista Día, from===to) y la ventana quedaría con ancho cero. Se
    // empuja al final del día para que el rango sea inclusivo de verdad,
    // consistente sin importar cuántos días separen from de to.
    const to = new Date(query.to);
    to.setUTCHours(23, 59, 59, 999);
    return this.agendaService.getCalendarEntries(user, new Date(query.from), to, kinds);
  }
}
