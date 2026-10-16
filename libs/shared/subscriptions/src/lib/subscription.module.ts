import { Module } from '@nestjs/common';
import { AuthEmailModule } from '@plexo/auth-email';
import { AdminPlansController } from './admin-plans.controller.js';
import { PlansController } from './plans.controller.js';
import { SubscriptionsController } from './subscriptions.controller.js';
import { SubscriptionBillingService } from './subscription-billing.service.js';
import { SubscriptionNoticeService } from './subscription-notice.service.js';
import { SubscriptionReceiptService } from './subscription-receipt.service.js';
import { SubscriptionService } from './subscription.service.js';

@Module({
  imports: [AuthEmailModule],
  controllers: [PlansController, SubscriptionsController, AdminPlansController],
  providers: [SubscriptionService, SubscriptionBillingService, SubscriptionReceiptService, SubscriptionNoticeService],
  exports: [SubscriptionService, SubscriptionBillingService, SubscriptionNoticeService],
})
export class SubscriptionModule {}
