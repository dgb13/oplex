import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@plexo/database';
import type { AssetFieldDef, AssetValues, VehicleKind } from '../customer-assets/asset-fields.js';

/** "Citroën  C4" / "citroen c4" -> "citroen c4": para comparar lo escrito a
 * mano con la lista sin importar mayúsculas, acentos ni espacios. */
export function catalogKey(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export interface VehicleBrandView {
  id: string;
  name: string;
  models: { id: string; name: string }[];
}

export interface AdminVehicleBrandView {
  id: string;
  vehicleKind: string;
  name: string;
  active: boolean;
  reviewed: boolean;
  models: { id: string; name: string; active: boolean; reviewed: boolean }[];
}

export interface VehicleSuggestionView {
  id: string;
  vehicleKind: string;
  field: 'BRAND' | 'MODEL';
  brandName: string | null;
  /** Para MODEL: la marca de la lista a la que pertenece (null = la marca
   * también está escrita a mano: hay que sumarla primero). */
  brandId: string | null;
  text: string;
  tenants: number;
  updatedAt: Date;
}

/**
 * Marcas y modelos de vehículos (campos VEHICLE_BRAND / VEHICLE_MODEL de
 * las fichas). Tablas de plataforma: siempre por PrismaService, nunca por
 * getTenantDb. Lo que un negocio escribe a mano ("Otra, no está en la
 * lista") queda en vehicle_catalog_suggestions para que Oplex decida en
 * /admin › Marcas y modelos: sumarlo, unirlo con uno que ya existe o
 * descartarlo. Unir o renombrar NO toca las fichas ya cargadas.
 */
@Injectable()
export class VehicleCatalogService {
  private readonly logger = new Logger(VehicleCatalogService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** La lista que ve un negocio: sólo lo activo. */
  async list(kind: VehicleKind): Promise<VehicleBrandView[]> {
    const brands = await this.prisma.vehicleBrand.findMany({
      where: { vehicleKind: kind, active: true },
      include: { models: { where: { active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } } },
      orderBy: { name: 'asc' },
    });
    return brands.map((b) => ({ id: b.id, name: b.name, models: b.models }));
  }

  /**
   * Después de guardar una ficha: anota la marca y el modelo que no están en
   * la lista. Se llama con onCommit (sólo si la ficha se guardó) y nunca
   * hace fallar nada: es un aviso para Oplex.
   */
  async recordHandTyped(fields: AssetFieldDef[], values: AssetValues, tenantId: string): Promise<void> {
    const brandField = fields.find((f) => f.type === 'VEHICLE_BRAND' && !f.hidden);
    const brandText = brandField ? values[brandField.key] : undefined;
    if (!brandField || typeof brandText !== 'string' || !catalogKey(brandText)) return;
    const kind = brandField.vehicleKind ?? 'AUTO';

    // Ocultas incluidas: una marca que Oplex ocultó no se vuelve a proponer.
    const brands = await this.prisma.vehicleBrand.findMany({ where: { vehicleKind: kind }, include: { models: true } });
    const brand = brands.find((b) => catalogKey(b.name) === catalogKey(brandText));
    if (!brand) await this.suggest(kind, 'BRAND', null, brandText, tenantId);

    const modelField = fields.find((f) => f.type === 'VEHICLE_MODEL' && !f.hidden);
    const modelText = modelField ? values[modelField.key] : undefined;
    if (typeof modelText !== 'string' || !catalogKey(modelText)) return;
    if (brand?.models.some((m) => catalogKey(m.name) === catalogKey(modelText))) return;
    await this.suggest(kind, 'MODEL', brand?.name ?? brandText, modelText, tenantId);
  }

  private async suggest(kind: string, field: 'BRAND' | 'MODEL', brandName: string | null, text: string, tenantId: string) {
    const matchKey = [kind, field, catalogKey(brandName ?? ''), catalogKey(text)].join('|');
    // Una fila por texto: si ya está (aunque se haya descartado o unido), sólo
    // se suma el negocio. Descartado sigue descartado.
    await this.prisma.$executeRaw`
      INSERT INTO "vehicle_catalog_suggestions" ("id", "vehicleKind", "field", "brandName", "text", "matchKey", "tenantIds", "updatedAt")
      VALUES (gen_random_uuid()::text, ${kind}, ${field}, ${brandName}, ${text.trim()}, ${matchKey}, ARRAY[${tenantId}]::text[], CURRENT_TIMESTAMP)
      ON CONFLICT ("matchKey") DO UPDATE SET
        "tenantIds" = CASE
          WHEN ${tenantId} = ANY("vehicle_catalog_suggestions"."tenantIds") THEN "vehicle_catalog_suggestions"."tenantIds"
          ELSE array_append("vehicle_catalog_suggestions"."tenantIds", ${tenantId})
        END,
        "updatedAt" = CURRENT_TIMESTAMP`;
  }

  /** Para onCommit: un fallo se registra, no se propaga. */
  recordHandTypedQuietly(fields: AssetFieldDef[], values: AssetValues, tenantId: string): void {
    this.recordHandTyped(fields, values, tenantId).catch((err: unknown) =>
      this.logger.warn(`No se pudo anotar la marca/modelo escrito a mano: ${(err as Error).message}`),
    );
  }

  // ---- /admin ----

  async adminList(kind: VehicleKind): Promise<AdminVehicleBrandView[]> {
    const brands = await this.prisma.vehicleBrand.findMany({
      where: { vehicleKind: kind },
      include: {
        models: { select: { id: true, name: true, active: true, reviewed: true }, orderBy: { name: 'asc' } },
      },
      orderBy: { name: 'asc' },
    });
    return brands.map((b) => ({
      id: b.id,
      vehicleKind: b.vehicleKind,
      name: b.name,
      active: b.active,
      reviewed: b.reviewed,
      models: b.models,
    }));
  }

  async createBrand(kind: VehicleKind, name: string) {
    const clean = name.trim();
    await this.assertBrandNameFree(kind, clean);
    // Cargada por una persona de Oplex: ya está revisada.
    return this.prisma.vehicleBrand.create({ data: { vehicleKind: kind, name: clean, reviewed: true } });
  }

  async updateBrand(id: string, dto: { name?: string; active?: boolean; reviewed?: boolean }) {
    const brand = await this.prisma.vehicleBrand.findUnique({ where: { id } });
    if (!brand) throw new NotFoundException('Marca no encontrada');
    const name = dto.name?.trim();
    if (name && name !== brand.name) await this.assertBrandNameFree(brand.vehicleKind, name, id);
    return this.prisma.vehicleBrand.update({
      where: { id },
      data: { name: name || undefined, active: dto.active, reviewed: dto.reviewed },
    });
  }

  async createModel(brandId: string, name: string) {
    const clean = name.trim();
    const brand = await this.prisma.vehicleBrand.findUnique({ where: { id: brandId } });
    if (!brand) throw new NotFoundException('Marca no encontrada');
    await this.assertModelNameFree(brandId, clean, brand.name);
    return this.prisma.vehicleModel.create({ data: { brandId, name: clean, reviewed: true } });
  }

  async updateModel(id: string, dto: { name?: string; active?: boolean; reviewed?: boolean }) {
    const model = await this.prisma.vehicleModel.findUnique({ where: { id }, include: { brand: true } });
    if (!model) throw new NotFoundException('Modelo no encontrado');
    const name = dto.name?.trim();
    if (name && name !== model.name) await this.assertModelNameFree(model.brandId, name, model.brand.name, id);
    return this.prisma.vehicleModel.update({
      where: { id },
      data: { name: name || undefined, active: dto.active, reviewed: dto.reviewed },
    });
  }

  async suggestions(): Promise<VehicleSuggestionView[]> {
    const rows = await this.prisma.vehicleCatalogSuggestion.findMany({
      where: { status: 'NEW' },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });
    const brands = await this.prisma.vehicleBrand.findMany({ select: { id: true, vehicleKind: true, name: true } });
    return rows.map((r) => {
      const brand =
        r.field === 'MODEL'
          ? brands.find((b) => b.vehicleKind === r.vehicleKind && catalogKey(b.name) === catalogKey(r.brandName ?? ''))
          : undefined;
      return {
        id: r.id,
        vehicleKind: r.vehicleKind,
        field: r.field as 'BRAND' | 'MODEL',
        brandName: brand?.name ?? r.brandName,
        brandId: brand?.id ?? null,
        text: r.text,
        tenants: r.tenantIds.length,
        updatedAt: r.updatedAt,
      };
    });
  }

  /** "Sumar a la lista". */
  async addSuggestion(id: string) {
    const s = await this.pendingSuggestion(id);
    const kind = s.vehicleKind as VehicleKind;
    if (s.field === 'BRAND') {
      const existing = await this.findBrand(kind, s.text);
      if (!existing) await this.createBrand(kind, s.text);
    } else {
      const brand = await this.findBrand(kind, s.brandName ?? '');
      if (!brand) throw new BadRequestException(`Primero sumá la marca "${s.brandName}" a la lista`);
      const models = await this.prisma.vehicleModel.findMany({ where: { brandId: brand.id } });
      if (!models.some((m) => catalogKey(m.name) === catalogKey(s.text))) await this.createModel(brand.id, s.text);
    }
    await this.prisma.vehicleCatalogSuggestion.update({ where: { id }, data: { status: 'ADDED' } });
  }

  /** "Unir con…": es la misma marca o modelo mal escrito. Sólo deja de
   * proponerse; las fichas que lo tienen escrito así no se tocan. */
  async mergeSuggestion(id: string, targetId: string) {
    const s = await this.pendingSuggestion(id);
    if (s.field === 'BRAND') {
      const target = await this.prisma.vehicleBrand.findUnique({ where: { id: targetId } });
      if (!target || target.vehicleKind !== s.vehicleKind) throw new BadRequestException('Elegí una marca de la lista');
    } else {
      const target = await this.prisma.vehicleModel.findUnique({ where: { id: targetId }, include: { brand: true } });
      if (!target || target.brand.vehicleKind !== s.vehicleKind) throw new BadRequestException('Elegí un modelo de la lista');
    }
    await this.prisma.vehicleCatalogSuggestion.update({ where: { id }, data: { status: 'MERGED' } });
  }

  async discardSuggestion(id: string) {
    await this.pendingSuggestion(id);
    await this.prisma.vehicleCatalogSuggestion.update({ where: { id }, data: { status: 'DISCARDED' } });
  }

  private async pendingSuggestion(id: string) {
    const s = await this.prisma.vehicleCatalogSuggestion.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('No se encontró lo escrito a mano');
    if (s.status !== 'NEW') throw new BadRequestException('Eso ya se resolvió');
    return s;
  }

  private async findBrand(kind: string, name: string) {
    const brands = await this.prisma.vehicleBrand.findMany({ where: { vehicleKind: kind } });
    return brands.find((b) => catalogKey(b.name) === catalogKey(name)) ?? null;
  }

  private async assertBrandNameFree(kind: string, name: string, exceptId?: string) {
    if (!catalogKey(name)) throw new BadRequestException('Escribí el nombre de la marca');
    const existing = await this.findBrand(kind, name);
    if (existing && existing.id !== exceptId) throw new BadRequestException(`Ya está la marca "${existing.name}"`);
  }

  private async assertModelNameFree(brandId: string, name: string, brandName: string, exceptId?: string) {
    if (!catalogKey(name)) throw new BadRequestException('Escribí el nombre del modelo');
    const models = await this.prisma.vehicleModel.findMany({ where: { brandId } });
    const existing = models.find((m) => catalogKey(m.name) === catalogKey(name));
    if (existing && existing.id !== exceptId) {
      throw new BadRequestException(`${brandName} ya tiene el modelo "${existing.name}"`);
    }
  }
}
