import { Module } from '@nestjs/common';
import { WhatsAppLinkController } from './whatsapp-link.controller.js';
import { WhatsAppLinkService } from './whatsapp-link.service.js';

@Module({
  controllers: [WhatsAppLinkController],
  providers: [WhatsAppLinkService],
  exports: [WhatsAppLinkService],
})
export class WhatsAppModule {}
