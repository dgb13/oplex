import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser, Roles } from '@plexo/auth';
import type { AuthenticatedUser } from '@plexo/types';
import { IsBoolean, IsDateString, IsNumber, IsOptional, IsPositive, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { BusinessModule, ModuleEnabledGuard } from '../business-templates/module-enabled.guard.js';
import { WorkOrderCostsService } from './work-order-costs.service.js';

class AddLaborDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  workerName!: string;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsNumber()
  @IsPositive()
  @Max(1000)
  hours!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  costPerHour?: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;

  @IsOptional()
  @IsDateString()
  workedAt?: string;
}

class LinkPurchaseDto {
  @IsUUID()
  purchaseInvoiceId!: string;

  @IsBoolean()
  link!: boolean;
}

// Costos y márgenes: información sensible del negocio.
const VIEW_ROLES = ['OWNER', 'ADMIN', 'ACCOUNTANT'] as const;
// Cargar horas: quien hace o atiende el trabajo.
const LABOR_ROLES = ['OWNER', 'ADMIN', 'SALES'] as const;
// Vincular compras: quien carga compras.
const PURCHASE_ROLES = ['OWNER', 'ADMIN', 'PURCHASES', 'ACCOUNTANT'] as const;

/** Costo y margen de las órdenes (módulo "costo-trabajo", etapa 5). */
@BusinessModule('costo-trabajo')
@UseGuards(ModuleEnabledGuard)
@Controller('work-orders')
export class WorkOrderCostsController {
  constructor(private readonly costs: WorkOrderCostsService) {}

  @Roles(...VIEW_ROLES)
  @Get('margins/report')
  marginReport(@Query('from') from?: string, @Query('to') to?: string) {
    return this.costs.marginReport(from, to);
  }

  @Roles(...LABOR_ROLES, 'ACCOUNTANT')
  @Get('labor/rates')
  lastRates() {
    return this.costs.lastRates();
  }

  @Roles(...PURCHASE_ROLES)
  @Get('purchases/search')
  searchPurchases(@Query('q') q?: string) {
    return this.costs.searchPurchases(q);
  }

  /** Ventas (ej. el mecánico) ve sólo las horas, y Compras además las compras
   * de la orden: sin ingreso ni margen. */
  @Roles(...VIEW_ROLES, 'SALES', 'PURCHASES')
  @Get(':id/costs')
  async get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return forRole(await this.costs.costs(id), user);
  }

  @Roles(...LABOR_ROLES)
  @Post(':id/labor')
  async addLabor(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AddLaborDto, @CurrentUser() user: AuthenticatedUser) {
    return forRole(await this.costs.addLabor(id, dto), user);
  }

  @Roles(...LABOR_ROLES)
  @Delete(':id/labor/:laborId')
  async deleteLabor(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('laborId', ParseUUIDPipe) laborId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return forRole(await this.costs.deleteLabor(id, laborId), user);
  }

  @Roles(...PURCHASE_ROLES)
  @Post(':id/purchases')
  async linkPurchase(@Param('id', ParseUUIDPipe) id: string, @Body() dto: LinkPurchaseDto, @CurrentUser() user: AuthenticatedUser) {
    return forRole(await this.costs.linkPurchase(id, dto.purchaseInvoiceId, dto.link), user);
  }
}

type Costs = Awaited<ReturnType<WorkOrderCostsService['costs']>>;

/** Dueño, admin y contador ven todo; Compras, las horas y las compras que
 * vincula (las facturas de compra ya las ve); el resto, sólo las horas. */
export function forRole(costs: Costs, user: Pick<AuthenticatedUser, 'role'>) {
  if ((VIEW_ROLES as readonly string[]).includes(user.role)) return costs;
  const limited = { ...withoutMoney(costs), labor: costs.labor.map((l) => ({ ...l, costPerHour: null })) };
  if (user.role === 'PURCHASES') return { ...limited, purchases: costs.purchases, purchasesTotal: costs.purchasesTotal };
  return limited;
}

function withoutMoney(costs: Costs) {
  return {
    ...costs,
    income: null,
    parts: null,
    purchases: [],
    purchasesTotal: 0,
    laborCost: 0,
    totalCost: 0,
    margin: null,
    marginPercent: null,
    hidden: true,
  };
}
