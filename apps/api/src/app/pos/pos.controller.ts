import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, StreamableFile } from '@nestjs/common';
import { Roles } from '@plexo/auth';
import {
  CashMovementDto,
  CashRegistersService,
  CashSessionExcelService,
  CashSessionsService,
  CloseCashSessionDto,
  ListSessionsQueryDto,
  OpenCashSessionDto,
  UpdateCashRegisterDto,
} from '@plexo/pos';
import { CheckoutDto } from './dto/checkout.dto.js';
import { CreateRegisterDto } from './dto/create-register.dto.js';
import { PosService } from './pos.service.js';

const SALES_ROLES = ['OWNER', 'ADMIN', 'SALES'] as const;
const HISTORY_ROLES = ['OWNER', 'ADMIN', 'SALES', 'ACCOUNTANT'] as const;

@Controller('pos')
export class PosController {
  constructor(
    private readonly posService: PosService,
    private readonly cashRegistersService: CashRegistersService,
    private readonly cashSessionsService: CashSessionsService,
    private readonly cashSessionExcelService: CashSessionExcelService,
  ) {}

  @Roles('OWNER', 'ADMIN')
  @Post('registers')
  createRegister(@Body() dto: CreateRegisterDto) {
    return this.posService.createRegister(dto);
  }

  // `includeInactive` sólo lo usa /settings/pos (Fase 2) - el selector de
  // /pos sigue pidiendo sin el flag y ve únicamente cajas activas.
  @Roles(...SALES_ROLES)
  @Get('registers')
  listRegisters(@Query('includeInactive') includeInactive?: string) {
    return this.cashRegistersService.list(includeInactive === 'true');
  }

  @Roles('OWNER', 'ADMIN')
  @Patch('registers/:id')
  updateRegister(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCashRegisterDto) {
    return this.cashRegistersService.update(id, dto);
  }

  // Rutas estáticas de /sessions ANTES de la dinámica /sessions/:id, si no
  // Nest matchea "open"/"export"/nada como si fuera un :id.
  @Roles(...SALES_ROLES)
  @Get('sessions/open')
  listOpenSessions() {
    return this.cashSessionsService.listOpenSessions();
  }

  @Roles(...HISTORY_ROLES)
  @Get('sessions/export')
  async exportSessions(@Query() query: ListSessionsQueryDto) {
    const sessions = await this.cashSessionsService.listSessions(query);
    const buffer = await this.cashSessionExcelService.generate(sessions);
    return new StreamableFile(buffer, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: 'attachment; filename="historial-turnos.xlsx"',
    });
  }

  @Roles(...HISTORY_ROLES)
  @Get('sessions')
  listSessions(@Query() query: ListSessionsQueryDto) {
    return this.cashSessionsService.listSessions(query);
  }

  @Roles(...SALES_ROLES)
  @Get('dashboard')
  getDailyPosition() {
    return this.cashSessionsService.getDailyPosition();
  }

  @Roles(...SALES_ROLES)
  @Post('sessions')
  openSession(@Body() dto: OpenCashSessionDto) {
    return this.cashSessionsService.openSession(dto);
  }

  @Roles(...SALES_ROLES)
  @Get('sessions/:id')
  getSessionSummary(@Param('id', ParseUUIDPipe) id: string) {
    return this.cashSessionsService.getSessionSummary(id);
  }

  @Roles(...SALES_ROLES)
  @Post('sessions/:id/cash-in')
  cashIn(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CashMovementDto) {
    return this.cashSessionsService.recordCashMovement(id, dto, 'CASH_IN');
  }

  @Roles(...SALES_ROLES)
  @Post('sessions/:id/cash-out')
  cashOut(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CashMovementDto) {
    return this.cashSessionsService.recordCashMovement(id, dto, 'CASH_OUT');
  }

  @Roles(...SALES_ROLES)
  @Post('sessions/:id/close')
  closeSession(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CloseCashSessionDto) {
    return this.posService.closeSession(id, dto);
  }

  @Roles(...SALES_ROLES)
  @Post('checkout')
  checkout(@Body() dto: CheckoutDto) {
    return this.posService.checkout(dto);
  }
}
