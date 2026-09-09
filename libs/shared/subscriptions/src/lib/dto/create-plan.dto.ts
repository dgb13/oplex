import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreatePlanDto {
  // Slug estable ("BRONZE") - lo que TenantSubscription.planId referencia
  // por dentro, nunca se muestra al usuario final (eso es `name`).
  @IsString()
  @MinLength(1)
  key!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsNumber()
  @Min(0)
  priceMonthly!: number;

  @IsInt()
  @Min(0)
  maxUsers!: number;

  @IsInt()
  @Min(0)
  maxClients!: number;

  @IsInt()
  @Min(0)
  maxMonthlyInvoices!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  debitDiscountPercent?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  // Contenido del SLA público de este plan, en Markdown. Ver
  // GET /plans/:key/sla (público, sin login).
  @IsOptional()
  @IsString()
  slaMarkdown?: string;

  // Cupo mensual de "Carga de comprobantes IA" - ausente/null = el plan no
  // incluye la función. Ver SubscriptionService.assertCanUseAiInvoiceScan().
  @IsOptional()
  @IsInt()
  @Min(0)
  aiInvoiceScanMonthlyQuota?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  aiAssistantMonthlyQueryQuota?: number;
}
