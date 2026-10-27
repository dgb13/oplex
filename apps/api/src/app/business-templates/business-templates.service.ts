import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { getTenantDb, Prisma, PrismaService, withTenantContext, type BusinessTemplate } from '@plexo/database';
import { assertVehicleFields, slugKey } from '../customer-assets/asset-fields.js';
import type { TemplateAssetType } from '../customer-assets/customer-assets.service.js';
import { assertOneStatusPerQuoteOutcome, type TemplateWorkOrder } from '../work-orders/work-orders.service.js';
import { BUSINESS_FAMILIES } from './business-modules.js';
import type {
  BusinessTemplateConfigDto,
  TemplateAssetTypeDto,
  TemplateWorkOrderDto,
  CreateBusinessTemplateDto,
  UpdateBusinessTemplateDto,
} from './dto/business-template.dto.js';

/** Config guardada en BusinessTemplate.config: módulos, sugerencias y, si el
 * rubro los usa, la ficha (assetType) y los estados de las órdenes. */
export interface BusinessTemplateConfig {
  modules: string[];
  suggestedCategories: string[];
  defaultWarranty?: string;
  notice?: string;
  assetType?: TemplateAssetType;
  workOrder?: TemplateWorkOrder;
}

export interface BusinessTemplateView {
  id: string;
  key: string;
  name: string;
  family: string;
  iconKey: string;
  sortOrder: number;
  isActive: boolean;
  version: number;
  config: BusinessTemplateConfig;
  updatedAt: Date;
}

export function readConfig(template: Pick<BusinessTemplate, 'config'>): BusinessTemplateConfig {
  const raw = (template.config ?? {}) as Partial<BusinessTemplateConfig>;
  return {
    ...raw,
    modules: Array.isArray(raw.modules) ? raw.modules : [],
    suggestedCategories: Array.isArray(raw.suggestedCategories) ? raw.suggestedCategories : [],
  };
}

function toView(template: BusinessTemplate): BusinessTemplateView {
  return {
    id: template.id,
    key: template.key,
    name: template.name,
    family: template.family,
    iconKey: template.iconKey,
    sortOrder: template.sortOrder,
    isActive: template.isActive,
    version: template.version,
    config: readConfig(template),
    updatedAt: template.updatedAt,
  };
}

/** "Taller mecánico" -> "taller-mecanico" (misma regla que la migración). */
export function slugifyTemplateName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function cleanConfig(dto: BusinessTemplateConfigDto): BusinessTemplateConfig {
  const categories = dto.suggestedCategories.map((c) => c.trim()).filter(Boolean);
  return {
    modules: [...new Set(dto.modules)],
    suggestedCategories: [...new Set(categories)],
    ...(dto.defaultWarranty?.trim() ? { defaultWarranty: dto.defaultWarranty.trim() } : {}),
    ...(dto.notice?.trim() ? { notice: dto.notice.trim() } : {}),
    ...(dto.assetType ? { assetType: cleanAssetType(dto.assetType) } : {}),
    ...(dto.workOrder ? { workOrder: cleanWorkOrder(dto.workOrder) } : {}),
  };
}

/** Ficha del rubro: las claves existentes se conservan (los negocios las
 * usan para recibir novedades); las nuevas salen del nombre. */
