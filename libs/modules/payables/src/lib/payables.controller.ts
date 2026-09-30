import { Controller, Get, Param, ParseUUIDPipe, Query, StreamableFile } from '@nestjs/common';
import { Roles } from '@plexo/auth';
import { StatementQueryDto } from './dto/statement-query.dto.js';
import { PayablesService, type GetSupplierStatementOptions } from './payables.service.js';
import { SupplierStatementExcelService } from './statement/supplier-statement-excel.service.js';
import { SupplierStatementPdfService } from './statement/supplier-statement-pdf.service.js';

// Same read-access terna as the rest of Compras (INVENTORY, not SALES -
// see purchase-order.controller.ts's own WRITE_ROLES) plus ACCOUNTANT,
// same criterion as ReceivablesController's READ_ROLES.
const READ_ROLES = ['OWNER', 'ADMIN', 'ACCOUNTANT', 'INVENTORY', 'PURCHASES'] as const;

function parseStatementOptions(query: StatementQueryDto, pendingOnly?: string): GetSupplierStatementOptions {
  return {
    from: query.from ? new Date(query.from) : undefined,
    to: query.to ? new Date(query.to) : undefined,
    pendingOnly: pendingOnly === 'true',
  };
}

@Controller('payables')
export class PayablesController {
  constructor(
    private readonly payablesService: PayablesService,
    private readonly supplierStatementPdfService: SupplierStatementPdfService,
    private readonly supplierStatementExcelService: SupplierStatementExcelService,
  ) {}

  @Roles(...READ_ROLES)
  @Get('aging')
  getAgingReport() {
    return this.payablesService.getAgingReport();
  }

  @Roles(...READ_ROLES)
  @Get('balances')
  listSupplierBalances() {
    return this.payablesService.listSupplierBalances();
  }

  @Roles(...READ_ROLES)
  @Get('suppliers/:id/statement')
  getSupplierStatement(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: StatementQueryDto,
    @Query('pendingOnly') pendingOnly?: string,
  ) {
    return this.payablesService.getSupplierStatement(id, parseStatementOptions(query, pendingOnly));
  }

  @Roles(...READ_ROLES)
  @Get('suppliers/:id/statement/pdf')
  async downloadSupplierStatementPdf(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: StatementQueryDto,
    @Query('pendingOnly') pendingOnly?: string,
  ) {
    const statement = await this.payablesService.getSupplierStatement(id, parseStatementOptions(query, pendingOnly));
    const { buffer, filename } = await this.supplierStatementPdfService.generate(statement);
    return new StreamableFile(buffer, { type: 'application/pdf', disposition: `attachment; filename="${filename}"` });
  }

  @Roles(...READ_ROLES)
  @Get('suppliers/:id/statement/excel')
  async downloadSupplierStatementExcel(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: StatementQueryDto,
    @Query('pendingOnly') pendingOnly?: string,
  ) {
    const statement = await this.payablesService.getSupplierStatement(id, parseStatementOptions(query, pendingOnly));
    const buffer = await this.supplierStatementExcelService.generate(statement);
    const supplierSlug = statement.supplierName.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();
    return new StreamableFile(buffer, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: `attachment; filename="cuenta-corriente_${supplierSlug}.xlsx"`,
    });
  }
}
