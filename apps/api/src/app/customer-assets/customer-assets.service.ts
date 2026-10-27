import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { getTenantDb, getTenantId, onCommit, Prisma, PrismaService, type CustomerAssetType } from '@plexo/database';
import { VehicleCatalogService } from '../vehicle-catalog/vehicle-catalog.service.js';
import {
  cleanValues,
  identifierField,
  identifierKey,
  mergeFieldDefs,
  pluralize,
  readFields,
  type AssetFieldDef,
  type AssetValues,
} from './asset-fields.js';
import type {
  CreateCustomerAssetDto,
  ListCustomerAssetsQuery,
  UpdateCustomerAssetDto,
  UpdateCustomerAssetTypeDto,
} from './dto/customer-asset.dto.js';

/** Forma de BusinessTemplate.config.assetType (ver la migración de rubros). */
export interface TemplateAssetType {
  name: string;
  notice?: string;
  fields: AssetFieldDef[];
}

export interface CustomerAssetTypeView {
  id: string;
  name: string;
  pluralName: string;
  notice: string | null;
  fields: AssetFieldDef[];
}

function toTypeView(type: CustomerAssetType): CustomerAssetTypeView {
  return {
    id: type.id,
    name: type.name,
    pluralName: type.pluralName,
    notice: type.notice,
    fields: readFields(type.fields),
  };
}

const ASSET_INCLUDE = {
  company: { select: { id: true, name: true, phone: true } },
  type: true,
} as const;

type AssetRow = Prisma.CustomerAssetGetPayload<{ include: typeof ASSET_INCLUDE }>;

