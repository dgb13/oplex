import { Injectable, NotFoundException } from '@nestjs/common';
import { getTenantDb, getTenantId, getUserId, type TaxDeadline, type TaxDeadlineStatus } from '@plexo/database';
import type { CalendarEntry } from '@plexo/types';
import type { CreateTaxDeadlineDto } from './dto/create-tax-deadline.dto.js';

const KIND_LABEL: Record<TaxDeadline['kind'], string> = {
  IVA: 'IVA',
  MONOTRIBUTO: 'Monotributo',
  IIBB: 'IIBB',
  GANANCIAS: 'Ganancias',
  OTRO: 'Otro',
};

@Injectable()
export class TaxDeadlineService {
  create(dto: CreateTaxDeadlineDto): Promise<TaxDeadline> {
    return getTenantDb().taxDeadline.create({
      data: {
        tenantId: getTenantId(),
        kind: dto.kind,
        dueDate: new Date(dto.dueDate),
        description: dto.description,
        createdByUserId: getUserId() as string,
      },
    });
  }

  list(status?: TaxDeadlineStatus): Promise<TaxDeadline[]> {
    return getTenantDb().taxDeadline.findMany({
      where: status ? { status } : undefined,
      orderBy: { dueDate: 'asc' },
    });
  }

  async markDone(id: string): Promise<TaxDeadline> {
    const db = getTenantDb();
    const existing = await db.taxDeadline.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Vencimiento no encontrado');
    }
    return db.taxDeadline.update({ where: { id }, data: { status: 'DONE' } });
  }

  /** Función pura de la Agenda (ver docs/plan-agenda.md) - sólo toca su
   * propia tabla, nunca importa otro módulo de negocio. Se muestran los
   * vencimientos pendientes y ya cumplidos por igual: la Agenda es una
   * vista de "qué vence cuándo", no un filtro de pendientes. */
  async getCalendarEntries(from: Date, to: Date): Promise<CalendarEntry[]> {
    const deadlines = await getTenantDb().taxDeadline.findMany({
      where: { dueDate: { gte: from, lte: to } },
      orderBy: { dueDate: 'asc' },
    });
    return deadlines.map((d) => ({
      id: d.id,
      source: 'tax',
      title: d.description,
      date: d.dueDate.toISOString(),
      amount: null,
      flow: 'out',
      ref: KIND_LABEL[d.kind],
      editable: false,
      link: { module: 'tax-deadline', id: d.id },
    }));
  }
}
