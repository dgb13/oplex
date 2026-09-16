import { Injectable } from '@nestjs/common';
import { CalendarEventService } from '@plexo/calendar';
import { PayablesService } from '@plexo/payables';
import { ReceivablesService } from '@plexo/receivables';
import { TaxDeadlineService } from '@plexo/taxes';
import type { AuthenticatedUser, CalendarEntry, CalendarEntrySource, UserRole } from '@plexo/types';

const RECEIVABLES_READ_ROLES: UserRole[] = ['OWNER', 'ADMIN', 'ACCOUNTANT', 'SALES'];
const PAYABLES_READ_ROLES: UserRole[] = ['OWNER', 'ADMIN', 'ACCOUNTANT', 'INVENTORY'];

/**
 * Composition root de la Agenda (ver docs/plan-agenda.md) - el único lugar
 * del backend que conoce taxes/receivables/payables/calendar a la vez.
 * Cada uno vive en su propia lib de negocio y nunca se importan entre sí
 * (ver eslint.config.mjs, scope:calendar/scope:taxes/etc sólo dependen de
 * sí mismos + scope:shared) - esto vive en apps/api exactamente como
 * DashboardService ya inyecta InventoryService desde acá, no desde otro
 * módulo.
 *
 * La visibilidad por fuente replica EL MISMO chequeo que cada módulo ya
 * aplica en su propio endpoint real (moduleAccess grant para taxes,
 * listas de roles para receivables/payables) - no se inventa ningún
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
}