export function cleanAssetType(dto: TemplateAssetTypeDto): TemplateAssetType {
  const used = new Set<string>();
  const fields = dto.fields.map((f) => {
    const label = f.label.trim();
    if (!label) throw new BadRequestException('Todos los campos de la ficha necesitan un nombre');
    let key = f.key?.trim() && !used.has(f.key.trim()) ? f.key.trim() : '';
    if (!key) {
      const base = slugKey(label);
      key = base;
      for (let n = 2; used.has(key); n++) key = `${base}${n}`;
    }
    used.add(key);
    const options = f.type === 'SELECT' ? [...new Set((f.options ?? []).map((o) => o.trim()).filter(Boolean))] : undefined;
    if (f.type === 'SELECT' && (!options || options.length === 0)) {
      throw new BadRequestException(`El campo "${label}" es una lista: cargá al menos una opción`);
    }
    return {
      key,
      label,
      type: f.type,
      ...(f.required || f.isIdentifier ? { required: true } : {}),
      ...(f.isIdentifier ? { isIdentifier: true } : {}),
      ...(options ? { options } : {}),
      ...(f.type === 'VEHICLE_BRAND' ? { vehicleKind: f.vehicleKind ?? 'AUTO' } : {}),
    };
  });
  if (fields.filter((f) => f.isIdentifier).length !== 1) {
    throw new BadRequestException('La ficha tiene que tener exactamente un dato principal (el que se usa para buscar)');
  }
  const labels = fields.map((f) => f.label.toLowerCase());
  const repeatedField = labels.find((l, i) => labels.indexOf(l) !== i);
  if (repeatedField) throw new BadRequestException(`La ficha tiene dos campos "${repeatedField}"`);
  assertVehicleFields(fields);
  return { name: dto.name.trim(), ...(dto.notice?.trim() ? { notice: dto.notice.trim() } : {}), fields };
}

export function cleanWorkOrder(dto: TemplateWorkOrderDto): TemplateWorkOrder {
  const statuses = dto.statuses
    .map((s) => ({
      name: s.name.trim(),
      ...(s.final ? { final: true } : {}),
      ...(s.notifiesCustomer ? { notifiesCustomer: true } : {}),
      ...(s.quoteOutcome ? { quoteOutcome: s.quoteOutcome } : {}),
    }))
    .filter((s) => s.name);
  if (statuses.length < 2) throw new BadRequestException('Las órdenes necesitan al menos dos estados');
  const names = statuses.map((s) => s.name.toLowerCase());
  const repeatedStatus = names.find((n, i) => names.indexOf(n) !== i);
  if (repeatedStatus) throw new BadRequestException(`Hay dos estados "${repeatedStatus}"`);
  if (!statuses.some((s) => s.final)) throw new BadRequestException('Marcá al menos un estado que cierre la orden');
  if (statuses[0].final) throw new BadRequestException('El primer estado no puede cerrar la orden');
  assertOneStatusPerQuoteOutcome(statuses);
  return { docName: dto.docName.trim(), statuses };
}

/**
 * Catálogo de rubros (tabla de plataforma, sin RLS - como Plan): usa el
 * PrismaService directo, nunca getTenantDb(). Cada cambio de config publica
 * una versión nueva y guarda una copia en BusinessTemplateVersion; los
 * negocios que ya eligieron el rubro no se tocan (tienen su copia).
 */
