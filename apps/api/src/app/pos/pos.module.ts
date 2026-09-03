import { Module } from '@nestjs/common';
import { AccountingModule } from '@plexo/accounting';
import { PosModule as PosLibModule } from '@plexo/pos';
import { ReportsFinancialModule } from '@plexo/reports-financial';
import { PosController } from './pos.controller.js';
import { PosService } from './pos.service.js';
import { SalesModule } from '../sales/sales.module.js';

@Module({
  imports: [PosLibModule, SalesModule, AccountingModule, ReportsFinancialModule],
  controllers: [PosController],
  providers: [PosService],
})
export class PosModule {}
