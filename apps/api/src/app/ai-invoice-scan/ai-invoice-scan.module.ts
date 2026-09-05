import { Module } from '@nestjs/common';
// Alias para no chocar con la clase homónima de este mismo archivo - el lib
// module (@plexo/ai-invoice-scan) sólo provee AiInvoiceExtractionService
// (Anthropic + QR), este composition-root module compone eso con
// PlatformSettings/cupo/circuit-breaker.
import { AiInvoiceScanModule as AiInvoiceScanLibModule } from '@plexo/ai-invoice-scan';
import { SubscriptionModule } from '@plexo/subscriptions';
import { AdminAiInvoiceScanSettingsController } from './admin-ai-invoice-scan-settings.controller.js';
import { AiInvoiceScanController } from './ai-invoice-scan.controller.js';
import { AiInvoiceScanService } from './ai-invoice-scan.service.js';

@Module({
  imports: [SubscriptionModule, AiInvoiceScanLibModule],
  controllers: [AiInvoiceScanController, AdminAiInvoiceScanSettingsController],
  providers: [AiInvoiceScanService],
  exports: [AiInvoiceScanService],
})
export class AiInvoiceScanModule {}
