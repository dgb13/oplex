import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { CalendarEventService } from './calendar-event.service.js';
import { CreateCalendarEventDto } from './dto/create-calendar-event.dto.js';
import { UpdateCalendarEventDto } from './dto/update-calendar-event.dto.js';

@Controller('calendar/events')
export class CalendarEventController {
  constructor(private readonly calendarEventService: CalendarEventService) {}

  @Get()
  list() {
    return this.calendarEventService.list();
  }

  @Post()
  create(@Body() dto: CreateCalendarEventDto) {
    return this.calendarEventService.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCalendarEventDto) {
    return this.calendarEventService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.calendarEventService.remove(id);
  }
}
