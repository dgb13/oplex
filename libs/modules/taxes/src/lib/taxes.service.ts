import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { hasAnyRole } from '@plexo/types';
import { getTenantDb, getTenantId, getUserRoles, type TaxDefinition } from '@plexo/database';
import type { CreateTaxDefinitionDto } from './dto/create-tax-definition.dto.js';
import type { ReviseTaxDefinitionDto } from './dto/revise-tax-definition.dto.js';

@Injectable()
export class TaxesService {
  async createTaxDefinition(dto: CreateTaxDefinitionDto): Promise<TaxDefinition> {
    const db = getTenantDb();
    const existing = await db.taxDefinition.findFirst({ where: { code: dto.code, validTo: null } });
    if (existing) {
      throw new BadRequestException(
        `Tax definition ${dto.code} already exists and is active - use revise instead`,
      );
    }

    return db.taxDefinition.create({
      data: {
        tenantId: getTenantId(),
        code: dto.code,
        name: dto.name,
        calculationType: dto.calculationType ?? 'PERCENTAGE',
        rate: dto.rate,
        fixedAmount: dto.fixedAmount,
        formula: dto.formula,
        managedByAccountant: dto.managedByAccountant ?? false,
      },
    });
  }

  listTaxDefinitions(): Promise<TaxDefinition[]> {
    return getTenantDb().taxDefinition.findMany({ orderBy: [{ code: 'asc' }, { validFrom: 'asc' }] });
  }

  listActiveTaxDefinitions(asOf: Date = new Date()): Promise<TaxDefinition[]> {
    return getTenantDb().taxDefinition.findMany({
      where: { validFrom: { lte: asOf }, OR: [{ validTo: null }, { validTo: { gt: asOf } }] },
      orderBy: { code: 'asc' },
    });
  }

  getTaxDefinitionHistory(code: string): Promise<TaxDefinition[]> {
    return getTenantDb().taxDefinition.findMany({ where: { code }, orderBy: { validFrom: 'asc' } });
  }

  /**
   * The versioning operation: closes the currently-active row for `code`
   * at effectiveFrom and inserts a new one with the revised rate/fixedAmount.
   * An ACCOUNTANT may only do this when the definition has
   * managedByAccountant=true - some tax parameters are delegated to the
   * external accountant, others (the flag defaults false) require an
   * OWNER/ADMIN. That's a per-record check, so it lives here rather than
   * in the route-level ModuleAccessGuard.
   */
  async reviseTaxDefinition(dto: ReviseTaxDefinitionDto): Promise<TaxDefinition> {
    const db = getTenantDb();
    const tenantId = getTenantId();
    const roles = getUserRoles();
    const effectiveFrom = dto.effectiveFrom ? new Date(dto.effectiveFrom) : new Date();

    const current = await this.getActiveDefinition(dto.code, effectiveFrom);

    if (hasAnyRole(roles, ['ACCOUNTANT']) && !current.managedByAccountant) {
      throw new ForbiddenException(
        `Tax definition ${dto.code} is not delegated to accountants - an OWNER/ADMIN must revise it`,
      );
    }

    await db.taxDefinition.update({
      where: { id: current.id },
      data: { validTo: effectiveFrom },
    });

    return db.taxDefinition.create({
      data: {
        tenantId,
        code: current.code,
        name: current.name,
        calculationType: current.calculationType,
        rate: dto.rate ?? current.rate ?? undefined,
        fixedAmount: dto.fixedAmount ?? current.fixedAmount ?? undefined,
        formula: current.formula,
        validFrom: effectiveFrom,
        managedByAccountant: current.managedByAccountant,
      },
    });
  }

  private async getActiveDefinition(code: string, asOf: Date): Promise<TaxDefinition> {
    const definition = await getTenantDb().taxDefinition.findFirst({
      where: {
        code,
        validFrom: { lte: asOf },
        OR: [{ validTo: null }, { validTo: { gt: asOf } }],
      },
      orderBy: { validFrom: 'desc' },
    });
    if (!definition) {
      throw new NotFoundException(
        `No tax definition active for code ${code} as of ${asOf.toISOString()}`,
      );
    }
    return definition;
  }
}
