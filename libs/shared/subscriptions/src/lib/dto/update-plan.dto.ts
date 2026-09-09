import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, Min, MinLength, ValidateIf } from 'class-validator';

// Nunca incluye `key` - una vez creado, el slug que TenantSubscription.planId
// referencia no se renombra (ver createPlan.dto.ts para el alta).
export class UpdatePlanDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  priceMonthly?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxUsers?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxClients?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxMonthlyInvoices?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  debitDiscountPercent?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  // Contenido del SLA público de este plan, en Markdown. Ver
  // GET /plans/:key/sla (público, sin login). String vacía borra el SLA
  // publicado (vuelve a "aún no publicado").
  @IsOptional()
  @IsString()
  slaMarkdown?: string;

  // Cupo mensual de "Carga de comprobantes IA" - null explícito saca al
  // plan de la función (vuelve a "no incluida"), un entero fija el cupo,
  // ausente no toca el campo. Ver SubscriptionService.assertCanUseAiInvoiceScan().
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(0)
  aiInvoiceScanMonthlyQuota?: number | null;

  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(0)
  aiAssistantMonthlyQueryQuota?: number | null;
}
