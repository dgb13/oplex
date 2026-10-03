import { Module } from '@nestjs/common';
import { createResendDomainClient, RESEND_DOMAIN_CLIENT } from './resend-domain-client.provider.js';
import { TenantSettingsController } from './tenant-settings.controller.js';
import { TenantLogoService } from './tenant-logo.service.js';
import { TenantSettingsService } from './tenant-settings.service.js';

@Module({
  controllers: [TenantSettingsController],
  providers: [
    TenantSettingsService,
    TenantLogoService,
    { provide: RESEND_DOMAIN_CLIENT, useFactory: createResendDomainClient },
  ],
  exports: [TenantSettingsService],
})
export class TenantSettingsModule {}
