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

/** Cuenta de Oplex donde transfieren los tenants. */
export class OplexBankDetailsDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  holder!: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  cuit!: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  bankName!: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  cbu!: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  alias!: string | null;
}
