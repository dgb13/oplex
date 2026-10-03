import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { CurrentUser, PlatformAdminGuard } from '@plexo/auth';
import type { AuthenticatedUser } from '@plexo/types';
import { AdminSubscriptionsService } from './admin-subscriptions.service.js';
import { ChangePlanDto, ExtendTrialDto, RecordSubscriptionPaymentDto } from './dto/admin-subscription.dto.js';

@Controller('admin/subscriptions')
@UseGuards(PlatformAdminGuard)
export class AdminSubscriptionsController {
  constructor(private readonly service: AdminSubscriptionsService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Get(':tenantId/payments')
  payments(@Param('tenantId') tenantId: string) {
    return this.service.payments(tenantId);
  }

  @Post(':tenantId/payments')
  recordPayment(
    @Param('tenantId') tenantId: string,
    @Body() dto: RecordSubscriptionPaymentDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.service.recordPayment(tenantId, dto, admin.email);
  }

  @Post(':tenantId/payments/:paymentId/confirm')
  confirm(
    @Param('tenantId') tenantId: string,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.service.confirmPayment(tenantId, paymentId, admin.email);
  }

  @Post(':tenantId/payments/:paymentId/reject')
  reject(
    @Param('tenantId') tenantId: string,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.service.rejectPayment(tenantId, paymentId, admin.email);
  }

  @Post(':tenantId/extend-trial')
  extendTrial(@Param('tenantId') tenantId: string, @Body() dto: ExtendTrialDto) {
    return this.service.extendTrial(tenantId, dto.days);
  }

  @Post(':tenantId/plan')
  changePlan(@Param('tenantId') tenantId: string, @Body() dto: ChangePlanDto) {
    return this.service.changePlan(tenantId, dto.planKey);
  }
}
