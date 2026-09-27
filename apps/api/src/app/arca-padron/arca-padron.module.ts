import { Module } from '@nestjs/common';
import { AiInvoiceScanModule as AiInvoiceScanLibModule } from '@plexo/ai-invoice-scan';
import { ArcaConstanciaController } from './arca-constancia.controller.js';

@Module({
  imports: [AiInvoiceScanLibModule],
  controllers: [ArcaConstanciaController],
})
export class ArcaPadronModule {}
