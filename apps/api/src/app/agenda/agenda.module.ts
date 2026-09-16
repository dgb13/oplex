import { Module } from '@nestjs/common';
import { CalendarModule } from '@plexo/calendar';
import { InvoicingModule } from '@plexo/invoicing';
import { PayablesModule } from '@plexo/payables';
import { PosModule } from '@plexo/pos';
import { ProductionModule } from '@plexo/production';
import { ReceivablesModule } from '@plexo/receivables';
import { SubscriptionModule } from '@plexo/subscriptions';
import { TaxesModule } from '@plexo/taxes';
import { AgendaController } from './agenda.controller.js';
import { AgendaService } from './agenda.service.js';

@Module({
  imports: [
    TaxesModule,
    ReceivablesModule,
    PayablesModule,
    CalendarModule,
    InvoicingModule,
    ProductionModule,
    PosModule,
    SubscriptionModule,
  ],
  controllers: [AgendaController],
  providers: [AgendaService],
})
export class AgendaModule {}
