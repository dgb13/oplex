import { Module } from '@nestjs/common';
import { SubscriptionModule } from '@plexo/subscriptions';
import { AssistantModule } from '../assistant/assistant.module.js';
import { WhatsAppModule } from '../whatsapp/whatsapp.module.js';
import { WhatsAppCloudApiClient } from '../whatsapp/whatsapp-cloud-api.client.js';
import { WhatsAppWebhookController } from './whatsapp-webhook.controller.js';
import { WhatsAppWebhookService } from './whatsapp-webhook.service.js';

@Module({
  imports: [AssistantModule, WhatsAppModule, SubscriptionModule],
  controllers: [WhatsAppWebhookController],
  providers: [WhatsAppWebhookService, WhatsAppCloudApiClient],
})
export class WhatsAppWebhookModule {}
