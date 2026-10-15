import { Module } from '@nestjs/common';
import { AiInvoiceScanModule as AiInvoiceScanLibModule } from '@plexo/ai-invoice-scan';
import { ArcaConstanciaLinkService } from './arca-constancia-link.service.js';
import { ArcaConstanciaController } from './arca-constancia.controller.js';

@Module({
  imports: [AiInvoiceScanLibModule],
  controllers: [ArcaConstanciaController],
  providers: [ArcaConstanciaLinkService],
  exports: [ArcaConstanciaLinkService],
})
export class ArcaPadronModule {}
