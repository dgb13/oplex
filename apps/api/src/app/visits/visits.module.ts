import { Module } from '@nestjs/common';
import { AdminVisitsController } from './admin-visits.controller.js';
import { VisitsAnalyticsService } from './visits-analytics.service.js';

@Module({
  controllers: [AdminVisitsController],
  providers: [VisitsAnalyticsService],
})
export class VisitsModule {}
