import { Controller, Get, Query } from '@nestjs/common';
import { RequireModuleAccess } from '@plexo/auth';
import { DateRangeQueryDto } from './dto/date-range-query.dto.js';
import { ReportsSalesService } from './reports-sales.service.js';

const MODULE = 'reports-sales';

@Controller('reports/sales')
export class ReportsSalesController {
  constructor(private readonly reportsSalesService: ReportsSalesService) {}

  @RequireModuleAccess(MODULE, 'read')
  @Get('by-customer')
  getSalesByCustomer(@Query() query: DateRangeQueryDto) {
    return this.reportsSalesService.getSalesByCustomer(
      query.from ? new Date(query.from) : undefined,
      query.to ? new Date(query.to) : undefined,
    );
  }

  @RequireModuleAccess(MODULE, 'read')
  @Get('by-product')
  getSalesByProduct(@Query() query: DateRangeQueryDto) {
    return this.reportsSalesService.getSalesByProduct(
      query.from ? new Date(query.from) : undefined,
      query.to ? new Date(query.to) : undefined,
    );
  }

  @RequireModuleAccess(MODULE, 'read')
  @Get('by-month')
  getRevenueByMonth(@Query() query: DateRangeQueryDto) {
    return this.reportsSalesService.getRevenueByMonth(
      query.from ? new Date(query.from) : undefined,
      query.to ? new Date(query.to) : undefined,
    );
  }

  @RequireModuleAccess(MODULE, 'read')
  @Get('by-seller')
  getSalesBySeller(@Query() query: DateRangeQueryDto) {
    return this.reportsSalesService.getSalesBySeller(
      query.from ? new Date(query.from) : undefined,
      query.to ? new Date(query.to) : undefined,
    );
  }
}
