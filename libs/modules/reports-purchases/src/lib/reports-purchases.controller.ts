import { Controller, Get, Query } from '@nestjs/common';
import { RequireModuleAccess } from '@plexo/auth';
import { DateRangeQueryDto } from './dto/date-range-query.dto.js';
import { ReportsPurchasesService } from './reports-purchases.service.js';

const MODULE = 'reports-purchases';

@Controller('reports/purchases')
export class ReportsPurchasesController {
  constructor(private readonly reportsPurchasesService: ReportsPurchasesService) {}

  @RequireModuleAccess(MODULE, 'read')
  @Get('by-supplier')
  getPurchasesBySupplier(@Query() query: DateRangeQueryDto) {
    return this.reportsPurchasesService.getPurchasesBySupplier(
      query.from ? new Date(query.from) : undefined,
      query.to ? new Date(query.to) : undefined,
    );
  }

  @RequireModuleAccess(MODULE, 'read')
  @Get('by-buyer')
  getPurchasesByBuyer(@Query() query: DateRangeQueryDto) {
    return this.reportsPurchasesService.getPurchasesByBuyer(
      query.from ? new Date(query.from) : undefined,
      query.to ? new Date(query.to) : undefined,
    );
  }
}
