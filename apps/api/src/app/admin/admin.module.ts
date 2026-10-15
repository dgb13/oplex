import { Module } from '@nestjs/common';
import { AfipCredentialsModule } from '@plexo/afip-credentials';
import { SubscriptionModule } from '@plexo/subscriptions';
import { AuthModule } from '../auth/auth.module.js';
import { ArcaPadronModule } from '../arca-padron/arca-padron.module.js';
import { AdminAiStatusController } from './admin-ai-status.controller.js';
import { AdminArcaConstanciaLinkController } from './admin-arca-constancia-link.controller.js';
import { AdminAiStatusService } from './admin-ai-status.service.js';
import { AdminArcaPadronController } from './admin-arca-padron.controller.js';
import { AdminAuditController } from './admin-audit.controller.js';
import { AdminAuditService } from './admin-audit.service.js';
import { AdminMercadoPagoController } from './admin-mercadopago.controller.js';
import { AdminMercadoPagoService } from './admin-mercadopago.service.js';
import { AdminSystemStatusController } from './admin-system-status.controller.js';
import { AdminSystemStatusService } from './admin-system-status.service.js';
import { AdminTenantsController } from './admin-tenants.controller.js';
import { AdminTenantsService } from './admin-tenants.service.js';

import { AdminSubscriptionsController } from './admin-subscriptions.controller.js';
import { AdminSubscriptionsService } from './admin-subscriptions.service.js';

@Module({
  imports: [SubscriptionModule, AuthModule, AfipCredentialsModule, ArcaPadronModule],
  controllers: [
    AdminTenantsController,
    AdminAuditController,
    AdminMercadoPagoController,
    AdminSystemStatusController,
    AdminArcaPadronController,
    AdminAiStatusController,
    AdminArcaConstanciaLinkController,
    AdminSubscriptionsController,
  ],
  providers: [AdminAiStatusService, AdminTenantsService, AdminAuditService, AdminMercadoPagoService, AdminSystemStatusService, AdminSubscriptionsService],
})
export class AdminModule {}
