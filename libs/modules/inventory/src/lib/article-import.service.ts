import { randomUUID } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import {
  getTenantDb,
  getTenantId,
  getUserId,
  PrismaService,
  tenantContextStorage,
  withTenantContext,
} from '@plexo/database';
import {
  cellText,
  directImageUrl,
  guessLengthUnit,
  toMillimeters,
  FIELD_LABELS,
  guessTax,
  guessUnit,
  valueKey,
  parseNumber,
  REQUIRED_FIELDS,
  suggestMapping,
  type ImportField,
  type ImportFieldOrSkip,
  type LengthUnit,
  type TaxOption,
  type UnitValue,
} from './import/import-fields.js';
import { CategoryAiService, MAX_AI_ARTICLES } from './import/category-ai.service.js';
import { ArticleImageService } from './article-image.service.js';
import { InventoryService } from './inventory.service.js';

const MAX_ROWS = 20_000;
const HEADER_SCAN_ROWS = 15;
const SAMPLE_VALUES = 3;
const PREVIEW_ROWS_PER_STATUS = 100;
const CHUNK_SIZE = 50;
const PHOTO_MAX_BYTES = 3 * 1024 * 1024;
const PHOTO_TIMEOUT_MS = 10_000;
const PHOTO_PARALLEL = 5;
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
/** Elección del usuario para un valor de IVA: el artículo queda sin alícuota. */
export const NO_TAX = '__none__';
const UNIT_LABELS: Record<UnitValue, string> = { UNIT: 'Unidad', KG: 'Kilogramo', LTR: 'Litro', MM: 'Milímetro', M2: 'Metro cuadrado' };

type Cell = string | number | Date | null;

export interface ImportColumn {
  index: number;
  header: string;
  samples: string[];
  suggested: ImportFieldOrSkip;
}

export interface ImportAnalysis {
  importId: string;
  fileName: string;
  sheetName: string;
  headerRow: number;
  rowCount: number;
  columns: ImportColumn[];
}

/** Lo que el usuario elige en el paso "Columnas" y en "Revisión". */
export interface ImportOptions {
  mapping: ImportFieldOrSkip[];
  onExisting: 'update' | 'skip';
  pricesIncludeVat: boolean;
  warehouseId?: string;
  /** Valor del archivo (normalizado) -> id de impuesto / unidad, para los que
   * Oplex no pudo decidir solo o el usuario corrigió. */
  taxValues?: Record<string, string>;
  unitValues?: Record<string, UnitValue>;
  /** Unidad de las columnas de largo y ancho (barras y planchas). */
  lengthUnit?: LengthUnit;
  /** Barras: el archivo trae precio, costo y existencia por metro y no por
   * barra entera. Oplex guarda el precio por barra (decisión del usuario,
   * 2026-10-04), así que se multiplica por el largo. */
  perMeter?: boolean;
  /** Categorías sugeridas con IA que el usuario aceptó, para artículos
   * nuevos sin categoría en el archivo: código (en minúscula) -> categoría. */
  aiCategories?: Record<string, string>;
}

export interface CategorySuggestion {
  /** código (en minúscula) -> categoría. */
  categories: Record<string, string>;
  /** Cuántos artículos van a cada categoría, de mayor a menor. */
  summary: { category: string; count: number; isNew: boolean }[];
  /** Artículos nuevos sin categoría que quedaron afuera por el límite. */
  leftOut: number;
}

type RowStatus = 'new' | 'update' | 'skip' | 'error';

export interface PlanRow {
  rowNumber: number;
  status: RowStatus;
  messages: string[];
  sku: string;
  name: string;
  category: string | null;
  /** La categoría la sugirió la IA (el archivo no la traía). */
  categoryFromAi: boolean;
  brand: string | null;
  description: string | null;
  color: string | null;
  size: string | null;
  supplier: string | null;
  unit: UnitValue;
  taxId: string | null;
  /** Precio de venta neto (sin IVA) que se va a guardar. */
  price: number | null;
  oldPrice: number | null;
  cost: number | null;
  /** Unidades; en barras, cantidad de barras enteras. */
  stock: number | null;
  measurementType: 'DISCRETE' | 'LINEAL_1D' | 'SURFACE_2D';
  barLengthMm: number | null;
  sheetWidthMm: number | null;
  sheetLengthMm: number | null;
  imageUrl: string | null;
  /** Avisos que no frenan la fila (por ejemplo, un link de foto inválido). */
  warnings: string[];
}

export interface ValueChoice {
  raw: string;
  count: number;
  resolved: string | null;
  resolvedLabel: string | null;
}

export interface ImportPreview {
  counts: Record<RowStatus, number>;
  rows: PlanRow[];
  taxValues: ValueChoice[];
  unitValues: ValueChoice[];
  taxOptions: { id: string; label: string }[];
  newCategories: string[];
  newSuppliers: string[];
  existingSuppliers: number;
  missingRequired: string[];
  /** Unidad probable de los largos/anchos del archivo (si los trae). */
  lengthUnitSuggested: LengthUnit | null;
  /** Artículos nuevos que quedan sin categoría (candidatos a la IA). */
  uncategorizedNew: number;
}

export interface ImportJobStatus {
  importId: string;
  state: 'running' | 'done' | 'failed';
  total: number;
  processed: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  newCategories: number;
  newSuppliers: number;
  photosSaved: number;
  photosFailed: number;
  error: string | null;
}

export interface Refs {
  variantsBySku: Map<string, { id: string; articleId: string; unitPrice: number }>;
  categoryIdByName: Map<string, string>;
  supplierIdByName: Map<string, string>;
  taxes: TaxOption[];
}

