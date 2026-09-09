import { Module } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { InventoryModule } from '@plexo/inventory';
import { PosModule } from '@plexo/pos';
import { ReceivablesModule } from '@plexo/receivables';
import { ReportsSalesModule } from '@plexo/reports-sales';
import { SubscriptionModule } from '@plexo/subscriptions';
import { AdminAssistantSettingsController } from './admin-assistant-settings.controller.js';
import { AssistantController } from './assistant.controller.js';
import { ASSISTANT_ANTHROPIC_CLIENT } from './assistant-anthropic-client.token.js';
import { AssistantConversationService } from './assistant-conversation.service.js';
import { AssistantHelpService } from './assistant-help.service.js';
import { AssistantIntentRouterService } from './assistant-intent-router.service.js';
import { AssistantOrchestratorService } from './assistant-orchestrator.service.js';
import { AssistantSettingsService } from './assistant-settings.service.js';
import { AssistantToolsService } from './assistant-tools.service.js';

@Module({
  imports: [ReportsSalesModule, ReceivablesModule, PosModule, InventoryModule, SubscriptionModule],
  controllers: [AssistantController, AdminAssistantSettingsController],
  providers: [
    AssistantSettingsService,
    AssistantConversationService,
    AssistantToolsService,
    AssistantIntentRouterService,
    AssistantHelpService,
    AssistantOrchestratorService,
    {
      provide: ASSISTANT_ANTHROPIC_CLIENT,
      useFactory: () => new Anthropic({ apiKey: process.env.ANTHROPIC_ASSISTANT_API_KEY }),
    },
  ],
  exports: [AssistantToolsService],
})
export class AssistantModule {}
