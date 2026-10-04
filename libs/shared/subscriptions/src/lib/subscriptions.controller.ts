import { BadRequestException, Body, Controller, Get, Post, Req } from '@nestjs/common';
import { Roles } from '@plexo/auth';
import type { FastifyRequest } from 'fastify';
import '@fastify/multipart';
import { ChangeOwnPlanDto, ReportTransferDto } from './dto/report-transfer.dto.js';
import { SubscriptionBillingService } from './subscription-billing.service.js';
import { SubscriptionReceiptService } from './subscription-receipt.service.js';
import { SubscriptionService } from './subscription.service.js';

// Pagar o cambiar el plan: sólo quien administra la cuenta.
const BILLING_ROLES = ['OWNER', 'ADMIN'] as const;

// Auth normal, sin @Roles en las lecturas - cualquier usuario logueado
// necesita esto para que el frontend pueda mostrar el aviso de prueba o de
// cobro vencido, no sólo OWNER/ADMIN.
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(
    private readonly subscriptionService: SubscriptionService,
    private readonly billing: SubscriptionBillingService,
    private readonly receipts: SubscriptionReceiptService,
  ) {}

  @Get('me')
  getCurrent() {
    return this.subscriptionService.getCurrentForTenant();
  }

  /** Estado, pagos y la cuenta de Oplex para transferir. */
  @Get('me/billing')
  async getBilling() {
    const [overview, oplexBank] = await Promise.all([this.billing.getOverview(), this.billing.getOplexBankDetails()]);
    return { ...overview, oplexBank };
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