interface Job {
  status: ImportJobStatus;
  tenantId: string;
  errorRows: PlanRow[];
}

/**
 * Importador de artículos desde el archivo que el cliente ya tiene (Excel o
 * CSV, con sus propias columnas). Mockup aprobado 2026-10-04: subir ->
 * reconocer columnas -> revisar -> importar en segundo plano.
 *
 * El archivo subido se guarda en `storage/imports/<tenant>/` (NO en
 * `uploads/`, que se sirve sin login) para no tener que volver a subirlo en
 * cada paso. El estado de cada importación en curso vive en memoria: con una
 * sola instancia de la API alcanza; si la API se reinicia a mitad de una
 * importación, lo ya importado queda y el resto se vuelve a subir.
 */
@Injectable()
export class ArticleImportService {
  private readonly logger = new Logger(ArticleImportService.name);
  private readonly storageDir = join(process.cwd(), 'storage', 'imports');
  private readonly jobs = new Map<string, Job>();

  constructor(
    private readonly inventoryService: InventoryService,
    private readonly articleImageService: ArticleImageService,
    private readonly prisma: PrismaService,
    private readonly categoryAi: CategoryAiService,
  ) {}

  // ---------------------------------------------------------------------------
  // Paso 1: subir y analizar

  async analyze(fileName: string, buffer: Buffer): Promise<ImportAnalysis> {
    const grid = await parseFile(fileName, buffer);
    const importId = randomUUID();
    const dir = join(this.storageDir, getTenantId());
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${importId}${extensionOf(fileName)}`), buffer);
    await writeFile(join(dir, `${importId}.name`), fileName);
    return describe(importId, fileName, grid);
  }

  // ---------------------------------------------------------------------------
  // Paso 2 y 3: armar el plan (qué se crea, qué se actualiza, qué falla)

  async preview(importId: string, options: ImportOptions): Promise<ImportPreview> {
    const { grid, headerRow } = await this.load(importId);
    const refs = await this.loadRefs();
    const plan = buildPlan(grid, headerRow, options, refs);
    const counts: Record<RowStatus, number> = { new: 0, update: 0, skip: 0, error: 0 };
    for (const row of plan.rows) counts[row.status]++;

    const byStatus = (status: RowStatus) => plan.rows.filter((r) => r.status === status).slice(0, PREVIEW_ROWS_PER_STATUS);
    const taxLabel = (id: string | null) => (id === NO_TAX ? 'Sin IVA' : (refs.taxes.find((t) => t.id === id)?.name ?? null));
    return {
      counts,
      rows: [...byStatus('error'), ...byStatus('update'), ...byStatus('new'), ...byStatus('skip')],
      taxValues: plan.taxValues.map((v) => ({ ...v, resolvedLabel: taxLabel(v.resolved) })),
      unitValues: plan.unitValues.map((v) => ({
        ...v,
        resolvedLabel: v.resolved ? UNIT_LABELS[v.resolved as UnitValue] : null,
      })),
      taxOptions: refs.taxes.map((t) => ({ id: t.id, label: t.name })),
      newCategories: plan.newCategories,
      newSuppliers: plan.newSuppliers,
      existingSuppliers: plan.existingSuppliers,
      missingRequired: REQUIRED_FIELDS.filter((f) => !options.mapping.includes(f)).map((f) => FIELD_LABELS[f]),
      lengthUnitSuggested: plan.lengthUnitSuggested,
      uncategorizedNew: plan.rows.filter((r) => r.status === 'new' && !r.category).length,
    };
  }

  /** Categorías con IA para los artículos nuevos que vienen sin categoría.
   * No se guarda nada: el usuario las revisa y, si las acepta, vuelven en
   * options.aiCategories. */
  async suggestCategories(importId: string, options: ImportOptions): Promise<CategorySuggestion> {
    const { grid, headerRow } = await this.load(importId);
    const refs = await this.loadRefs();
    const plan = buildPlan(grid, headerRow, { ...options, aiCategories: undefined }, refs);
    const pending = plan.rows.filter((r) => r.status === 'new' && !r.category && r.name);
    const articles = pending.slice(0, MAX_AI_ARTICLES).map((r) => ({ sku: r.sku, name: r.name }));
    // Las que ya existen y las que trae el archivo, para reusarlas.
    const known = new Map<string, string>();
    const existingNames = await getTenantDb().category.findMany({ where: { parentId: null }, select: { name: true } });
    for (const c of existingNames) known.set(c.name.toLowerCase(), c.name);
    for (const c of plan.newCategories) known.set(c.toLowerCase(), c);

    const categories = articles.length ? await this.categoryAi.suggest(articles, [...known.values()]) : {};
    const counts = new Map<string, number>();
    for (const category of Object.values(categories)) counts.set(category, (counts.get(category) ?? 0) + 1);
    return {
      categories,
      summary: [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([category, count]) => ({ category, count, isNew: !refs.categoryIdByName.has(category.toLowerCase()) })),
      leftOut: pending.length - articles.length,
    };
  }

  // ---------------------------------------------------------------------------
  // Paso 4: importar en segundo plano

  async start(importId: string, options: ImportOptions): Promise<ImportJobStatus> {
    const existing = this.jobs.get(importId);
    if (existing?.status.state === 'running') return existing.status;

    const { grid, headerRow } = await this.load(importId);
    const refs = await this.loadRefs();
    const plan = buildPlan(grid, headerRow, options, refs);
    if (REQUIRED_FIELDS.some((f) => !options.mapping.includes(f))) {
      throw new BadRequestException('Faltan columnas obligatorias: Código, Nombre y Precio de venta');
    }
    const hasStock = plan.rows.some((r) => r.status === 'new' && r.stock);
    if (hasStock && !options.warehouseId) {
      const warehouses = await getTenantDb().warehouse.count();
      if (warehouses > 0) throw new BadRequestException('Elegí el depósito donde entra el stock');
      // Empresa nueva sin depósitos: el stock va a uno que se crea acá.
      const created = await this.inventoryService.createWarehouse({ name: 'Depósito principal' });
      options = { ...options, warehouseId: created.id };
    }

    const toProcess = plan.rows.filter((r) => r.status === 'new' || r.status === 'update');
    const status: ImportJobStatus = {
      importId,
      state: 'running',
      total: toProcess.length,
      processed: 0,
      created: 0,
      updated: 0,
      skipped: plan.rows.filter((r) => r.status === 'skip').length,
      failed: plan.rows.filter((r) => r.status === 'error').length,
      newCategories: 0,
      newSuppliers: 0,
      photosSaved: 0,
      photosFailed: 0,
      error: null,
    };
    const job: Job = { status, tenantId: getTenantId(), errorRows: plan.rows.filter((r) => r.status === 'error') };
    this.jobs.set(importId, job);

    const context = { tenantId: getTenantId(), userId: getUserId() ?? undefined, role: tenantContextStorage.getStore()?.role };
    // Fuera del request: cada tanda corre en su propia transacción con el
    // contexto del tenant (RLS), así una tanda que falla no deshace las otras.
    void this.run(job, toProcess, options, refs, context);
    return status;
  }

  status(importId: string): ImportJobStatus {
    const job = this.jobs.get(importId);
    if (!job || job.tenantId !== getTenantId()) throw new NotFoundException('No hay una importación con ese número');
    return job.status;
  }

  /** Excel con las filas que no se importaron y el motivo, para corregir y
   * volver a subir. Sirve antes (desde la revisión) o después de importar. */
  async errorsWorkbook(importId: string, options?: ImportOptions): Promise<Buffer> {
    let rows = this.jobs.get(importId)?.tenantId === getTenantId() ? this.jobs.get(importId)!.errorRows : null;
    if (!rows) {
      if (!options) throw new NotFoundException('No hay una importación con ese número');
      const { grid, headerRow } = await this.load(importId);
      rows = buildPlan(grid, headerRow, options, await this.loadRefs()).rows.filter((r) => r.status === 'error');
    }
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Con error');
    sheet.columns = [
      { header: 'Fila del archivo', key: 'row', width: 14 },
      { header: 'Código', key: 'sku', width: 18 },
      { header: 'Nombre', key: 'name', width: 40 },
      { header: 'Qué corregir', key: 'msg', width: 70 },
    ];
    sheet.getRow(1).font = { bold: true };
    for (const r of rows) sheet.addRow({ row: r.rowNumber, sku: r.sku, name: r.name, msg: r.messages.join(' · ') });
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  // ---------------------------------------------------------------------------
  // Exportar y planilla modelo

  /** Todos los artículos con las mismas columnas que reconoce el importador:
   * se cambian precios en Excel y se vuelve a subir como actualización. */
  async exportArticles(): Promise<Buffer> {
    const variants = await getTenantDb().articleVariant.findMany({
      include: { article: { include: { category: true, taxDefinition: true, preferredSupplier: true } } },
      orderBy: [{ article: { name: 'asc' } }, { sku: 'asc' }],
    });
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Artículos');
    sheet.columns = EXPORT_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
    sheet.getRow(1).font = { bold: true };
    for (const v of variants) {
      if (!v.article.active) continue;
      sheet.addRow({
        sku: v.sku,
        name: v.article.name,
        price: Number(v.unitPrice),
        tax: v.article.taxDefinition?.name ?? '',
        category: v.article.category?.name ?? '',
        brand: v.brand ?? '',
        unit: UNIT_EXPORT[v.article.unitOfMeasure] ?? 'UN',
        supplier: v.article.preferredSupplier?.name ?? '',
        color: v.color ?? '',
        size: v.size ?? '',
        description: v.article.description ?? '',
      });
    }
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  async generateTemplate(): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Artículos');
    const columns = [...EXPORT_COLUMNS, { header: 'Costo', key: 'cost', width: 12 }, { header: 'Stock inicial', key: 'stock', width: 12 }];
    sheet.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width }));
    sheet.getRow(1).font = { bold: true };
    sheet.addRow({
      sku: 'EJEMPLO-001',
      name: 'Silla de oficina (ejemplo, borrá esta fila)',
      price: 15000,
      tax: '21',
      category: 'Muebles',
      brand: '',
      unit: 'UN',
      supplier: '',
      color: 'Negro',
      size: '',
      description: '',
      cost: 9000,
      stock: 10,
    });
    const help = workbook.addWorksheet('Cómo completarla');
    help.getColumn(1).width = 110;
    [
      'Obligatorias: Código, Nombre y Precio de venta. El Código no puede repetirse.',
      'Si un Código ya existe en Oplex, al importar podés elegir actualizarlo (precio, nombre, categoría, marca...).',
      'IVA: 21, 10,5, 27, 0 o EX (exento). Unidad: UN, KG, LT, MM o M2.',
      'Categoría y Proveedor se crean solos si no existen.',
      'Stock inicial necesita el Costo y se carga sólo en artículos nuevos.',
      'Mismo Nombre con distinto Color o Talle = variantes de un mismo artículo.',
      'No hace falta usar esta planilla: Oplex también lee la lista exportada de tu sistema anterior.',
    ].forEach((line) => help.addRow([line]));
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  // ---------------------------------------------------------------------------

  private async run(
    job: Job,
    rows: PlanRow[],
    options: ImportOptions,
    refs: Refs,
    context: { tenantId: string; userId?: string; role?: Parameters<typeof withTenantContext>[4] },
  ): Promise<void> {
    // Variantes: filas nuevas con el mismo nombre y color/talle van juntas.
    const groups: PlanRow[][] = [];
    const groupByKey = new Map<string, PlanRow[]>();
    for (const row of rows) {
      if (row.status === 'new' && (row.color || row.size)) {
        const key = row.name.toLowerCase();
        const group = groupByKey.get(key);
        if (group) {
          group.push(row);
          continue;
        }
        const fresh = [row];
        groupByKey.set(key, fresh);
        groups.push(fresh);
      } else {
        groups.push([row]);
      }
    }

    try {
      for (let i = 0; i < groups.length; i += CHUNK_SIZE) {
        const chunk = groups.slice(i, i + CHUNK_SIZE);
        // Las fotos se bajan antes y fuera de la transacción: un link lento no
        // puede dejar la tanda abierta en la base.
        const photos = await this.downloadPhotos(chunk.flat(), job);
        await withTenantContext(
          this.prisma,
          context.tenantId,
          async () => {
            for (const group of chunk) {
              try {
                if (group[0].status === 'update') {
                  await this.updateExisting(group[0], refs, job, photos);
                  job.status.updated++;
                } else {
                  await this.createGroup(group, options, refs, job, photos);
                  job.status.created += group.length;
                }
              } catch (err) {
                for (const row of group) {
                  row.messages = [`No se pudo guardar: ${(err as Error).message}`];
                  job.errorRows.push(row);
                }
                job.status.failed += group.length;
              }
              job.status.processed += group.length;
            }
          },
          context.userId,
          context.role,
          120_000,
        );
      }
      job.status.state = 'done';
    } catch (err) {
      this.logger.error(`Importación ${job.status.importId}: ${(err as Error).message}`);
      job.status.state = 'failed';
      job.status.error = 'La importación se cortó. Lo importado hasta ahora quedó guardado; volvé a subir el archivo para completar el resto.';
    }
  }

  private async createGroup(
    group: PlanRow[],
    options: ImportOptions,
    refs: Refs,
    job: Job,
    photos: Map<PlanRow, Photo>,
  ): Promise<void> {
    const first = group[0];
    const categoryId = await this.categoryId(first.category, refs, job);
    const article = await this.inventoryService.createArticle({
      name: first.name,
      description: first.description ?? undefined,
      unitOfMeasure: first.unit,
      categoryId: categoryId ?? undefined,
      taxDefinitionId: first.taxId ?? undefined,
      hasVariants: group.length > 1,
      measurementType: first.measurementType,
      commercialLength: first.barLengthMm ?? undefined,
      sheetWidth: first.sheetWidthMm ?? undefined,
      sheetLength: first.sheetLengthMm ?? undefined,
    });
    await this.applyPhoto(article.id, group.find((r) => photos.has(r)), photos, job);
    const supplierId = await this.supplierId(first.supplier, refs, job);
    if (supplierId) {
      await getTenantDb().article.update({ where: { id: article.id }, data: { preferredSupplierId: supplierId } });
    }
    for (const row of group) {
      const variant = await this.inventoryService.createArticleVariant({
        articleId: article.id,
        sku: row.sku,
        color: row.color ?? undefined,
        size: row.size ?? undefined,
        brand: row.brand ?? undefined,
        unitPrice: row.price!,
      });
      refs.variantsBySku.set(row.sku.toLowerCase(), { id: variant.id, articleId: article.id, unitPrice: row.price! });
      if (row.stock && row.stock > 0 && options.warehouseId) {
        await this.recordInitialStock(row, variant.id, options.warehouseId);
      }
    }
  }

  /** Actualiza un artículo existente. El stock nunca se toca acá: se cambia
   * con un ajuste de stock, para que quede el movimiento. */
  private async updateExisting(row: PlanRow, refs: Refs, job: Job, photos: Map<PlanRow, Photo>): Promise<void> {
    const existing = refs.variantsBySku.get(row.sku.toLowerCase());
    if (!existing) throw new Error('el código ya no existe');
    const db = getTenantDb();
    const categoryId = await this.categoryId(row.category, refs, job);
    const supplierId = await this.supplierId(row.supplier, refs, job);
    await db.article.update({
      where: { id: existing.articleId },
      data: {
        name: row.name,
        ...(row.description !== null ? { description: row.description } : {}),
        ...(categoryId ? { categoryId } : {}),
        ...(row.taxId ? { taxDefinitionId: row.taxId } : {}),
        ...(supplierId ? { preferredSupplierId: supplierId } : {}),
      },
    });
    if (row.brand !== null || row.color !== null || row.size !== null) {
      await db.articleVariant.update({
        where: { id: existing.id },
        data: {
          ...(row.brand !== null ? { brand: row.brand } : {}),
          ...(row.color !== null ? { color: row.color } : {}),
          ...(row.size !== null ? { size: row.size } : {}),
        },
      });
    }
    if (row.price !== null && Math.abs(row.price - existing.unitPrice) >= 0.005) {
      await this.inventoryService.updateArticleVariantPrice(existing.id, row.price);
    }
    if (photos.has(row)) {
      // No pisa una foto cargada a mano.
      const article = await db.article.findUnique({ where: { id: existing.articleId }, select: { imageUrl: true } });
      if (!article?.imageUrl) await this.applyPhoto(existing.articleId, row, photos, job);
    }
  }

  /** Stock inicial. En barras: cada barra entra como pieza propia (para los
   * recortes de Producción) y el stock se lleva en milímetros con el costo
   * por milímetro, igual que GoodsReceiptsService al recibir una compra. */
  private async recordInitialStock(row: PlanRow, variantId: string, warehouseId: string): Promise<void> {
    const cost = row.cost ?? 0;
    if (row.measurementType === 'LINEAL_1D' && row.barLengthMm) {
      const bars = row.stock ?? 0;
      const costPerMm = cost / row.barLengthMm;
      await this.inventoryService.recordMovement({
        warehouseId,
        articleVariantId: variantId,
        type: 'PURCHASE_IN',
        quantity: bars * row.barLengthMm,
        unitCost: costPerMm,
        sourceType: 'IMPORT',
      });
      // Copia de StockPieceService.createFullStockPiece (@plexo/production):
      // un módulo no importa el Service de otro.
      const tenantId = getTenantId();
      for (let i = 0; i < bars; i++) {
        await getTenantDb().stockPiece.create({
          data: {
            tenantId,
            articleVariantId: variantId,
            warehouseId,
            originalLength: row.barLengthMm,
            currentLength: row.barLengthMm,
            status: 'AVAILABLE',
            sourceType: 'FULL_STOCK',
            unitCost: costPerMm,
          },
        });
      }
      return;
    }
    await this.inventoryService.recordMovement({
      warehouseId,
      articleVariantId: variantId,
      type: 'PURCHASE_IN',
      quantity: row.stock ?? 0,
      unitCost: cost,
      sourceType: 'IMPORT',
    });
  }

  private async applyPhoto(articleId: string, row: PlanRow | undefined, photos: Map<PlanRow, Photo>, job: Job): Promise<void> {
    const photo = row ? photos.get(row) : undefined;
    if (!row || !photo) return;
    try {
      await this.articleImageService.setImage(articleId, photo.mime, photo.buffer);
      job.status.photosSaved++;
    } catch (err) {
      this.photoFailed(row, (err as Error).message, job);
    }
  }

  /** Baja las fotos de una tanda, de a PHOTO_PARALLEL a la vez. Una foto que
   * falla queda anotada y el artículo se importa igual, sin foto. */
  private async downloadPhotos(rows: PlanRow[], job: Job): Promise<Map<PlanRow, Photo>> {
    const result = new Map<PlanRow, Photo>();
    const pending = rows.filter((r) => r.imageUrl);
    for (let i = 0; i < pending.length; i += PHOTO_PARALLEL) {
      await Promise.all(
        pending.slice(i, i + PHOTO_PARALLEL).map(async (row) => {
          try {
            result.set(row, await downloadImage(row.imageUrl!));
          } catch (err) {
            this.photoFailed(row, (err as Error).message, job);
          }
        }),
      );
    }
    return result;
  }

  private photoFailed(row: PlanRow, reason: string, job: Job): void {
    job.status.photosFailed++;
    job.errorRows.push({ ...row, messages: [`La foto no se pudo bajar (${reason}). El artículo se importó igual, sin foto.`] });
  }

  private async categoryId(name: string | null, refs: Refs, job: Job): Promise<string | null> {
    if (!name) return null;
    const key = name.toLowerCase();
    const found = refs.categoryIdByName.get(key);
    if (found) return found;
    const created = await this.inventoryService.createCategory({ name });
    refs.categoryIdByName.set(key, created.id);
    job.status.newCategories++;
    return created.id;
  }

  private async supplierId(name: string | null, refs: Refs, job: Job): Promise<string | null> {
    if (!name) return null;
    const key = name.toLowerCase();
    const found = refs.supplierIdByName.get(key);
    if (found) return found;
    const tenantId = getTenantId();
    const created = await getTenantDb().company.create({
      data: { tenantId, name, roles: { create: { tenantId, role: 'SUPPLIER' } } },
    });
    refs.supplierIdByName.set(key, created.id);
    job.status.newSuppliers++;
    return created.id;
  }

  private async load(importId: string): Promise<{ grid: Cell[][]; headerRow: number }> {
    if (!/^[0-9a-f-]{36}$/.test(importId)) throw new NotFoundException('No hay una importación con ese número');
    const dir = join(this.storageDir, getTenantId());
    let fileName: string;
    try {
      fileName = await readFile(join(dir, `${importId}.name`), 'utf8');
    } catch {
      throw new NotFoundException('El archivo ya no está disponible: volvé a subirlo');
    }
    const buffer = await readFile(join(dir, `${importId}${extensionOf(fileName)}`));
    const grid = await parseFile(fileName, buffer);
    return { grid, headerRow: detectHeaderRow(grid) };
  }

  private async loadRefs(): Promise<Refs> {
    const db = getTenantDb();
    const [variants, categories, suppliers, taxes] = await Promise.all([
      db.articleVariant.findMany({ select: { id: true, sku: true, articleId: true, unitPrice: true } }),
      db.category.findMany({ where: { parentId: null }, select: { id: true, name: true } }),
      db.company.findMany({ where: { roles: { some: { role: 'SUPPLIER' } } }, select: { id: true, name: true } }),
      db.taxDefinition.findMany({ where: { validTo: null }, select: { id: true, name: true, calculationType: true, rate: true } }),
    ]);
    return {
      variantsBySku: new Map(variants.map((v) => [v.sku.toLowerCase(), { id: v.id, articleId: v.articleId, unitPrice: Number(v.unitPrice) }])),
      categoryIdByName: new Map(categories.map((c) => [c.name.toLowerCase(), c.id])),
      supplierIdByName: new Map(suppliers.map((s) => [s.name.toLowerCase(), s.id])),
      taxes: taxes.map((t) => ({ id: t.id, name: t.name, calculationType: t.calculationType, rate: t.rate === null ? null : Number(t.rate) })),
    };
  }
}

// -----------------------------------------------------------------------------
// Funciones puras (exportadas para los tests)

const EXPORT_COLUMNS = [
  { header: 'Código', key: 'sku', width: 18 },
  { header: 'Nombre', key: 'name', width: 40 },
  { header: 'Precio de venta', key: 'price', width: 15 },
  { header: 'IVA', key: 'tax', width: 12 },
  { header: 'Categoría', key: 'category', width: 18 },
  { header: 'Marca', key: 'brand', width: 15 },
  { header: 'Unidad', key: 'unit', width: 10 },
  { header: 'Proveedor', key: 'supplier', width: 22 },
  { header: 'Color', key: 'color', width: 12 },
  { header: 'Talle', key: 'size', width: 10 },
  { header: 'Descripción larga', key: 'description', width: 40 },
];

const UNIT_EXPORT: Record<string, string> = { UNIT: 'UN', KG: 'KG', LTR: 'LT', MM: 'MM', M2: 'M2' };

function extensionOf(fileName: string): string {
  const match = /\.[a-z0-9]+$/i.exec(fileName);
  return match ? match[0].toLowerCase() : '';
}

export async function parseFile(fileName: string, buffer: Buffer): Promise<Cell[][]> {
  const ext = extensionOf(fileName);
  if (ext === '.xls') {
    throw new BadRequestException('Ese archivo es de Excel viejo (.xls). Abrilo en Excel y guardalo como .xlsx, o como CSV.');
  }
  let grid: Cell[][];
  if (ext === '.csv' || ext === '.txt') {
    grid = parseCsv(decodeText(buffer));
  } else if (ext === '.xlsx') {
    grid = await parseXlsx(buffer);
  } else {
    throw new BadRequestException('Subí un archivo de Excel (.xlsx) o CSV');
  }
  // Las filas vacías se dejan en su lugar: así los números de fila que ve el
  // usuario son los mismos que en su Excel.
  const filled = grid.filter((row) => !isBlank(row)).length;
  if (filled < 2) throw new BadRequestException('El archivo no tiene artículos');
  if (filled - 1 > MAX_ROWS) {
    throw new BadRequestException(`El archivo tiene más de ${MAX_ROWS.toLocaleString('es-AR')} filas: dividilo en partes`);
  }
  return grid;
}

async function parseXlsx(buffer: Buffer): Promise<Cell[][]> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  } catch {
    throw new BadRequestException('No se pudo leer el archivo de Excel. ¿Está dañado o protegido con contraseña?');
  }
  // La hoja con más filas: muchas exportaciones traen una carátula primero.
  const sheet = [...workbook.worksheets].sort((a, b) => b.actualRowCount - a.actualRowCount)[0];
  if (!sheet) throw new BadRequestException('El archivo no tiene hojas');
  const grid: Cell[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    while (grid.length < row.number - 1) grid.push([]);
    const values: Cell[] = [];
    for (let c = 1; c <= sheet.columnCount; c++) {
      const v = row.getCell(c).value;
      if (v === null || v === undefined) values.push(null);
      else if (typeof v === 'number' || typeof v === 'string' || v instanceof Date) values.push(v);
      else {
        const result = (v as { result?: unknown }).result;
        values.push(typeof result === 'number' ? result : cellText(v));
      }
    }
    grid.push(values);
  });
  return grid;
}

/** Excel en castellano guarda los CSV en Windows-1252, no en UTF-8. */
// Caracter de reemplazo (aparece al leer como UTF-8 algo que no lo es) y BOM.
const REPLACEMENT_CHAR = String.fromCharCode(0xfffd);
const BOM = String.fromCharCode(0xfeff);

function decodeText(buffer: Buffer): string {
  const utf8 = buffer.toString('utf8');
  if (utf8.includes(REPLACEMENT_CHAR)) return new TextDecoder('windows-1252').decode(buffer);
  return utf8.startsWith(BOM) ? utf8.slice(1) : utf8;
}

export function parseCsv(text: string): Cell[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = [';', ',', '\t'].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
  const rows: Cell[][] = [];
  let row: Cell[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(field.trim() || null);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field.trim() || null);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field || row.length) {
    row.push(field.trim() || null);
    rows.push(row);
  }
  return rows;
}

/** La fila de encabezados es, entre las primeras, la que más columnas
 * reconoce; si ninguna reconoce nada, la primera con texto. */
export function detectHeaderRow(grid: Cell[][]): number {
  let best = 0;
  let bestScore = 0;
  for (let i = 0; i < Math.min(HEADER_SCAN_ROWS, grid.length - 1); i++) {
    const score = suggestMapping(grid[i].map((c) => cellText(c))).filter((f) => f !== 'skip').length;
    if (score > bestScore) {
      best = i;
      bestScore = score;
    }
  }
  return best;
}

function isBlank(row: Cell[]): boolean {
  return row.every((c) => cellText(c) === '');
}

function describe(importId: string, fileName: string, grid: Cell[][]): ImportAnalysis {
  const headerRow = detectHeaderRow(grid);
  const headers = grid[headerRow].map((c, i) => cellText(c) || `Columna ${i + 1}`);
  const suggested = suggestMapping(headers);
  const body = grid.slice(headerRow + 1).filter((row) => !isBlank(row));
  return {
    importId,
    fileName,
    sheetName: '',
    headerRow: headerRow + 1,
    rowCount: body.length,
    columns: headers.map((header, index) => ({
      index,
      header,
      suggested: suggested[index],
      samples: body
        .map((row) => cellText(row[index]))
        .filter(Boolean)
        .slice(0, SAMPLE_VALUES),
    })),
  };
}

export function buildPlan(grid: Cell[][], headerRow: number, options: ImportOptions, refs: Refs) {
  const col = (field: ImportField) => options.mapping.indexOf(field);
  const text = (row: Cell[], field: ImportField) => {
    const i = col(field);
    return i < 0 ? null : cellText(row[i]) || null;
  };
  const number = (row: Cell[], field: ImportField) => {
    const i = col(field);
    return i < 0 ? null : parseNumber(row[i]);
  };

  const taxCounts = new Map<string, number>();
  const unitCounts = new Map<string, number>();
  const rows: PlanRow[] = [];
  const firstRowBySku = new Map<string, PlanRow>();
  const newCategories = new Set<string>();
  const suppliers = new Map<string, { name: string; exists: boolean }>();

  grid.slice(headerRow + 1).forEach((cells, offset) => {
    if (isBlank(cells)) return;
    const messages: string[] = [];
    const sku = text(cells, 'sku') ?? '';
    const name = text(cells, 'name') ?? '';
    if (!sku) messages.push('Falta el código');
    if (!name) messages.push('Falta el nombre');

    const unitRaw = text(cells, 'unit') ?? '';
    const unitKey = valueKey(unitRaw);
    if (col('unit') >= 0) unitCounts.set(unitKey, (unitCounts.get(unitKey) ?? 0) + 1);
    const unit = options.unitValues?.[unitKey] ?? guessUnit(unitRaw);
    if (!unit) messages.push(`Unidad "${unitRaw}" no reconocida: elegí a qué unidad corresponde`);

    const taxRaw = text(cells, 'tax') ?? '';
    const taxKey = valueKey(taxRaw);
    if (col('tax') >= 0 && taxKey) taxCounts.set(taxKey, (taxCounts.get(taxKey) ?? 0) + 1);
    const chosenTax = taxKey ? (options.taxValues?.[taxKey] ?? guessTax(taxRaw, refs.taxes)) : null;
    const taxId = chosenTax === NO_TAX ? null : chosenTax;
    if (taxKey && !chosenTax) messages.push(`IVA "${taxRaw}" no reconocido: elegí a qué impuesto corresponde`);

    const rawPrice = number(cells, 'price');
    let price = rawPrice;
    if (rawPrice === null) messages.push('Falta el precio de venta');
    else if (rawPrice <= 0) messages.push('El precio de venta tiene que ser mayor a 0');
    if (price !== null && options.pricesIncludeVat && taxId) {
      const rate = refs.taxes.find((t) => t.id === taxId);
      if (rate?.calculationType === 'PERCENTAGE' && rate.rate) price = Math.round((price / (1 + rate.rate / 100)) * 100) / 100;
    }

    let cost = number(cells, 'cost');
    let stock = number(cells, 'stock');
    const stockText = text(cells, 'stock');
    if (stockText && stock === null) messages.push(`Stock "${stockText}" no es un número`);

    // Barras y planchas (en milímetros, que es como las guarda Oplex).
    const lengthUnit = options.lengthUnit ?? 'm';
    const barLength = number(cells, 'barLength');
    const sheetWidth = number(cells, 'sheetWidth');
    const sheetLength = number(cells, 'sheetLength');
    let measurementType: PlanRow['measurementType'] = 'DISCRETE';
    let barLengthMm: number | null = null;
    let sheetWidthMm: number | null = null;
    let sheetLengthMm: number | null = null;
    if (barLength !== null && (sheetWidth !== null || sheetLength !== null)) {
      messages.push('Tiene largo de barra y medidas de plancha: es una cosa o la otra');
    } else if (barLength !== null) {
      if (barLength <= 0) messages.push('El largo de la barra tiene que ser mayor a 0');
      else {
        measurementType = 'LINEAL_1D';
        barLengthMm = toMillimeters(barLength, lengthUnit);
      }
    } else if (sheetWidth !== null || sheetLength !== null) {
      if (!sheetWidth || !sheetLength || sheetWidth <= 0 || sheetLength <= 0) {
        messages.push('Para una plancha hacen falta el ancho y el largo');
      } else {
        measurementType = 'SURFACE_2D';
        sheetWidthMm = toMillimeters(sheetWidth, lengthUnit);
        sheetLengthMm = toMillimeters(sheetLength, lengthUnit);
      }
    }
    if (measurementType === 'LINEAL_1D' && barLengthMm) {
      const meters = barLengthMm / 1000;
      if (options.perMeter) {
        if (price !== null) price = Math.round(price * meters * 100) / 100;
        if (cost !== null) cost = Math.round(cost * meters * 100) / 100;
        if (stock !== null) {
          const bars = stock / meters;
          if (Math.abs(bars - Math.round(bars)) > 0.001) {
            messages.push(`La existencia (${stock} m) no da barras enteras de ${meters.toLocaleString('es-AR')} m`);
          } else stock = Math.round(bars);
        }
      } else if (stock !== null && !Number.isInteger(stock)) {
        messages.push('La existencia de barras tiene que ser un número entero');
      }
    }

    const warnings: string[] = [];
    const photo = text(cells, 'imageUrl');
    const imageUrl = photo && /^https?:\/\//i.test(photo) ? directImageUrl(photo) : null;
    if (photo && !imageUrl) warnings.push('El link de la foto no empieza con http: se importa sin foto');

    const supplier = text(cells, 'supplier');
    const existing = sku ? refs.variantsBySku.get(sku.toLowerCase()) : undefined;
    const fileCategory = text(cells, 'category');
    const aiCategory = !fileCategory && !existing && sku ? (options.aiCategories?.[sku.toLowerCase()] ?? null) : null;
    const category = fileCategory ?? aiCategory;
    if (existing && measurementType !== 'DISCRETE') {
      warnings.push('Ya existe: el largo o las medidas no se cambian al actualizar');
    }

    const row: PlanRow = {
      rowNumber: headerRow + 2 + offset,
      status: 'new',
      messages,
      sku,
      name,
      category,
      categoryFromAi: aiCategory !== null,
      brand: text(cells, 'brand'),
      description: text(cells, 'description'),
      color: text(cells, 'color'),
      size: text(cells, 'size'),
      supplier,
      unit: unit ?? 'UNIT',
      taxId,
      price,
      oldPrice: existing ? existing.unitPrice : null,
      cost,
      stock,
      measurementType,
      barLengthMm,
      sheetWidthMm,
      sheetLengthMm,
      imageUrl,
      warnings,
    };

    if (sku) {
      const first = firstRowBySku.get(sku.toLowerCase());
      if (first) {
        messages.push(`Código repetido en el archivo (también en la fila ${first.rowNumber})`);
        if (!first.messages.some((m) => m.startsWith('Código repetido'))) {
          first.messages.push(`Código repetido en el archivo (también en la fila ${row.rowNumber})`);
          first.status = 'error';
        }
      } else firstRowBySku.set(sku.toLowerCase(), row);
    }

    if (!existing && stock !== null && stock > 0 && (cost === null || cost < 0)) {
      messages.push('Para cargar el stock inicial falta el costo');
    }

    if (messages.length > 0) row.status = 'error';
    else if (existing) row.status = options.onExisting === 'update' ? 'update' : 'skip';

    rows.push(row);
  });

  // Al final: una fila puede pasar a error después (código repetido más abajo).
  for (const row of rows) {
    if (row.status === 'error' || row.status === 'skip') continue;
    if (row.category && !refs.categoryIdByName.has(row.category.toLowerCase())) newCategories.add(row.category);
    if (row.supplier && !suppliers.has(row.supplier.toLowerCase())) {
      suppliers.set(row.supplier.toLowerCase(), { name: row.supplier, exists: refs.supplierIdByName.has(row.supplier.toLowerCase()) });
    }
  }

  const choices = (counts: Map<string, number>, resolve: (raw: string) => string | null): ValueChoice[] =>
    [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([raw, count]) => ({ raw, count, resolved: resolve(raw), resolvedLabel: null }));

  const lengthValues = grid
    .slice(headerRow + 1)
    .flatMap((cells) => (['barLength', 'sheetWidth', 'sheetLength'] as ImportField[]).map((f) => number(cells, f)))
    .filter((v): v is number => v !== null);

  return {
    rows,
    lengthUnitSuggested: lengthValues.length ? guessLengthUnit(lengthValues) : null,
    taxValues: choices(taxCounts, (raw) => options.taxValues?.[raw] ?? guessTax(raw, refs.taxes)),
    unitValues: choices(unitCounts, (raw) => options.unitValues?.[raw] ?? guessUnit(raw)),
    newCategories: [...new Map([...newCategories].map((c) => [c.toLowerCase(), c])).values()].sort(),
    newSuppliers: [...suppliers.values()].filter((s) => !s.exists).map((s) => s.name).sort(),
    existingSuppliers: [...suppliers.values()].filter((s) => s.exists).length,
  };
}

interface Photo {
  mime: string;
  buffer: Buffer;
}

/** Baja una foto de un link del archivo. Sólo http(s), sólo imágenes JPG,
 * PNG o WEBP de hasta 3MB, y nunca de direcciones internas (la API no
 * puede usarse para pedir cosas a la red privada del servidor). */
export async function downloadImage(rawUrl: string): Promise<Photo> {
  let current = rawUrl;
  for (let hop = 0; hop < 4; hop++) {
    const url = new URL(current);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('el link no es http');
    await assertPublicHost(url.hostname);
    const res = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(PHOTO_TIMEOUT_MS),
      // Varios servidores de imágenes rechazan pedidos sin User-Agent.
      headers: { 'user-agent': 'Oplex/1.0 (importador de articulos)' },
    });
    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) {
      current = new URL(location, url).toString();
      continue;
    }
    if (!res.ok) throw new Error(`el link respondió ${res.status}`);
    const mime = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (!PHOTO_TYPES.includes(mime)) throw new Error('no es una imagen JPG, PNG o WEBP');
    if (Number(res.headers.get('content-length') ?? 0) > PHOTO_MAX_BYTES) throw new Error('pesa más de 3MB');
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length > PHOTO_MAX_BYTES) throw new Error('pesa más de 3MB');
    return { mime, buffer };
  }
  throw new Error('demasiadas redirecciones');
}

async function assertPublicHost(hostname: string): Promise<void> {
  const host = hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) throw new Error('dirección interna');
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address);
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) throw new Error('dirección interna');
}

export function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 6) {
    const a = address.toLowerCase();
    if (a === '::1' || a === '::') return true;
    if (a.startsWith('::ffff:')) return isPrivateAddress(a.slice(7));
    return /^(fc|fd|fe8|fe9|fea|feb)/.test(a);
  }
  const [a, b] = address.split('.').map(Number);
  return (
    a === 10 || a === 127 || a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
}
