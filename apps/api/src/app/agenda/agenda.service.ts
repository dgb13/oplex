import { Injectable } from '@nestjs/common';
import { CalendarEventService } from '@plexo/calendar';
import { InvoicingService } from '@plexo/invoicing';
import { PayablesService } from '@plexo/payables';
import { CashSessionsService } from '@plexo/pos';
import { ProductionOrderService } from '@plexo/production';
import { ReceivablesService } from '@plexo/receivables';
import { SubscriptionService } from '@plexo/subscriptions';
import { TaxDeadlineService } from '@plexo/taxes';
import type { AuthenticatedUser, CalendarEntry, CalendarEntrySource, UserRole } from '@plexo/types';

const RECEIVABLES_READ_ROLES: UserRole[] = ['OWNER', 'ADMIN', 'ACCOUNTANT', 'SALES'];
const PAYABLES_READ_ROLES: UserRole[] = ['OWNER', 'ADMIN', 'ACCOUNTANT', 'INVENTORY'];
// Mismos roles que GET /pos/sessions (HISTORY_ROLES en apps/api/src/app/pos/
// pos.controller.ts) - el análogo real de "ver el historial de cierres".
const CASH_READ_ROLES: UserRole[] = ['OWNER', 'ADMIN', 'SALES', 'ACCOUNTANT'];

/**
 * Composition root de la Agenda (ver docs/plan-agenda.md) - el único lugar
 * del backend que conoce taxes/receivables/payables/calendar/invoicing/
 * production/pos a la vez. Cada uno vive en su propia lib de negocio y
 * nunca se importan entre sí (ver eslint.config.mjs, scope:calendar/
 * scope:taxes/etc sólo dependen de sí mismos + scope:shared) - esto vive en
 * apps/api exactamente como DashboardService ya inyecta InventoryService
 * desde acá, no desde otro módulo.
 *
 * La visibilidad por fuente replica EL MISMO chequeo que cada módulo ya
 * aplica en su propio endpoint real - moduleAccess grant para taxes, listas
 * de roles para receivables/payables/cash, el gate de plan de suscripción
 * para producción (GET /production/orders llama a
 * SubscriptionService.assertCanUseProduction, un gate por TENANT, no por
 * usuario), y ningún gate para sale (GET /invoicing/invoices no tiene
 * @Roles - cualquier miembro del tenant lo ve). No se inventa ningún
 * permiso nuevo, sólo se refleja el que ya existe (ver principio de
 * seguridad del plan).
 */
@Injectable()
export class AgendaService {
  constructor(
    private readonly taxDeadlineService: TaxDeadlineService,
    private readonly receivablesService: ReceivablesService,
    private readonly payablesService: PayablesService,
    private readonly calendarEventService: CalendarEventService,
    private readonly invoicingService: InvoicingService,
    private readonly productionOrderService: ProductionOrderService,
    private readonly cashSessionsService: CashSessionsService,
    private readonly subscriptionService: SubscriptionService,
  ) {}

  async getCalendarEntries(
    user: AuthenticatedUser,
    from: Date,
    to: Date,
    kinds?: CalendarEntrySource[],
  ): Promise<CalendarEntry[]> {
    const sourcePromises: Promise<CalendarEntry[]>[] = [];

    if (this.canSeeTax(user)) {
      sourcePromises.push(this.taxDeadlineService.getCalendarEntries(from, to));
    }
    if (this.canSeeReceivables(user)) {
      sourcePromises.push(this.receivablesService.getCalendarEntries(from, to));
    }
    if (this.canSeePayables(user)) {
      sourcePromises.push(this.payablesService.getCalendarEntries(from, to));
    }
    // GET /invoicing/invoices no tiene @Roles - cualquier miembro del
    // tenant puede ver facturas, así que 'sale' tampoco se gatea acá.
    sourcePromises.push(this.invoicingService.getCalendarEntries(from, to));
    if (await this.canSeeProd()) {
      sourcePromises.push(this.productionOrderService.getCalendarEntries(from, to));
    }
    if (this.canSeeCash(user)) {
      sourcePromises.push(this.cashSessionsService.getCalendarEntries(from, to));
    }
    // Los eventos propios no tienen un módulo de negocio equivalente que
    // los gatee - cualquier miembro del tenant los ve, mismo criterio que
    // "un recordatorio personal no es información sensible de un módulo".
    sourcePromises.push(this.calendarEventService.getCalendarEntries(from, to));

    const merged = (await Promise.all(sourcePromises)).flat();
    const filtered = kinds && kinds.length > 0 ? merged.filter((e) => kinds.includes(e.source)) : merged;
    return filtered.sort((a, b) => a.date.localeCompare(b.date));
  }

  private canSeeTax(user: AuthenticatedUser): boolean {
    if (user.role === 'OWNER' || user.role === 'ADMIN') return true;
    return user.moduleAccess.some((m) => m.module === 'taxes' && m.canRead);
  }

  private canSeeReceivables(user: AuthenticatedUser): boolean {
    return RECEIVABLES_READ_ROLES.includes(user.role);
  }

  private canSeePayables(user: AuthenticatedUser): boolean {
    return PAYABLES_READ_ROLES.includes(user.role);
  }

  private canSeeCash(user: AuthenticatedUser): boolean {
    return CASH_READ_ROLES.includes(user.role);
  }

  /** Gate por TENANT (plan de suscripción), no por usuario - mismo chequeo
   * que GET /production/orders ya hace antes de devolver una sola orden.
   * assertCanUseProduction() lanza ForbiddenException cuando el plan no
   * incluye el módulo; acá sólo nos importa el booleano. */
  private async canSeeProd(): Promise<boolean> {
    try {
      await this.subscriptionService.assertCanUseProduction();
      return true;
    } catch {
      return false;
    }
  }
}
