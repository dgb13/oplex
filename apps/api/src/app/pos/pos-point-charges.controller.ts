import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Roles } from '@plexo/auth';
import { LongRunningTransaction } from '@plexo/database';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { PosPointChargesService } from './pos-point-charges.service.js';

// Control de cobros con Point vive en la sección Mercado Pago: la ve quien
// ve Movimientos; lo resuelve el Dueño o un Administrador.
const READ_ROLES = ['OWNER', 'ADMIN', 'ACCOUNTANT'] as const;
const MANAGE_ROLES = ['OWNER', 'ADMIN'] as const;
const SALES_ROLES = ['OWNER', 'ADMIN', 'SALES'] as const;

class ListPointChargesQuery {
  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;
}

class ConfirmPointChargeDto {
  @IsString()
  mpPaymentId!: string;
}

class ChangePointChargeMethodDto {
  @IsIn(['CASH', 'CARD'])
  method!: 'CASH' | 'CARD';
}

function parseDate(value: string | undefined, fallback: Date): Date {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new BadRequestException(`Fecha inválida: ${value}`);
  return date;
}

@Controller('pos/point-charges')
export class PosPointChargesController {
  constructor(private readonly pointCharges: PosPointChargesService) {}

  @Roles(...READ_ROLES)
  @Get()
  list(@Query() query: ListPointChargesQuery) {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    return this.pointCharges.list({ from: parseDate(query.from, startOfToday), to: parseDate(query.to, new Date()) });
  }

  // Trae de Mercado Pago y empareja ahora, sin esperar al automático.
  @Roles(...READ_ROLES)
  @Post('refresh')
  @LongRunningTransaction(60_000)
  refresh() {
    return this.pointCharges.refresh();
  }

  @Roles(...SALES_ROLES)
  @Get('by-invoice/:invoiceId')
  byInvoice(@Param('invoiceId', ParseUUIDPipe) invoiceId: string) {
    return this.pointCharges.listForInvoice(invoiceId);
  }

  @Roles(...SALES_ROLES)
  @Get('session/:sessionId')
  sessionSummary(@Param('sessionId', ParseUUIDPipe) sessionId: string) {
    return this.pointCharges.sessionSummary(sessionId);
  }

  @Roles(...SALES_ROLES)
  @Get('payments/:mpPaymentId')
  payment(@Param('mpPaymentId') mpPaymentId: string) {
    return this.pointCharges.getUnmatchedPayment(mpPaymentId);
  }

  @Roles(...MANAGE_ROLES)
  @Get('payments/:mpPaymentId/sales')
  salesForPayment(@Param('mpPaymentId') mpPaymentId: string) {
    return this.pointCharges.chargesForPayment(mpPaymentId);
  }

  @Roles(...MANAGE_ROLES)
  @Post('payments/:mpPaymentId/dismiss')
  dismiss(@Param('mpPaymentId') mpPaymentId: string) {
    return this.pointCharges.dismissPayment(mpPaymentId);
  }

  @Roles(...MANAGE_ROLES)
  @Post(':id/confirm')
  confirm(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ConfirmPointChargeDto) {
    return this.pointCharges.confirmWith(id, dto.mpPaymentId);
  }

  @Roles(...MANAGE_ROLES)
  @Post(':id/change-method')
  changeMethod(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ChangePointChargeMethodDto) {
    return this.pointCharges.changeMethod(id, dto.method);
  }
}