@Injectable()
export class BusinessTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async listActive(): Promise<BusinessTemplateView[]> {
    const rows = await this.prisma.businessTemplate.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return sortByFamily(rows.map(toView));
  }

  async listAll(): Promise<BusinessTemplateView[]> {
    const rows = await this.prisma.businessTemplate.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
    return sortByFamily(rows.map(toView));
  }

  async findActiveByKey(key: string): Promise<BusinessTemplateView | null> {
    const row = await this.prisma.businessTemplate.findUnique({ where: { key } });
    return row && row.isActive ? toView(row) : null;
  }

  async findByKey(key: string): Promise<BusinessTemplateView | null> {
    const row = await this.prisma.businessTemplate.findUnique({ where: { key } });
    return row ? toView(row) : null;
  }

  async create(dto: CreateBusinessTemplateDto, adminEmail: string): Promise<BusinessTemplateView> {
    const base = slugifyTemplateName(dto.name);
    if (!base) throw new BadRequestException('El nombre del rubro tiene que tener letras o números');
    let key = base;
    for (let n = 2; await this.prisma.businessTemplate.findUnique({ where: { key } }); n++) key = `${base}-${n}`;
    const config = cleanConfig(dto.config);
    const last = await this.prisma.businessTemplate.findFirst({ orderBy: { sortOrder: 'desc' } });
    const created = await this.prisma.$transaction(async (tx) => {
      const template = await tx.businessTemplate.create({
        data: {
          key,
          name: dto.name.trim(),
          family: dto.family,
          iconKey: dto.iconKey,
          sortOrder: dto.sortOrder ?? (last?.sortOrder ?? 0) + 10,
          config: config as unknown as Prisma.InputJsonValue,
        },
      });
      await tx.businessTemplateVersion.create({
        data: { templateId: template.id, version: 1, config: config as unknown as Prisma.InputJsonValue, publishedBy: adminEmail },
      });
      return template;
    });
    return toView(created);
  }

  async update(id: string, dto: UpdateBusinessTemplateDto, adminEmail: string): Promise<BusinessTemplateView> {
    const current = await this.prisma.businessTemplate.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Rubro no encontrado');

    const currentConfig = readConfig(current);
    // Ficha y estados: si no vienen se conservan; null los quita.
    const kept: BusinessTemplateConfig = { ...currentConfig };
    delete kept.defaultWarranty;
    delete kept.notice;
    if (dto.config?.assetType === null) delete kept.assetType;
    if (dto.config?.workOrder === null) delete kept.workOrder;
    const nextConfig = dto.config ? { ...kept, ...cleanConfig(dto.config) } : currentConfig;
    // Postgres (JSONB) devuelve las claves en otro orden: se comparan
    // ordenadas para no publicar una versión "nueva" idéntica.
    const configChanged = stableStringify(nextConfig) !== stableStringify(currentConfig);
    const version = configChanged ? current.version + 1 : current.version;

    const updated = await this.prisma.$transaction(async (tx) => {
      const template = await tx.businessTemplate.update({
        where: { id },
        data: {
          name: dto.name?.trim(),
          family: dto.family,
          iconKey: dto.iconKey,
          sortOrder: dto.sortOrder,
          isActive: dto.isActive,
          ...(configChanged ? { config: nextConfig as unknown as Prisma.InputJsonValue, version } : {}),
        },
      });
      if (configChanged) {
        await tx.businessTemplateVersion.create({
          data: { templateId: id, version, config: nextConfig as unknown as Prisma.InputJsonValue, publishedBy: adminEmail },
        });
      }
      return template;
    });
    return toView(updated);
  }

  createRequest(text: string, tenantId: string | null) {
    return this.prisma.businessTemplateRequest.create({ data: { text: text.trim(), tenantId } });
  }

  async listRequests() {
    const requests = await this.prisma.businessTemplateRequest.findMany({
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 200,
    });
    // Nombre del negocio que lo pidió, para darle contexto al operador.
    // tenants tiene RLS: se lee cada uno dentro de su propio contexto.
    const tenantIds = [...new Set(requests.map((r) => r.tenantId).filter((id): id is string => Boolean(id)))];
    const names = new Map<string, string>();
    for (const tenantId of tenantIds) {
      const tenant = await withTenantContext(this.prisma, tenantId, () =>
        getTenantDb().tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
      );
      if (tenant) names.set(tenantId, tenant.name);
    }
    return requests.map((r) => ({ ...r, tenantName: r.tenantId ? (names.get(r.tenantId) ?? null) : null }));
  }

  async updateRequest(id: string, status: string) {
    const existing = await this.prisma.businessTemplateRequest.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Pedido no encontrado');
    return this.prisma.businessTemplateRequest.update({ where: { id }, data: { status } });
  }
}

function sortByFamily(views: BusinessTemplateView[]): BusinessTemplateView[] {
  const order = new Map<string, number>(BUSINESS_FAMILIES.map((f, i) => [f, i]));
  return [...views].sort(
    (a, b) =>
      (order.get(a.family) ?? 99) - (order.get(b.family) ?? 99) || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
  );
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
