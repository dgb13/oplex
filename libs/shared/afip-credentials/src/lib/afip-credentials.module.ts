import { Module } from '@nestjs/common';
import { AfipCredentialsService } from './afip-credentials.service.js';
import { ArcaPadronService } from './arca-padron.service.js';

// Not @Global() - only companies (padrón), invoicing (WSFE) and Admin need
// this, unlike DatabaseModule/EncryptionModule which everything touches.
@Module({
  providers: [AfipCredentialsService, ArcaPadronService],
  exports: [AfipCredentialsService, ArcaPadronService],
})
export class AfipCredentialsModule {}
