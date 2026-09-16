import { Module } from '@nestjs/common';
import { CalendarModule } from '@plexo/calendar';
import { PayablesModule } from '@plexo/payables';
import { ReceivablesModule } from '@plexo/receivables';
import { TaxesModule } from '@plexo/taxes';
import { AgendaController } from './agenda.controller.js';
import { AgendaService } from './agenda.service.js';

@Module({
  imports: [TaxesModule, ReceivablesModule, PayablesModule, CalendarModule],
  controllers: [AgendaController],
  providers: [AgendaService],
})
export class AgendaModule {}
