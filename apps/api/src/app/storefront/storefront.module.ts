import { Module } from '@nestjs/common';
import { SubscriptionModule } from '@plexo/subscriptions';
import { PublicStorefrontController, StorefrontController } from './storefront.controller.js';
import { StorefrontService } from './storefront.service.js';

@Module({
  imports: [SubscriptionModule],
  controllers: [StorefrontController, PublicStorefrontController],
  providers: [StorefrontService],
})
export class StorefrontModule {}
