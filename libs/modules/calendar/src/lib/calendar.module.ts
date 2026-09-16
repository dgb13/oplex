import { Module } from '@nestjs/common';
import { CalendarEventController } from './calendar-event.controller.js';
import { CalendarEventService } from './calendar-event.service.js';

@Module({
  controllers: [CalendarEventController],
  providers: [CalendarEventService],
  exports: [CalendarEventService],
})
export class CalendarModule {}
