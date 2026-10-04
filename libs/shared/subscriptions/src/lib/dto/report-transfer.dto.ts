import { Type } from 'class-transformer';
import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { SUBSCRIPTION_MONTH_OPTIONS } from '../subscription-pricing.js';

/** Aviso de transferencia del tenant (ver SubscriptionBillingService.reportTransfer). */
export class ReportTransferDto {
  @IsString()
  planKey!: string;

  @Type(() => Number)
  @IsIn(SUBSCRIPTION_MONTH_OPTIONS)
  months!: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string;

  // Devuelto por POST /subscriptions/me/transfer-receipt.
  @IsOptional()
  @Matches(/^\/uploads\/subscription-receipts\/[0-9a-f-]+\.(jpg|png|pdf)$/)
  receiptUrl?: string;
}

export class ChangeOwnPlanDto {
  @IsString()
  planKey!: string;
}
