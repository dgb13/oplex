import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { RequireModuleAccess } from '@plexo/auth';
import { AccountingService } from './accounting.service.js';
import { CreateAccountDto } from './dto/create-account.dto.js';
import { CreateReversingEntryDto } from './dto/create-reversing-entry.dto.js';
import { InflationAdjustmentRangeDto } from './dto/inflation-adjustment-range.dto.js';
import { PostJournalEntryDto } from './dto/post-journal-entry.dto.js';
import { TrialBalanceQueryDto } from './dto/trial-balance-query.dto.js';
import { UpdateAccountDto } from './dto/update-account.dto.js';
import { InflationAdjustmentService } from './inflation-adjustment.service.js';

const MODULE = 'accounting';

function parseDate(value: string, field: 'from' | 'to'): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException(`"${field}" no es una fecha válida`);
  }
  return date;
}

@Controller('accounting')
export class AccountingController {
  constructor(
    private readonly accountingService: AccountingService,
    private readonly inflationAdjustmentService: InflationAdjustmentService,
  ) {}

  @RequireModuleAccess(MODULE, 'write')
  @Post('accounts')
  createAccount(@Body() dto: CreateAccountDto) {
    return this.accountingService.createAccount(dto);
  }

  @RequireModuleAccess(MODULE, 'read')
  @Get('accounts')
  listAccounts() {
    return this.accountingService.listAccounts();
  }

  @RequireModuleAccess(MODULE, 'read')
  @Get('accounts/:id/ledger')
  getAccountLedger(@Param('id', ParseUUIDPipe) id: string) {
    return this.accountingService.getAccountLedger(id);
  }

  @RequireModuleAccess(MODULE, 'write')
  @Patch('accounts/:id')
  updateAccount(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAccountDto) {
    return this.accountingService.updateAccount(id, dto);
  }

  @RequireModuleAccess(MODULE, 'read')
  @Get('trial-balance')
  getTrialBalance(@Query() query: TrialBalanceQueryDto) {
    return this.accountingService.getTrialBalance(
      query.from ? parseDate(query.from, 'from') : undefined,
      query.to ? parseDate(query.to, 'to') : undefined,
    );
  }

  @RequireModuleAccess(MODULE, 'read')
  @Get('journal-entries')
  listJournalEntries() {
    return this.accountingService.listJournalEntries();
  }

  @RequireModuleAccess(MODULE, 'read')
  @Get('journal-entries/:id')
  getJournalEntry(@Param('id', ParseUUIDPipe) id: string) {
    return this.accountingService.getJournalEntry(id);
  }

  @RequireModuleAccess(MODULE, 'write')
  @Post('journal-entries')
  postJournalEntry(@Body() dto: PostJournalEntryDto) {
    return this.accountingService.postJournalEntry(dto);
  }

  @RequireModuleAccess(MODULE, 'write')
  @Post('journal-entries/reversals')
  createReversingEntry(@Body() dto: CreateReversingEntryDto) {
    return this.accountingService.createReversingEntry(dto);
  }

  @RequireModuleAccess(MODULE, 'read')
  @Get('inflation-adjustment/preview')
  getInflationAdjustmentPreview(@Query() query: InflationAdjustmentRangeDto) {
    return this.inflationAdjustmentService.getPreview(
      parseDate(query.from, 'from'),
      parseDate(query.to, 'to'),
    );
  }

  @RequireModuleAccess(MODULE, 'read')
  @Get('inflation-adjustment')
  listInflationAdjustments() {
    return this.inflationAdjustmentService.listAdjustments();
  }

  @RequireModuleAccess(MODULE, 'write')
  @Post('inflation-adjustment')
  postInflationAdjustment(@Body() dto: InflationAdjustmentRangeDto) {
    return this.inflationAdjustmentService.postInflationAdjustment(
      parseDate(dto.from, 'from'),
      parseDate(dto.to, 'to'),
    );
  }
}
