import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { getTenantDb, getTenantId, type CashRegister } from '@plexo/database';
import type { CreateCashRegisterDto } from './dto/create-cash-register.dto.js';
import type { UpdateCashRegisterDto } from './dto/update-cash-register.dto.js';

/**
 * CRUD de mostradores físicos. La creación de la FinancialAccount ("el
 * cajón") es responsabilidad de la composición-root (apps/api's
 * PosService.createRegister, que compone ReportsFinancialService +
 * este create()) - un lib module nunca importa el Service de otro, ver el
 * comentario en CreateCashRegisterDto.
 */
@Injectable()
export class CashRegistersService {
  async create(dto: CreateCashRegisterDto): Promise<CashRegister> {
    const db = getTenantDb();

    const branch = await db.company.findUnique({
      where: { id: dto.branchId },
      include: { roles: true },
    });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }
    if (!branch.active) {
      throw new BadRequestException('This branch is inactive');
    }
    if (!branch.roles.some((r) => r.role === 'BRANCH')) {
      throw new BadRequestException('This company is not flagged as a branch');
    }
    if (!branch.pointOfSaleNumber) {
      throw new BadRequestException('Branch has no pointOfSaleNumber configured');
    }

    const warehouse = await db.warehouse.findUnique({ where: { id: dto.warehouseId } });
    if (!warehouse) {
      throw new NotFoundException('Warehouse not found');
    }

    return db.cashRegister.create({
      data: {
        tenantId: getTenantId(),
        name: dto.name,
        branchId: dto.branchId,
        warehouseId: dto.warehouseId,
        financialAccountId: dto.financialAccountId,
      },
    });
  }

  /** `includeInactive` sólo lo usa /settings/pos (Fase 2) - el selector de
   * /pos sigue viendo únicamente cajas activas, comportamiento sin cambios
   * para el resto de la app. */
  list(includeInactive = false): Promise<CashRegister[]> {
    return getTenantDb().cashRegister.findMany({
      where: includeInactive ? {} : { active: true },
      include: { branch: { select: { id: true, name: true } }, warehouse: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async getById(id: string): Promise<CashRegister> {
    const register = await getTenantDb().cashRegister.findUnique({ where: { id } });
    if (!register) {
      throw new NotFoundException('Cash register not found');
    }
    return register;
  }

  /** Renombrar y/o togglear `active` (Fase 2, /settings/pos). Desactivar
   * con un turno OPEN se rechaza - mismo criterio de invariante que el
   * resto del módulo (nunca dejar un estado ambiguo a mitad de camino: una
   * caja inactiva con un turno abierto sería imposible de cerrar desde
   * /pos, que sólo lista cajas activas). */
  async update(id: string, dto: UpdateCashRegisterDto): Promise<CashRegister> {
    const register = await this.getById(id);
    if (dto.active === false && register.active) {
      const openSession = await getTenantDb().cashSession.findFirst({
        where: { registerId: id, status: 'OPEN' },
      });
      if (openSession) {
        throw new BadRequestException('Cerrá el turno abierto antes de desactivar esta caja');
      }
    }
    return getTenantDb().cashRegister.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
    });
  }
}
