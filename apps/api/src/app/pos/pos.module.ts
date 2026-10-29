import { Module } from '@nestjs/common';
import { AccountingModule } from '@plexo/accounting';
import { ConnectorsModule } from '@plexo/connectors';
import { MercadoPagoModule } from '@plexo/mercadopago';
import { PosModule as PosLibModule } from '@plexo/pos';
import { ReportsFinancialModule } from '@plexo/reports-financial';
import { PosPointChargesController } from './pos-point-charges.controller.js';
import { PosPointChargesSchedulerService } from './pos-point-charges-scheduler.service.js';
import { PosPointChargesService } from './pos-point-charges.service.js';
import { PosController } from './pos.controller.js';
import { PosService } from './pos.service.js';
import { SalesModule } from '../sales/sales.module.js';

@Module({
  imports: [PosLibModule, SalesModule, AccountingModule, ReportsFinancialModule, MercadoPagoModule, ConnectorsModule],
  controllers: [PosController, PosPointChargesController],
  providers: [PosService, PosPointChargesService, PosPointChargesSchedulerService],
})
export class PosModule {}
