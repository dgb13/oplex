import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  StreamableFile,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import '@fastify/multipart';
import { Roles } from '@plexo/auth';
import {
  CreateTransactionFromLineDto,
  LinkStatementLineDto,
  ListStatementLinesQueryDto,
} from '@plexo/bank-reconciliation';
import { BankReconciliationService } from './bank-reconciliation.service.js';

const READ_ROLES = ['OWNER', 'ADMIN', 'ACCOUNTANT', 'SALES', 'INVENTORY'] as const;
const WRITE_ROLES = ['OWNER', 'ADMIN', 'ACCOUNTANT'] as const;

@Controller('bank-reconciliation')
export class BankReconciliationController {
  constructor(private readonly bankReconciliationService: BankReconciliationService) {}

  @Roles(...WRITE_ROLES)
  @Get('template')
  async downloadTemplate() {
    const buffer = await this.bankReconciliationService.downloadTemplate();
    return new StreamableFile(buffer, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: 'attachment; filename="plantilla-extracto-bancario.xlsx"',
    });
  }

  @Roles(...WRITE_ROLES)
  @Post('accounts/:financialAccountId/import')
  async importStatement(
    @Param('financialAccountId', ParseUUIDPipe) financialAccountId: string,
    @Req() req: FastifyRequest,
  ) {
    const data = await req.file();
    if (!data) {
      throw new BadRequestException('No se recibió ningún archivo');
    }
    const buffer = await data.toBuffer();
    return this.bankReconciliationService.importStatement(financialAccountId, buffer, data.filename);
  }

  @Roles(...READ_ROLES)
  @Get('accounts/:financialAccountId/lines')
  listLines(
    @Param('financialAccountId', ParseUUIDPipe) financialAccountId: string,
    @Query() query: ListStatementLinesQueryDto,
  ) {
    return this.bankReconciliationService.listLines(financialAccountId, query.status);
  }

  @Roles(...READ_ROLES)
  @Get('accounts/:financialAccountId/imports')
  listImports(@Param('financialAccountId', ParseUUIDPipe) financialAccountId: string) {
    return this.bankReconciliationService.listImports(financialAccountId);
  }

  @Roles(...WRITE_ROLES)
  @Post('lines/:lineId/link')
  link(@Param('lineId', ParseUUIDPipe) lineId: string, @Body() dto: LinkStatementLineDto) {
    return this.bankReconciliationService.linkLineToTransaction(lineId, dto.transactionId);
  }

  @Roles(...WRITE_ROLES)
  @Post('lines/:lineId/create-transaction')
  createTransaction(
    @Param('lineId', ParseUUIDPipe) lineId: string,
    @Body() dto: CreateTransactionFromLineDto,
  ) {
    return this.bankReconciliationService.createTransactionFromLine(lineId, {
      kind: dto.kind,
      description: dto.description,
    });
  }

  @Roles(...WRITE_ROLES)
  @Post('lines/:lineId/ignore')
  ignore(@Param('lineId', ParseUUIDPipe) lineId: string) {
    return this.bankReconciliationService.ignoreLine(lineId);
  }
}
