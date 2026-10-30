import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { hasAnyRole } from '@plexo/types';
import {
  getTenantDb,
  getTenantId,
  getUserRoles,
  type WithholdingRegime,
  type WithholdingTaxType,
} from '@plexo/database';
import type { CreateWithholdingRegimeDto } from './dto/create-withholding-regime.dto.js';
import type { ReviseWithholdingRegimeDto } from './dto/revise-withholding-regime.dto.js';

/**
 * Catálogo de retenciones que el tenant practica a sus proveedores
 * (Ganancias/IVA/IIBB) - mismo patrón de versionado que TaxesService
 * (tasas de venta), ver el comentario del modelo WithholdingRegime. No
 * persigue la tabla real de cada jurisdicción (24 provincias, tablas que
 * cambian con el tiempo) - el contador tipea rate/minTaxableAmount a mano,
 * igual que TaxDefinition.
 */
@Injectable()
export class WithholdingRegimeService {
  async createRegime(dto: CreateWithholdingRegimeDto): Promise<WithholdingRegime> {
    const db = getTenantDb();
    const existing = await db.withholdingRegime.findFirst({ where: { code: dto.code, validTo: null } });
    if (existing) {
      throw new BadRequestException(
        `Withholding regime ${dto.code} already exists and is active - use revise instead`,
      );
    }

    return db.withholdingRegime.create({
      data: {
        tenantId: getTenantId(),
        code: dto.code,
        name: dto.name,
        taxType: dto.taxType,
        jurisdiction: dto.jurisdiction,
        rate: dto.rate,
        minTaxableAmount: dto.minTaxableAmount ?? 0,
        managedByAccountant: dto.managedByAccountant ?? false,
      },
    });
  }

  listRegimes(): Promise<WithholdingRegime[]> {
    return getTenantDb().withholdingRegime.findMany({ orderBy: [{ code: 'asc' }, { validFrom: 'asc' }] });
  }

  listActiveRegimes(
    taxType?: WithholdingTaxType,
    asOf: Date = new Date(),
  ): Promise<WithholdingRegime[]> {
    return getTenantDb().withholdingRegime.findMany({
      where: {
        taxType,
        validFrom: { lte: asOf },
        OR: [{ validTo: null }, { validTo: { gt: asOf } }],
      },
      orderBy: { code: 'asc' },
    });
  }

  getRegimeHistory(code: string): Promise<WithholdingRegime[]> {
    return getTenantDb().withholdingRegime.findMany({ where: { code }, orderBy: { validFrom: 'asc' } });
  }

  /**
   * Same versioning operation as TaxesService.reviseTaxDefinition: closes
   * the currently-active row for `code` at effectiveFrom and inserts a new
   * one with the revised rate/jurisdiction/minTaxableAmount. An ACCOUNTANT
   * may only do this when managedByAccountant=true on the current row.
   */
  async reviseRegime(dto: ReviseWithholdingRegimeDto): Promise<WithholdingRegime> {
    const db = getTenantDb();
    const tenantId = getTenantId();
    const roles = getUserRoles();
    const effectiveFrom = dto.effectiveFrom ? new Date(dto.effectiveFrom) : new Date();

    const current = await this.getActiveRegime(dto.code, effectiveFrom);

    if (hasAnyRole(roles, ['ACCOUNTANT']) && !current.managedByAccountant) {
      throw new ForbiddenException(
        `Withholding regime ${dto.code} is not delegated to accountants - an OWNER/ADMIN must revise it`,
      );
    }

    await db.withholdingRegime.update({
      where: { id: current.id },
      data: { validTo: effectiveFrom },
    });

    return db.withholdingRegime.create({
      data: {
        tenantId,
        code: current.code,
        name: current.name,
        taxType: current.taxType,
        jurisdiction: dto.jurisdiction ?? current.jurisdiction ?? undefined,
        rate: dto.rate ?? current.rate,
        minTaxableAmount: dto.minTaxableAmount ?? current.minTaxableAmount,
        validFrom: effectiveFrom,
        managedByAccountant: current.managedByAccountant,
      },
    });
  }

  private async getActiveRegime(code: string, asOf: Date): Promise<WithholdingRegime> {
    const regime = await getTenantDb().withholdingRegime.findFirst({
      where: {
        code,
        validFrom: { lte: asOf },
        OR: [{ validTo: null }, { validTo: { gt: asOf } }],
      },
      orderBy: { validFrom: 'desc' },
    });
    if (!regime) {
      throw new NotFoundException(`No withholding regime active for code ${code} as of ${asOf.toISOString()}`);
    }
    return regime;
  }
}
