import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Roles } from '@plexo/auth';
import { CashMovementDto, CashRegistersService, CashSessionsService, CloseCashSessionDto, OpenCashSessionDto } from '@plexo/pos';
import { CheckoutDto } from './dto/checkout.dto.js';
import { CreateRegisterDto } from './dto/create-register.dto.js';
import { PosService } from './pos.service.js';

const SALES_ROLES = ['OWNER', 'ADMIN', 'SALES'] as const;

@Controller('pos')
export class PosController {
  constructor(
    private readonly posService: PosService,
    private readonly cashRegistersService: CashRegistersService,
    private readonly cashSessionsService: CashSessionsService,
  ) {}

  @Roles('OWNER', 'ADMIN')
  @Post('registers')
  createRegister(@Body() dto: CreateRegisterDto) {
    return this.posService.createRegister(dto);
  }

  @Roles(...SALES_ROLES)
  @Get('registers')
  listRegisters() {
    return this.cashRegistersService.list();
  }

  // Rutas estáticas de /sessions ANTES de la dinámica /sessions/:id, si no
  // Nest matchea "open"/nada como si fuera un :id.
  @Roles(...SALES_ROLES)
  @Get('sessions/open')
  listOpenSessions() {
    return this.cashSessionsService.listOpenSessions();
  }

  @Roles('OWNER', 'ADMIN', 'SALES', 'ACCOUNTANT')
  @Get('sessions')
  listSessions() {
    return this.cashSessionsService.listSessions();
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
