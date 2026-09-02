import { Body, Controller, Get, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { PlatformAdminGuard } from '@plexo/auth';
import { InflationAdjustmentRangeDto, PriceIndexService, UpsertPriceIndexPeriodDto } from '@plexo/accounting';
import { UpdatePriceIndexSyncSettingsDto } from './dto/update-price-index-sync-settings.dto.js';
import { PriceIndexSchedulerService } from './price-index-scheduler.service.js';

// "Índices de Inflación" en el panel Admin - horario/on-off del sweep
// global (no es por tenant, ver PriceIndexSchedulerService) + "Sincronizar
// ahora" + listado/carga manual de períodos.
@Controller('admin/price-index-sync')
@UseGuards(PlatformAdminGuard)
export class AdminPriceIndexSyncController {
  constructor(
    private readonly priceIndexScheduler: PriceIndexSchedulerService,
    private readonly priceIndexService: PriceIndexService,
  ) {}

  @Get()
  getSettings() {
    return this.priceIndexScheduler.getSettings();
  }

  @Patch()
  updateSettings(@Body() dto: UpdatePriceIndexSyncSettingsDto) {
    return this.priceIndexScheduler.updateSettings(dto);
  }

  @Post('sync-now')
  syncNow() {
    return this.priceIndexScheduler.syncNow();
  }

  @Get('periods')
  listPeriods(@Query() query: Partial<InflationAdjustmentRangeDto>) {
    return this.priceIndexService.list(
      query.from ? new Date(query.from) : undefined,
      query.to ? new Date(query.to) : undefined,
    );
  }

  @Post('periods')
  upsertPeriod(@Body() dto: UpsertPriceIndexPeriodDto) {
    return this.priceIndexService.upsertPeriod(new Date(dto.period), dto.variationPct, 'MANUAL');
  }
}
