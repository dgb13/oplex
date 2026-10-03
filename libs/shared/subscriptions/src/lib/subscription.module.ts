import { Module } from '@nestjs/common';
import { AdminPlansController } from './admin-plans.controller.js';
import { PlansController } from './plans.controller.js';
import { SubscriptionsController } from './subscriptions.controller.js';
import { SubscriptionBillingService } from './subscription-billing.service.js';
import { SubscriptionService } from './subscription.service.js';

@Module({
  controllers: [PlansController, SubscriptionsController, AdminPlansController],
  providers: [SubscriptionService, SubscriptionBillingService],
  exports: [SubscriptionService, SubscriptionBillingService],
})
export class SubscriptionModule {}
