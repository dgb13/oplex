import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNumber, IsOptional, IsPositive, IsString, Max, MaxLength, Min } from 'class-validator';
import { SUBSCRIPTION_MONTH_OPTIONS } from '@plexo/subscriptions';

const MANUAL_METHODS = ['TRANSFER', 'CASH', 'OTHER'] as const;

/** Pago recibido por fuera de Oplex, registrado desde /admin. */
export class RecordSubscriptionPaymentDto {
  @IsString()
  planKey!: string;

  @Type(() => Number)
  @IsIn(SUBSCRIPTION_MONTH_OPTIONS)
  months!: number;

  @IsIn(MANUAL_METHODS)
  method!: (typeof MANUAL_METHODS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reference?: string;

  // Total con IVA, si es distinto del calculado (un acuerdo especial).
  @IsOptional()
  @IsNumber()
  @IsPositive()
  total?: number;
}

export class ExtendTrialDto {
  @IsInt()
  @Min(1)
  @Max(90)
  days!: number;
}

export class ChangePlanDto {
  @IsString()
  planKey!: string;
}
