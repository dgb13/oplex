import { Module } from '@nestjs/common';
import { ReportsPurchasesController } from './reports-purchases.controller.js';
import { ReportsPurchasesService } from './reports-purchases.service.js';

@Module({
  controllers: [ReportsPurchasesController],
  providers: [ReportsPurchasesService],
  exports: [ReportsPurchasesService],
})
export class ReportsPurchasesModule {}
