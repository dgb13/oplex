import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { AccountingModule } from '@plexo/accounting';
import { ActivityLogModule } from '@plexo/activity-log';
import { JwtAuthGuard, ModuleAccessGuard, MustChangePasswordGuard, RolesGuard } from '@plexo/auth';
import { CompaniesModule } from '@plexo/companies';
import { DatabaseModule } from '@plexo/database';
import { EncryptionModule } from '@plexo/encryption';
import { InventoryModule } from '@plexo/inventory';
import { InventoryCartModule } from '@plexo/inventory-cart';
import { InvoicingModule } from '@plexo/invoicing';
import { MercadoPagoModule } from '@plexo/mercadopago';
import { PayablesModule } from '@plexo/payables';
import { PurchasesModule } from '@plexo/purchases';
import { QuotesModule } from '@plexo/quotes';
import { ReceivablesModule } from '@plexo/receivables';
import { ReportsFinancialModule } from '@plexo/reports-financial';
import { ReportsPnlModule } from '@plexo/reports-pnl';
import { ReportsSalesModule } from '@plexo/reports-sales';
import { SubscriptionModule } from '@plexo/subscriptions';
import { TaxesModule } from '@plexo/taxes';
import { TenantSettingsModule } from '@plexo/tenant-settings';
import { AdminModule } from './admin/admin.module.js';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module.js';
import { BankReconciliationModule } from './bank-reconciliation/bank-reconciliation.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { GoodsReceiptsModule } from './goods-receipts/goods-receipts.module.js';
import { InventoryCartCheckoutModule } from './inventory-cart-checkout/inventory-cart-checkout.module.js';
import { PurchaseCreditNotesModule } from './purchase-credit-notes/purchase-credit-notes.module.js';
import { PurchaseInvoicesModule } from './purchase-invoices/purchase-invoices.module.js';
import { SalesModule } from './sales/sales.module.js';
import { SchedulerModule } from './scheduler/scheduler.module.js';
import { SupplierReturnsModule } from './supplier-returns/supplier-returns.module.js';
import { SystemModule } from './system/system.module.js';
import { TreasuryModule } from './treasury/treasury.module.js';
import { UsersModule } from './users/users.module.js';
import { MercadoPagoWebhookModule } from './webhooks/mercadopago-webhook.module.js';

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    DatabaseModule,
    EncryptionModule,
    AuthModule,
    CompaniesModule,
    InventoryModule,
    InventoryCartModule,
    InvoicingModule,
    ReceivablesModule,
    PayablesModule,
    AccountingModule,
    TaxesModule,
    ReportsPnlModule,
    ReportsSalesModule,
    ReportsFinancialModule,
    SalesModule,
    DashboardModule,
    SchedulerModule,
    TenantSettingsModule,
    ActivityLogModule,
    PurchasesModule,
    QuotesModule,
    InventoryCartCheckoutModule,
    GoodsReceiptsModule,
    SupplierReturnsModule,
    PurchaseInvoicesModule,
    PurchaseCreditNotesModule,
    TreasuryModule,
    BankReconciliationModule,
    SubscriptionModule,
    MercadoPagoModule,
    MercadoPagoWebhookModule,
    AdminModule,
    SystemModule,
    UsersModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Order matters: JwtAuthGuard populates request.user before the other
    // three read it. Nest always runs global guards in this registration order.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ModuleAccessGuard },
    { provide: APP_GUARD, useClass: MustChangePasswordGuard },
  ],
})
export class AppModule {}