function toAssetView(row: AssetRow) {
  return {
    id: row.id,
    typeId: row.typeId,
    typeName: row.type.name,
    identifier: row.identifier,
    values: (row.values ?? {}) as AssetValues,
    active: row.active,
    company: row.company,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Fichas del cliente (etapa 3 del plan de rubros): vehículos de un taller,
 * equipos de un service, mascotas de una veterinaria. Todo por negocio
 * (RLS, getTenantDb). El tipo de ficha se copia de la plantilla del rubro.
 */
@Injectable()
export class CustomerAssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vehicleCatalog: VehicleCatalogService,
  ) {}

  /** Crea el tipo de ficha del rubro si el negocio todavía no tiene uno con
   * ese nombre. Lo llama BusinessProfileService.choose y, para los que
   * eligieron rubro antes de que existieran las fichas, listTypes. */
  async ensureTypeFromTemplate(assetType: TemplateAssetType): Promise<void> {
    const db = getTenantDb();
    const existing = await db.customerAssetType.findFirst({ where: { name: assetType.name } });
    if (existing) return;
    // La plantilla la carga Oplex (migración o /admin): sus campos y claves se
    // copian tal cual, sólo se asegura un dato principal.
    const fields = readFields(assetType.fields);
    if (fields.filter((f) => f.isIdentifier).length !== 1) return;
    const withIdentifier = fields.map((f) => (f.isIdentifier ? { ...f, required: true } : f));
    await db.customerAssetType.create({
      data: {
        tenantId: getTenantId(),
        name: assetType.name,
        pluralName: pluralize(assetType.name),
        notice: assetType.notice ?? null,
        fields: withIdentifier as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async listTypes(): Promise<CustomerAssetTypeView[]> {
    const db = getTenantDb();
    let types = await db.customerAssetType.findMany({ where: { active: true }, orderBy: { createdAt: 'asc' } });
    if (types.length === 0) {
      // Negocio que eligió un rubro con ficha antes de que salieran las
      // fichas: se le crea el tipo la primera vez que entra.
      const settings = await db.tenantSettings.findUnique({ where: { tenantId: getTenantId() } });
      if (settings?.businessTemplateKey) {
        const template = await this.prisma.businessTemplate.findUnique({ where: { key: settings.businessTemplateKey } });
        const assetType = (template?.config as { assetType?: TemplateAssetType } | undefined)?.assetType;
        if (assetType) {
          await this.ensureTypeFromTemplate(assetType);
          types = await db.customerAssetType.findMany({ where: { active: true }, orderBy: { createdAt: 'asc' } });
        }
      }
    }
    return types.map(toTypeView);
  }

  async createType(name: string): Promise<CustomerAssetTypeView> {
    const clean = name.trim();
    const db = getTenantDb();
    if (await db.customerAssetType.findFirst({ where: { name: clean, active: true } })) {
      throw new BadRequestException(`Ya tenés una ficha "${clean}"`);
    }
    const created = await db.customerAssetType.create({
      data: {
        tenantId: getTenantId(),
        name: clean,
        pluralName: pluralize(clean),
        fields: [{ key: 'identificacion', label: 'Identificación', type: 'TEXT', required: true, isIdentifier: true }],
      },
    });
    return toTypeView(created);
  }

  async updateType(id: string, dto: UpdateCustomerAssetTypeDto): Promise<CustomerAssetTypeView> {
    const db = getTenantDb();
    const current = await db.customerAssetType.findUnique({ where: { tenantId_id: { tenantId: getTenantId(), id } } });
    if (!current) throw new NotFoundException('Ficha no encontrada');
    const fields = dto.fields ? mergeFieldDefs(readFields(current.fields), dto.fields) : undefined;
    const updated = await db.customerAssetType.update({
      where: { tenantId_id: { tenantId: getTenantId(), id } },
      data: {
        name: dto.name?.trim(),
        pluralName: dto.pluralName?.trim(),
        notice: dto.notice === undefined ? undefined : dto.notice.trim() || null,
        ...(fields ? { fields: fields as unknown as Prisma.InputJsonValue } : {}),
      },
    });
    return toTypeView(updated);
  }

  async list(query: ListCustomerAssetsQuery) {
    const search = query.q?.trim();
    const key = search ? identifierKey(search) : '';
    const rows = await getTenantDb().customerAsset.findMany({
      where: {
        typeId: query.typeId,
        companyId: query.companyId,
        active: query.includeInactive === 'true' ? undefined : true,
        ...(search
          ? {
              OR: [
                ...(key ? [{ identifierKey: { contains: key } }] : []),
                { company: { name: { contains: search, mode: 'insensitive' as const } } },
              ],
            }
          : {}),
      },
      include: ASSET_INCLUDE,
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });
    return rows.map(toAssetView);
  }

  async get(id: string) {
    const row = await getTenantDb().customerAsset.findUnique({
      where: { tenantId_id: { tenantId: getTenantId(), id } },
      include: ASSET_INCLUDE,
    });
    if (!row) throw new NotFoundException('Ficha no encontrada');
    return toAssetView(row);
  }

  /** Otras fichas del mismo tipo con el mismo dato principal (normalizado).
   * La pantalla avisa antes de guardar; no se bloquea (un auto vendido puede
   * cargarse de nuevo con el dueño nuevo antes de pasar el viejo). */
  async findDuplicates(typeId: string, identifier: string, excludeId?: string) {
    const key = identifierKey(identifier);
    if (!key) return [];
    const rows = await getTenantDb().customerAsset.findMany({
      where: { typeId, identifierKey: key, active: true, ...(excludeId ? { id: { not: excludeId } } : {}) },
      include: ASSET_INCLUDE,
      take: 5,
    });
    return rows.map(toAssetView);
  }

  async create(dto: CreateCustomerAssetDto) {
    const db = getTenantDb();
    const tenantId = getTenantId();
    const type = await db.customerAssetType.findUnique({ where: { tenantId_id: { tenantId, id: dto.typeId } } });
    if (!type || !type.active) throw new BadRequestException('Tipo de ficha inválido');
    await this.assertCustomer(dto.companyId);
    const fields = readFields(type.fields);
    const values = cleanValues(fields, dto.values);
    const identifier = String(values[identifierField(fields).key]);
    const row = await db.customerAsset.create({
      data: {
        tenantId,
        typeId: type.id,
        companyId: dto.companyId,
        identifier,
        identifierKey: identifierKey(identifier),
        values: values as Prisma.InputJsonValue,
      },
      include: ASSET_INCLUDE,
    });
    onCommit(() => this.vehicleCatalog.recordHandTypedQuietly(fields, values, tenantId));
    return toAssetView(row);
  }

  async update(id: string, dto: UpdateCustomerAssetDto) {
    const db = getTenantDb();
    const tenantId = getTenantId();
    const current = await db.customerAsset.findUnique({ where: { tenantId_id: { tenantId, id } }, include: ASSET_INCLUDE });
    if (!current) throw new NotFoundException('Ficha no encontrada');
    if (dto.companyId && dto.companyId !== current.companyId) await this.assertCustomer(dto.companyId);

    let valuesUpdate: { identifier: string; identifierKey: string; values: Prisma.InputJsonValue } | undefined;
    if (dto.values) {
      const fields = readFields(current.type.fields);
      const values = cleanValues(fields, dto.values, (current.values ?? {}) as AssetValues);
      const identifier = String(values[identifierField(fields).key]);
      valuesUpdate = { identifier, identifierKey: identifierKey(identifier), values: values as Prisma.InputJsonValue };
      onCommit(() => this.vehicleCatalog.recordHandTypedQuietly(fields, values, tenantId));
    }
    const row = await db.customerAsset.update({
      where: { tenantId_id: { tenantId, id } },
      data: { ...valuesUpdate, companyId: dto.companyId, active: dto.active },
      include: ASSET_INCLUDE,
    });
    return toAssetView(row);
  }

  private async assertCustomer(companyId: string) {
    const company = await getTenantDb().company.findUnique({ where: { id: companyId }, include: { roles: true } });
    if (!company || !company.roles.some((r) => r.role === 'CUSTOMER')) {
      throw new BadRequestException('El dueño tiene que ser un cliente');
    }
  }
}
