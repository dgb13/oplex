import { Module } from '@nestjs/common';
import { AfipCredentialsModule } from '@plexo/afip-credentials';
import { SubscriptionModule } from '@plexo/subscriptions';
import { AFIP_PADRON, type AfipPadronPort } from './afip-padron.port.js';
import { CompaniesController } from './companies.controller.js';
import { CompaniesService } from './companies.service.js';
import { CompanyImportController } from './import/company-import.controller.js';
import { CompanyImportService } from './import/company-import.service.js';
import { PersonAvatarService } from './person-avatar.service.js';
import { RealAfipPadronService } from './real-afip-padron.js';
import { StubAfipPadronService } from './stub-afip-padron.js';

@Module({
  imports: [AfipCredentialsModule, SubscriptionModule],
  controllers: [CompanyImportController, CompaniesController],
  providers: [
    CompaniesService,
    CompanyImportService,
    PersonAvatarService,
    RealAfipPadronService,
    StubAfipPadronService,
    // AFIP_PADRON_STUB=true pisa el padrón real por el mock determinístico
    // (ver StubAfipPadronService) - sólo para desarrollo local, nunca seteado
    // en producción. Default (sin la env var): el padrón real con el
    // certificado de Oplex (ArcaPadronService).
    {
      provide: AFIP_PADRON,
      useFactory: (real: RealAfipPadronService, stub: StubAfipPadronService): AfipPadronPort =>
        process.env['AFIP_PADRON_STUB'] === 'true' ? stub : real,
      inject: [RealAfipPadronService, StubAfipPadronService],
    },
  ],
  exports: [CompaniesService],
})
export class CompaniesModule {}
