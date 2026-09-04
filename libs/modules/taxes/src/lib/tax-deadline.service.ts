import { Injectable, NotFoundException } from '@nestjs/common';
import { getTenantDb, getTenantId, getUserId, type TaxDeadline, type TaxDeadlineStatus } from '@plexo/database';
import type { CreateTaxDeadlineDto } from './dto/create-tax-deadline.dto.js';

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
}
