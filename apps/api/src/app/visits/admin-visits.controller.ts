import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { PlatformAdminGuard } from '@plexo/auth';
import { VISIT_RANGES, type VisitRange, VisitsAnalyticsService } from './visits-analytics.service.js';

// "Visitas" en el panel Admin - sólo lectura.
@Controller('admin/visits')
@UseGuards(PlatformAdminGuard)
export class AdminVisitsController {
  constructor(private readonly visits: VisitsAnalyticsService) {}

  @Get()
  report(@Query('range') range?: string) {
    const days = Number(range);
    const valid = (VISIT_RANGES as readonly number[]).includes(days) ? (days as VisitRange) : 30;
    return this.visits.report(valid);
  }
}
