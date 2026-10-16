import { BadRequestException, Body, Controller, Get, Post, Req } from '@nestjs/common';
import { Roles } from '@plexo/auth';
import type { FastifyRequest } from 'fastify';
import '@fastify/multipart';
import { ChangeOwnPlanDto, ReportTransferDto } from './dto/report-transfer.dto.js';
import { AllowWhenReadOnly } from './read-only.guard.js';
import { SubscriptionBillingService } from './subscription-billing.service.js';
import { SubscriptionReceiptService } from './subscription-receipt.service.js';
import { SubscriptionService } from './subscription.service.js';

// Pagar o cambiar el plan: sólo quien administra la cuenta.
const BILLING_ROLES = ['OWNER', 'ADMIN'] as const;

// Auth normal, sin @Roles en las lecturas - cualquier usuario logueado
// necesita esto para que el frontend pueda mostrar el aviso de prueba o de
// cobro vencido, no sólo OWNER/ADMIN. Pagar y cambiar de plan tienen que
// andar justamente cuando la cuenta está en sólo lectura.
@AllowWhenReadOnly()
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(
    private readonly subscriptionService: SubscriptionService,
    private readonly billing: SubscriptionBillingService,
    private readonly receipts: SubscriptionReceiptService,
  ) {}

  /** hasPendingPayment: para la banda "Recibimos tu aviso de transferencia". */
  @Get('me')
  async getCurrent() {
    const [subscription, hasPendingPayment] = await Promise.all([
      this.subscriptionService.getCurrentForTenant(),
      this.billing.hasPendingPayment(),
    ]);
    return { ...subscription, hasPendingPayment };
  }

  /** Estado, pagos, la cuenta de Oplex para transferir y el uso actual
   * (usuarios y clientes) para saber si entra en un plan más chico. */
  @Get('me/billing')
  async getBilling() {
    const [overview, oplexBank, usage] = await Promise.all([
      this.billing.getOverview(),
      this.billing.getOplexBankDetails(),
      this.billing.getUsage(),
    ]);
    return { ...overview, oplexBank, usage };
  }

  @Roles(...BILLING_ROLES)
  @Post('me/transfer-receipt')
  async uploadReceipt(@Req() req: FastifyRequest) {
    const data = await req.file();
    if (!data) {
      throw new BadRequestException('No se recibió ningún archivo');
    }
    return { receiptUrl: await this.receipts.save(data.mimetype, await data.toBuffer()) };
  }

  @Roles(...BILLING_ROLES)
  @Post('me/transfer')
  reportTransfer(@Body() dto: ReportTransferDto) {
    return this.billing.reportTransfer(dto);
  }

  @Roles(...BILLING_ROLES)
  @Post('me/plan')
  async changePlan(@Body() dto: ChangeOwnPlanDto) {
    await this.billing.changeOwnPlan(dto.planKey);
    return this.subscriptionService.getCurrentForTenant();
  }
}
