import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, StreamableFile } from '@nestjs/common';
import { Roles } from '@plexo/auth';
import { LongRunningTransaction } from '@plexo/database';
import { MercadoPagoQrService } from '@plexo/mercadopago';
import {
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
import { PosCashMovementDto } from './dto/pos-cash-movement.dto.js';
import { ActivateRegisterQrDto, CreateQrChargeDto } from './dto/mercadopago-qr.dto.js';
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
    private readonly mercadoPagoQrService: MercadoPagoQrService,
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

  // Ruta específica ANTES de la dinámica PATCH registers/:id de arriba, no
  // colisionan (métodos distintos) pero se agrupa junto a las demás rutas
  // fijas de /registers.
  @Roles(...SALES_ROLES)
  @Get('registers/:id/last-closed-session')
  getLastClosedSession(@Param('id', ParseUUIDPipe) id: string) {
    return this.cashSessionsService.getLastClosedSession(id);
  }

  // QR de Mercado Pago de la caja: la configuración se ve desde el selector
  // de cajas del POS (para saber si ofrecer "Generar QR"), pero activarlo o
  // desactivarlo es de OWNER/ADMIN, igual que crear/editar cajas.
  @Roles(...SALES_ROLES)
  @Get('registers/:id/mercadopago-qr')
  getRegisterQr(@Param('id', ParseUUIDPipe) id: string) {
    return this.mercadoPagoQrService.getRegisterSetup(id);
  }

  // Las rutas de acá abajo llaman a Mercado Pago dentro de la transacción
  // del request (activar hace hasta tres llamadas seguidas).
  // Ciudades/barrios que Mercado Pago acepta para la provincia elegida en
  // el formulario de Activar QR.
  @Roles('OWNER', 'ADMIN')
  @Get('mercadopago-qr/cities')
  listQrCities(@Query('state') state: string) {
    return this.mercadoPagoQrService.listCities(state ?? '');
  }

  @Roles('OWNER', 'ADMIN')
  @Post('registers/:id/mercadopago-qr/activate')
  @LongRunningTransaction(30_000)
  activateRegisterQr(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ActivateRegisterQrDto) {
    return this.mercadoPagoQrService.activateRegister(id, dto);
  }

  @Roles('OWNER', 'ADMIN')
  @Post('registers/:id/mercadopago-qr/deactivate')
  @LongRunningTransaction(30_000)
  deactivateRegisterQr(@Param('id', ParseUUIDPipe) id: string) {
    return this.mercadoPagoQrService.deactivateRegister(id);
  }

  // Cobro con QR en el checkout: crear la orden, consultar su estado
  // mientras la caja espera (también le pregunta a MP, por si el webhook no
  // llega) y cancelarla.
  @Roles(...SALES_ROLES)
  @Post('qr-charges')
  @LongRunningTransaction(30_000)
  createQrCharge(@Body() dto: CreateQrChargeDto) {
    return this.posService.createQrCharge(dto);
  }

  // Cobros QR acreditados que no llegaron a ser venta (falló el stock o
  // ARCA, se cerró la ventana...): el aviso de la Caja y su lista.
  @Roles(...SALES_ROLES)
  @Get('registers/:id/qr-charges/unclaimed')
  listUnclaimedQrCharges(@Param('id', ParseUUIDPipe) id: string) {
    return this.posService.listUnclaimedQrCharges(id);
  }

  // "Devolver el dinero" de un cobro QR sin venta: devolución total por
  // Mercado Pago, sin factura ni nota de crédito (nunca hubo venta).
  @Roles(...SALES_ROLES)
  @Post('qr-charges/:id/refund')
  @LongRunningTransaction(30_000)
  refundQrCharge(@Param('id', ParseUUIDPipe) id: string) {
    return this.mercadoPagoQrService.refundCharge(id);
  }

  @Roles(...SALES_ROLES)
  @Post('qr-charges/:id/confirm-sale')
  // Misma venta que checkout: pide CAE a ARCA.
  @LongRunningTransaction(45_000)
  confirmQrSale(@Param('id', ParseUUIDPipe) id: string) {
    return this.posService.confirmQrSale(id);
  }

  @Roles(...SALES_ROLES)
  @Get('qr-charges/:id')
  @LongRunningTransaction(30_000)
  getQrCharge(@Param('id', ParseUUIDPipe) id: string) {
    return this.mercadoPagoQrService.getCharge(id);
  }

  @Roles(...SALES_ROLES)
  @Post('qr-charges/:id/cancel')
  @LongRunningTransaction(30_000)
  cancelQrCharge(@Param('id', ParseUUIDPipe) id: string) {
    return this.mercadoPagoQrService.cancelCharge(id);
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
  @Get('registers/:id/cash-movement-options')
  getCashMovementOptions(@Param('id', ParseUUIDPipe) id: string) {
    return this.posService.getCashMovementOptions(id);
  }

  @Roles(...SALES_ROLES)
  @Get('sessions/:id')
  getSessionSummary(@Param('id', ParseUUIDPipe) id: string) {
    return this.cashSessionsService.getSessionSummary(id);
  }

  @Roles(...SALES_ROLES)
  @Post('sessions/:id/cash-in')
  cashIn(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PosCashMovementDto) {
    return this.posService.recordCashMovement(id, dto, 'CASH_IN');
  }

  @Roles(...SALES_ROLES)
  @Post('sessions/:id/cash-out')
  cashOut(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PosCashMovementDto) {
    return this.posService.recordCashMovement(id, dto, 'CASH_OUT');
  }

  @Roles(...SALES_ROLES)
  @Post('sessions/:id/close')
  closeSession(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CloseCashSessionDto) {
    return this.posService.closeSession(id, dto);
  }

  @Roles(...SALES_ROLES)
  @Post('checkout')
  // La venta pide CAE a ARCA - ver ARCA_TIMEOUT_MS en SalesController.
  @LongRunningTransaction(45_000)
  checkout(@Body() dto: CheckoutDto) {
    return this.posService.checkout(dto);
  }
}
