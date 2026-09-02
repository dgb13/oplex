import { Module } from '@nestjs/common';
import { AccountingModule } from '@plexo/accounting';
import { ConnectorsModule } from '@plexo/connectors';
import { InventoryModule } from '@plexo/inventory';
import { InvoicingModule } from '@plexo/invoicing';
import { MercadoPagoModule } from '@plexo/mercadopago';
import { PurchasesModule } from '@plexo/purchases';
import { ReceivablesModule } from '@plexo/receivables';
import { SubscriptionModule } from '@plexo/subscriptions';
import { TenantSettingsModule } from '@plexo/tenant-settings';
import { AdminBackupsController } from './admin-backups.controller.js';
import { AdminBnaSyncController } from './admin-bna-sync.controller.js';
import { AdminPriceIndexSyncController } from './admin-price-index-sync.controller.js';
import { BackupSchedulerService } from './backup-scheduler.service.js';
import { ExchangeRateSchedulerService } from './exchange-rate-scheduler.service.js';
import { InventoryReplenishmentController } from './inventory-replenishment.controller.js';
import { InventoryReplenishmentSchedulerService } from './inventory-replenishment-scheduler.service.js';
import { MercadoPagoRefreshSchedulerService } from './mercadopago-refresh-scheduler.service.js';
import { PriceIndexSchedulerService } from './price-index-scheduler.service.js';
import { ReceivablesSchedulerService } from './receivables-scheduler.service.js';
import { RemindersController } from './reminders.controller.js';
import { SubscriptionsSchedulerService } from './subscriptions-scheduler.service.js';

@Module({
  imports: [
    ReceivablesModule,
    InvoicingModule,
    TenantSettingsModule,
    SubscriptionModule,
    InventoryModule,
    PurchasesModule,
    MercadoPagoModule,
    ConnectorsModule,
    AccountingModule,
  ],
  controllers: [
    RemindersController,
    AdminBackupsController,
    AdminBnaSyncController,
    AdminPriceIndexSyncController,
    InventoryReplenishmentController,
  ],
  providers: [
    ReceivablesSchedulerService,
    SubscriptionsSchedulerService,
    BackupSchedulerService,
    InventoryReplenishmentSchedulerService,
    ExchangeRateSchedulerService,
    MercadoPagoRefreshSchedulerService,
    PriceIndexSchedulerService,
  ],
})
export class SchedulerModule {}
