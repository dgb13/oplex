import { BadRequestException, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  getTenantDb,
  getTenantId,
  getUserId,
  Prisma,
  ProductionStatus,
  ReservationStatus,
  type Article,
  type Category,
  type MinimumStock,
  type TaxDefinition,
  type TaxLineKind,
  type Warehouse,
} from '@plexo/database';
import { buildVariantLabel } from '@plexo/types';
import type { CreateArticleDto } from './dto/create-article.dto.js';
import type { UpdateArticleDto } from './dto/update-article.dto.js';
import type { CreateArticleVariantDto } from './dto/create-article-variant.dto.js';
import type { CreateCategoryDto } from './dto/create-category.dto.js';
import type { CreateWarehouseDto } from './dto/create-warehouse.dto.js';
import type { RecordStockMovementDto } from './dto/record-stock-movement.dto.js';
import type { SetMinimumStockDto } from './dto/set-minimum-stock.dto.js';
import { computeStockDelta } from './stock-movement.domain.js';
import { getReservedQuantity } from './stock-availability.domain.js';

export interface ReorderSuggestion {
  warehouseId: string;
  warehouseName: string;
  articleVariantId: string;
  sku: string;
  articleName: string;
  variantLabel: string | null;
  imageUrl: string | null;
  preferredSupplierId: string | null;
  preferredSupplierName: string | null;
  minimumQuantity: number;
  currentQuantity: number;
  suggestedQuantity: number;
  autoReplenish: boolean;
}

export interface CategoryStockValue {
  categoryId: string | null;
  categoryName: string;
  totalValue: Prisma.Decimal;
}

export interface WarehouseStockRow {
  warehouseId: string;
  warehouseName: string;
  quantity: number;
}

export interface ArticleVariantListItem {
  id: string;
  sku: string;
  color: string | null;
  size: string | null;
  brand: string | null;
  attributes: Record<string, string> | null;
  unitPrice: number;
  totalStock: number;
  // Sum of MinimumStock.minimumQuantity across warehouses for this variant
  // (minimums are set per warehouse, same as stock itself) - null if none
  // configured anywhere, same convention as totalStock aggregating actual
  // stock across warehouses.
  minimumStock: number | null;
  stockByWarehouse: WarehouseStockRow[];
  // Sólo tiene sentido cuando el Article dueño es LINEAL_1D - desglose
  // EXACTO (sale de contar StockPiece reales, no de una cuenta) de cuánto
  // de totalStock son barras/rollos sin cortar vs recortes reutilizables.
  // Mismo criterio sourceType que ya usa /production/pieces ("Compra" vs
  // "Recorte") - 0/0 en cualquier otro measurementType, o en un 1D que
  // todavía no recibió ninguna compra.
  wholePiecesCount: number;
  offcutsCount: number;
}

// All optional/additive - the original zero-param listArticles() call
// (still used by the plain table view) keeps working unchanged. Added for
// the catalog grid (see @plexo/inventory-cart's browsing UI), which needs
// server-side search/category filtering instead of pulling every article
// and filtering client-side.
export interface ArticleListFilters {
  search?: string;
  categoryId?: string;
  isPublished?: boolean;
  // Artículos desactivados (Article.active=false, ver
  // InventoryService.updateArticle) quedan afuera por defecto - mismo
  // criterio que CompaniesService.listCompanies/includeInactive.
  includeInactive?: boolean;
}

export interface ArticleListItem {
  id: string;
  name: string;
  description: string | null;
  unitOfMeasure: string;
  categoryId: string | null;
  categoryName: string | null;
  isService: boolean;
  isPublished: boolean;
  active: boolean;
  imageUrl: string | null;
  preferredSupplierId: string | null;
  preferredSupplierName: string | null;
  markupPercent: number | null;
  brochureUrl: string | null;
  attachmentZipUrl: string | null;
  hasVariants: boolean;
  // true = este artículo tiene (o tuvo alguna vez) una receta (BOM) propia -
  // ver el comentario del campo en schema.prisma. BomService.create() lo
  // fija en true solo, y ArticleFormModal deja tildarlo a mano para poder
  // elegir un producto como "Producto a fabricar" en Recetas ANTES de
  // cargarle su primera receta (si no, ese selector nunca tendría nada para
  // ofrecer la primera vez). Usado por ArticlePicker en modo `filter` para
  // no mezclar insumos con productos terminados en ese selector.
  isManufactured: boolean;
  // Discriminador de medida/consumo de stock + su "medida comercial" (ver el
  // comentario de measurementType en schema.prisma) - null en los campos
  // que no le corresponden al tipo elegido. InventoryService.listArticles
  // es el único lugar que los completa hoy (no hay UPDATE todavía, ver
  // UpdateArticleDto - measurementType queda fijo una vez creado el
  // artículo, cambiarlo con stock/piezas/BOM ya cargados rompería su
  // interpretación).
  measurementType: string;
  purchaseSize: number | null;
  baseUnit: string | null;
  commercialLength: number | null;
  minUsableLength: number | null;
  sheetWidth: number | null;
  sheetLength: number | null;
  // Alícuota por defecto del artículo (Article.taxDefinition) - lo que
  // Facturación/Cotizaciones usan como default de línea al elegir este
  // artículo en ArticlePicker, antes de cualquier override manual. null de
  // rate sólo puede pasar si taxKind es EXENTO/NO_GRAVADO (sin tasa) o si
  // el artículo no tiene ningún impuesto asignado (se resuelve GRAVADO 0%
  // downstream, mismo criterio que InvoicingService.resolveLineTax).
  taxRate: number | null;
  taxKind: TaxLineKind;
  variants: ArticleVariantListItem[];
}

export interface PriceHistoryEntry {
  id: string;
  unitPrice: Prisma.Decimal;
  costPrice: Prisma.Decimal | null;
  effectiveAt: Date;
  changedById: string | null;
  purchaseOrderId: string | null;
  purchaseOrderNumber: string | null;
}

@Injectable()
export class InventoryService {
  constructor(private readonly eventEmitter: EventEmitter2) {}

  createWarehouse(dto: CreateWarehouseDto): Promise<Warehouse> {
    return getTenantDb().warehouse.create({
      data: { tenantId: getTenantId(), name: dto.name, location: dto.location },
    });
  }

  listWarehouses(): Promise<Warehouse[]> {
    return getTenantDb().warehouse.findMany({ orderBy: { name: 'asc' } });
  }

  createCategory(dto: CreateCategoryDto): Promise<Category> {
    return getTenantDb().category.create({
      data: { tenantId: getTenantId(), name: dto.name, parentId: dto.parentId },
    });
  }

  listCategories(): Promise<Category[]> {
    return getTenantDb().category.findMany({ orderBy: { name: 'asc' } });
  }

  createArticle(dto: CreateArticleDto): Promise<Article> {
    return getTenantDb().article.create({
      data: {
        tenantId: getTenantId(),
        name: dto.name,
        description: dto.description,
        unitOfMeasure: dto.unitOfMeasure,
        categoryId: dto.categoryId,
        taxDefinitionId: dto.taxDefinitionId,
        isService: dto.isService,
        isPublished: dto.isPublished,
        hasVariants: dto.hasVariants,
        isManufactured: dto.isManufactured,
        measurementType: dto.measurementType,
        purchaseSize: dto.purchaseSize,
        baseUnit: dto.baseUnit,
        commercialLength: dto.commercialLength,
        minUsableLength: dto.minUsableLength,
        sheetWidth: dto.sheetWidth,
        sheetLength: dto.sheetLength,
      },
    });
  }

  async updateArticle(id: string, dto: UpdateArticleDto): Promise<Article> {
    const db = getTenantDb();
    // undefined (field omitted) leaves preferredSupplierId untouched;
    // explicit null clears it; a real id must resolve to an active
    // SUPPLIER company - same validation QuoteRequestService/
    // PurchaseOrderService apply when a document picks a supplier.
    if (dto.preferredSupplierId) {
      const supplier = await db.company.findUnique({
        where: { id: dto.preferredSupplierId },
        include: { roles: true },
      });
      if (!supplier) {
        throw new BadRequestException('Supplier not found');
      }
      if (!supplier.active) {
        throw new BadRequestException('This supplier is inactive');
      }
      if (!supplier.roles.some((r) => r.role === 'SUPPLIER')) {
        throw new BadRequestException('This company is not flagged as a supplier');
      }
    }

    // "Eliminar" = active:false. Bloqueado si alguna variante está en
    // producción: es el output de una orden abierta (DRAFT/PLANNED/
    // IN_PROGRESS - todavía necesita este artículo para terminar), o tiene
    // una StockReservation ACTIVE (insumo ya reservado por una orden en
    // curso). No se valida nada al reactivar (active:true).
    if (dto.active === false) {
      const [openOutputOrder, activeReservation] = await Promise.all([
        db.productionOrder.findFirst({
          where: {
            outputArticleVariant: { articleId: id },
            status: { in: [ProductionStatus.DRAFT, ProductionStatus.PLANNED, ProductionStatus.IN_PROGRESS] },
          },
        }),
        db.stockReservation.findFirst({
          where: {
            articleVariant: { articleId: id },
            status: ReservationStatus.ACTIVE,
          },
        }),
      ]);
      if (openOutputOrder) {
        throw new BadRequestException('No se puede desactivar: es el producto de una orden de producción en curso');
      }
      if (activeReservation) {
        throw new BadRequestException('No se puede desactivar: está reservado como insumo de una orden de producción en curso');
      }
    }

    return db.article.update({
      where: { id },
      data: {
        name: dto.name,
        categoryId: dto.categoryId,
        unitOfMeasure: dto.unitOfMeasure,
        isService: dto.isService,
        isPublished: dto.isPublished,
        isManufactured: dto.isManufactured,
        preferredSupplierId: dto.preferredSupplierId,
        markupPercent: dto.markupPercent,
        description: dto.description,
        active: dto.active,
      },
    });
  }

  async listArticles(filters?: ArticleListFilters): Promise<ArticleListItem[]> {
    const articles = await getTenantDb().article.findMany({
      where: {
        name: filters?.search ? { contains: filters.search, mode: 'insensitive' } : undefined,
        categoryId: filters?.categoryId,
        isPublished: filters?.isPublished,
        active: filters?.includeInactive ? undefined : true,
      },
      include: {
        category: true,
        preferredSupplier: { select: { id: true, name: true } },
        taxDefinition: true,
        variants: {
          include: {
            stockLedger: { include: { warehouse: true } },
            minimumStocks: true,
            // Liviano a propósito (sólo sourceType, sin largo/depósito) -
            // acá sólo hace falta contar, el detalle completo por pieza ya
            // lo sirve GET /production/pieces.
            stockPieces: { where: { status: 'AVAILABLE' }, select: { sourceType: true } },
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    return articles.map((article) => {
      const { rate: taxRate, kind: taxKind } = resolveArticleTax(article.taxDefinition);
      return {
        id: article.id,
        name: article.name,
        description: article.description,
        unitOfMeasure: article.unitOfMeasure,
        categoryId: article.categoryId,
        categoryName: article.category?.name ?? null,
        isService: article.isService,
        isPublished: article.isPublished,
        active: article.active,
        imageUrl: article.imageUrl,
        preferredSupplierId: article.preferredSupplierId,
        preferredSupplierName: article.preferredSupplier?.name ?? null,
        markupPercent: article.markupPercent?.toNumber() ?? null,
        brochureUrl: article.brochureUrl,
        attachmentZipUrl: article.attachmentZipUrl,
        hasVariants: article.hasVariants,
        isManufactured: article.isManufactured,
        measurementType: article.measurementType,
        purchaseSize: article.purchaseSize?.toNumber() ?? null,
        baseUnit: article.baseUnit,
        commercialLength: article.commercialLength?.toNumber() ?? null,
        minUsableLength: article.minUsableLength?.toNumber() ?? null,
        sheetWidth: article.sheetWidth?.toNumber() ?? null,
        sheetLength: article.sheetLength?.toNumber() ?? null,
        taxRate,
        taxKind,
        variants: article.variants.map((variant) => {
        const stockByWarehouse: WarehouseStockRow[] = variant.stockLedger.map((sl) => ({
          warehouseId: sl.warehouseId,
          warehouseName: sl.warehouse.name,
          quantity: sl.quantity.toNumber(),
        }));
        return {
          id: variant.id,
          sku: variant.sku,
          color: variant.color,
          size: variant.size,
          brand: variant.brand,
          attributes: (variant.attributes as Record<string, string> | null) ?? null,
          unitPrice: variant.unitPrice.toNumber(),
          totalStock: stockByWarehouse.reduce((sum, row) => sum + row.quantity, 0),
          minimumStock:
            variant.minimumStocks.length === 0
              ? null
              : variant.minimumStocks.reduce((sum, ms) => sum + ms.minimumQuantity.toNumber(), 0),
          stockByWarehouse,
          wholePiecesCount: variant.stockPieces.filter((p) => p.sourceType === 'FULL_STOCK').length,
          offcutsCount: variant.stockPieces.filter((p) => p.sourceType === 'OFFCUT').length,
        };
      }),
      };
    });
  }

  async createArticleVariant(dto: CreateArticleVariantDto) {
    if (dto.attributes && Object.values(dto.attributes).some((v) => typeof v !== 'string' || v.trim() === '')) {
      throw new BadRequestException('attributes debe ser un objeto de texto a texto, sin valores vacíos');
    }

    const db = getTenantDb();
    const tenantId = getTenantId();

    // SKU es único por tenant (no por artículo, ver @@unique en el schema)
    // - chequeado acá para un 400 legible en el caso común (típicamente el
    // creador de atributos/matriz de ArticleFormModal, con SKU sugerido
    // editable que puede pisar uno ya existente de otro artículo) en vez
    // de un P2002 crudo/500. El @@unique sigue siendo el backstop real
    // contra una carrera concurrente genuina.
    const existing = await db.articleVariant.findFirst({ where: { sku: dto.sku }, select: { id: true } });
    if (existing) {
      throw new BadRequestException(`Ya existe una variante con el SKU "${dto.sku}"`);
    }

    const variant = await db.articleVariant.create({
      data: {
        tenantId,
        articleId: dto.articleId,
        sku: dto.sku,
        color: dto.color,
        size: dto.size,
        brand: dto.brand,
        attributes: dto.attributes ?? undefined,
        unitPrice: dto.unitPrice,
      },
    });

    await db.priceHistory.create({
      data: {
        tenantId,
        articleVariantId: variant.id,
        unitPrice: dto.unitPrice,
        costPrice: dto.costPrice,
        changedById: getUserId(),
      },
    });

    return variant;
  }

  async updateArticleVariantPrice(articleVariantId: string, unitPrice: number) {
    const db = getTenantDb();
    const tenantId = getTenantId();

    const variant = await db.articleVariant.update({
      where: { id: articleVariantId },
      data: { unitPrice },
    });

    await db.priceHistory.create({
      data: { tenantId, articleVariantId, unitPrice, changedById: getUserId() },
    });

    return variant;
  }

  /** Newest first - selling-price changes (no purchaseOrder) interleaved
   * with purchase costs (see recordMovement), same timeline. */
  async getPriceHistory(articleVariantId: string): Promise<PriceHistoryEntry[]> {
    const rows = await getTenantDb().priceHistory.findMany({
      where: { articleVariantId },
      include: { purchaseOrder: { select: { number: true } } },
      orderBy: { effectiveAt: 'desc' },
    });
    return rows.map((row) => ({
      id: row.id,
      unitPrice: row.unitPrice,
      costPrice: row.costPrice,
      effectiveAt: row.effectiveAt,
      changedById: row.changedById,
      purchaseOrderId: row.purchaseOrderId,
      purchaseOrderNumber: row.purchaseOrder?.number ?? null,
    }));
  }

  setMinimumStock(dto: SetMinimumStockDto): Promise<MinimumStock> {
    return getTenantDb().minimumStock.upsert({
      where: {
        warehouseId_articleVariantId: {
          warehouseId: dto.warehouseId,
          articleVariantId: dto.articleVariantId,
        },
      },
      create: {
        tenantId: getTenantId(),
        warehouseId: dto.warehouseId,
        articleVariantId: dto.articleVariantId,
        minimumQuantity: dto.minimumQuantity,
        autoReplenish: dto.autoReplenish ?? false,
      },
      // autoReplenish omitido en el dto no toca el valor existente - deja
      // ajustar sólo la cantidad mínima sin tener que repetir el flag.
      update: {
        minimumQuantity: dto.minimumQuantity,
        ...(dto.autoReplenish !== undefined ? { autoReplenish: dto.autoReplenish } : {}),
      },
    });
  }

  /**
   * Records one stock movement and updates StockLedger atomically. Both
   * writes land in the same DB transaction that TenantContextInterceptor
   * already opened for this request (getTenantDb() returns that tx client),
   * so there's no separate $transaction() call here - nesting one wouldn't
   * even be possible against a client that's already a transaction.
   *
   * The insufficient-stock check is race-free under concurrent requests
   * because it's not a read-then-write: `updateMany` with `quantity: {gte}`
   * in its WHERE clause is a single atomic
   * `UPDATE ... WHERE quantity >= $1` - if two concurrent sales race for
   * the last units, only one UPDATE matches a row, the other gets count=0
   * and fails cleanly instead of double-decrementing past zero.
   *
   * Deliberately does NOT post anything to the ledger (accounting) itself.
   * Since the weighted-average cost feature, this module does track unit
   * cost (StockLedger.avgUnitCost, StockMovement.unitCost) - but never sale
   * price/revenue, and never posts a journal entry on its own. A SALE_OUT
   * recorded here without going through SalesService (apps/api, which
   * composes Invoicing + Inventory + Accounting, reading back
   * movement.unitCost to post COGS) has no invoiceId and no revenue side -
   * there's nothing correct to auto-post from. Any stock movement that
   * represents real revenue but didn't go through an invoice (informal
   * sale, manual adjustment standing in for one, etc.) needs its journal
   * entry posted by hand via POST /accounting/journal-entries. Revisit if
   * this turns out to be a common enough flow to deserve its own
   * quantity+price DTO and an auto-posting path like invoices get.
   */
  async recordMovement(dto: RecordStockMovementDto) {
    if (dto.type === 'ADJUSTMENT') {
      if (dto.quantity === 0) {
        throw new BadRequestException('ADJUSTMENT quantity must not be zero');
      }
    } else if (dto.quantity <= 0) {
      throw new BadRequestException(`${dto.type} quantity must be a positive number`);
    }
    if ((dto.type === 'PURCHASE_IN' || dto.type === 'PRODUCTION_IN') && dto.unitCost == null) {
      throw new BadRequestException(`${dto.type} requires unitCost`);
    }

    const db = getTenantDb();
    const tenantId = getTenantId();
    const delta = computeStockDelta(dto.type, dto.quantity);

    // Referencing a real Orden de Compra is only meaningful for an actual
    // purchase, and only for one that already has a line for this exact
    // article variant - otherwise "this movement came from that order"
    // would be a made-up link nobody could trust later.
    if (dto.purchaseOrderId) {
      if (dto.type !== 'PURCHASE_IN') {
        throw new BadRequestException('purchaseOrderId is only valid for PURCHASE_IN movements');
      }
      const purchaseOrder = await db.purchaseOrder.findUnique({
        where: { id: dto.purchaseOrderId },
        include: { lines: { select: { articleVariantId: true } } },
      });
      if (!purchaseOrder) {
        throw new BadRequestException('Purchase order not found');
      }
      if (purchaseOrder.status === 'CANCELLED') {
        throw new BadRequestException('This purchase order is cancelled');
      }
      if (!purchaseOrder.lines.some((line) => line.articleVariantId === dto.articleVariantId)) {
        throw new BadRequestException('This purchase order has no line for that article variant');
      }
    }

    // Weighted-average cost (PPP) tracking: ADJUSTMENT never touches cost -
    // it's a quantity-only correction, same precedent as the informal-sale
    // note below (only SalesService-driven flows auto-post to accounting).
    // Every other type reads the current ledger row first, since both
    // branches below need it (prior average for inbound, current average
    // to stamp on outbound) and neither existing branch used to read
    // before writing.
    let priorLedger: { quantity: Prisma.Decimal; avgUnitCost: Prisma.Decimal | null } | null =
      null;
    if (dto.type !== 'ADJUSTMENT') {
      // Lock the ledger row before reading it: two concurrent costed
      // movements against the same (warehouse, variant) otherwise both read
      // the same stale avgUnitCost, compute their own new average in
      // parallel, and the second write clobbers the first's contribution
      // (quantity still ends up right, via the atomic increment below, but
      // the averaged cost silently drops one of the two movements). Same
      // "lock first, in requested order" recipe already used by
      // InvoicingService.createCreditNote and GoodsReceiptService.create for
      // the analogous race. No-op if the row doesn't exist yet - nothing to
      // lock on a brand-new (warehouse, variant) pair, see the upsert below.
      await db.$queryRaw`
        SELECT id FROM stock_ledger
        WHERE "warehouseId" = ${dto.warehouseId} AND "articleVariantId" = ${dto.articleVariantId}
        FOR UPDATE
      `;
      priorLedger = await db.stockLedger.findUnique({
        where: {
          warehouseId_articleVariantId: {
            warehouseId: dto.warehouseId,
            articleVariantId: dto.articleVariantId,
          },
        },
        select: { quantity: true, avgUnitCost: true },
      });
    }

    let stampedUnitCost: Prisma.Decimal | null = null;

    if (delta < 0) {
      if (dto.type === 'SALE_OUT' || dto.type === 'PRODUCTION_OUT' || dto.type === 'SUPPLIER_RETURN') {
        // Outbound never changes the average - it just consumes at
        // whatever it currently is, and that's what gets stamped on the
        // movement (SalesService reads it back for COGS; a SUPPLIER_RETURN
        // just keeps a record of what those units were valued at).
        stampedUnitCost = priorLedger?.avgUnitCost ?? null;
      }

      // "Disponible = físico - reservado" (ver
      // docs/OPLEX-Produccion-Plan-Tecnico-14-9.md, Fase 2/4): cualquier
      // salida de stock que no sea un ADJUSTMENT manual (un ajuste es una
      // corrección de la realidad física, no debe verse bloqueado por una
      // reserva de producción) respeta lo que otra orden ya tiene
      // comprometido, no sólo el total físico. Sumado bajo el mismo lock que
      // ya tomamos arriba sobre esta fila de StockLedger - por eso es seguro
      // contra otro recordMovement concurrente, pero SÓLO si quien crea o
      // libera una reserva (ProductionOrderService, @plexo/production) toma
      // ese mismo lock antes de tocar stock_reservations (ver el contrato de
      // concurrencia documentado en el modelo StockReservation).
      // getReservedQuantity es el mismo helper que usa
      // ProductionPlanningService.computeProducible - nunca pueden divergir
      // en qué cuenta como "reservado".
      if (dto.type !== 'ADJUSTMENT') {
        const reserved = await getReservedQuantity(db, {
          warehouseId: dto.warehouseId,
          articleVariantId: dto.articleVariantId,
          excludeReservationId: dto.excludeReservationId,
        });
        const available = (priorLedger?.quantity ?? new Prisma.Decimal(0)).sub(reserved);
        if (available.lt(-delta)) {
          throw new BadRequestException(
            'Insufficient available stock in this warehouse (some is reserved for production)',
          );
        }
      }

      const decremented = await db.stockLedger.updateMany({
        where: {
          warehouseId: dto.warehouseId,
          articleVariantId: dto.articleVariantId,
          quantity: { gte: -delta },
        },
        data: { quantity: { increment: delta } },
      });
      if (decremented.count === 0) {
        throw new BadRequestException('Insufficient stock in this warehouse');
      }
    } else {
      let newAvgUnitCost: Prisma.Decimal | undefined;
      // RETURN carries a cost only when the caller knows it (SalesService's
      // voidSale, reversing a costed SALE_OUT) - a manually-posted RETURN
      // without one just stays quantity-only, same as before this feature.
      const isCostedInbound =
        dto.type === 'PURCHASE_IN' || dto.type === 'PRODUCTION_IN' || dto.type === 'RETURN';
      if (isCostedInbound && dto.unitCost != null) {
        const incomingCost = new Prisma.Decimal(dto.unitCost);
        const priorQty = priorLedger?.quantity ?? new Prisma.Decimal(0);
        const priorAvg = priorLedger?.avgUnitCost ?? null;
        newAvgUnitCost =
          priorAvg === null || priorQty.lte(0)
            ? incomingCost
            : priorQty
                .mul(priorAvg)
                .add(new Prisma.Decimal(delta).mul(incomingCost))
                .div(priorQty.add(delta));
        stampedUnitCost = incomingCost;
      }

      await db.stockLedger.upsert({
        where: {
          warehouseId_articleVariantId: {
            warehouseId: dto.warehouseId,
            articleVariantId: dto.articleVariantId,
          },
        },
        create: {
          tenantId,
          warehouseId: dto.warehouseId,
          articleVariantId: dto.articleVariantId,
          quantity: delta,
          avgUnitCost: newAvgUnitCost,
        },
        update: {
          quantity: { increment: delta },
          ...(newAvgUnitCost !== undefined ? { avgUnitCost: newAvgUnitCost } : {}),
        },
      });
    }

    const movement = await db.stockMovement.create({
      data: {
        tenantId,
        warehouseId: dto.warehouseId,
        articleVariantId: dto.articleVariantId,
        type: dto.type,
        quantity: dto.quantity,
        unitCost: stampedUnitCost,
        // A referenced purchase order is the authoritative source - it
        // overrides whatever loose sourceType/sourceId the caller sent,
        // rather than risking the two disagreeing.
        sourceType: dto.purchaseOrderId ? 'PURCHASE_ORDER' : dto.sourceType,
        sourceId: dto.purchaseOrderId ?? dto.sourceId,
        invoiceId: dto.invoiceId,
        invoiceLineId: dto.invoiceLineId,
        goodsReceiptLineId: dto.goodsReceiptLineId,
      },
    });

    // Cost history: every costed inbound movement (Compra o Producción)
    // gets a PriceHistory row, not just selling-price changes - this was
    // dead code before (costPrice was declared on the model but never
    // written anywhere). Each row snapshots BOTH the variant's current
    // selling price and this movement's cost, so a single timeline answers
    // "what did this sell for and cost at that point in time" - not two
    // disjoint kinds of rows. purchaseOrderId is null when the movement
    // wasn't linked to one (e.g. entered manually without a document).
    if ((dto.type === 'PURCHASE_IN' || dto.type === 'PRODUCTION_IN') && dto.unitCost != null) {
      const variant = await db.articleVariant.findUniqueOrThrow({
        where: { id: dto.articleVariantId },
        select: { unitPrice: true },
      });
      await db.priceHistory.create({
        data: {
          tenantId,
          articleVariantId: dto.articleVariantId,
          unitPrice: variant.unitPrice,
          costPrice: dto.unitCost,
          changedById: getUserId(),
          purchaseOrderId: dto.purchaseOrderId ?? null,
        },
      });
    }

    const ledger = await db.stockLedger.findUnique({
      where: {
        warehouseId_articleVariantId: {
          warehouseId: dto.warehouseId,
          articleVariantId: dto.articleVariantId,
        },
      },
      select: { quantity: true },
    });
    this.eventEmitter.emit('stock.updated', {
      tenantId,
      warehouseId: dto.warehouseId,
      articleVariantId: dto.articleVariantId,
      newQuantity: (ledger?.quantity ?? new Prisma.Decimal(0)).toString(),
    });

    return movement;
  }

  /** Sum of a variant's stock across every warehouse. Computed on read from
   * StockLedger, never cached/denormalized - a stored total would drift
   * from the ledger the moment anyone forgets to update it alongside a
   * movement. */
  async getConsolidatedStock(articleVariantId: string): Promise<Prisma.Decimal> {
    const result = await getTenantDb().stockLedger.aggregate({
      where: { articleVariantId },
      _sum: { quantity: true },
    });
    return result._sum.quantity ?? new Prisma.Decimal(0);
  }

  async listReorderSuggestions(): Promise<ReorderSuggestion[]> {
    const db = getTenantDb();
    const minimums = await db.minimumStock.findMany({
      include: {
        warehouse: { select: { name: true } },
        articleVariant: {
          include: {
            article: {
              select: {
                name: true,
                imageUrl: true,
                preferredSupplierId: true,
                preferredSupplier: { select: { name: true } },
              },
            },
          },
        },
      },
    });
    if (minimums.length === 0) {
      return [];
    }

    const ledgerRows = await db.stockLedger.findMany({
      where: {
        OR: minimums.map((m) => ({
          warehouseId: m.warehouseId,
          articleVariantId: m.articleVariantId,
        })),
      },
      select: { warehouseId: true, articleVariantId: true, quantity: true },
    });
    const ledgerByKey = new Map(
      ledgerRows.map((row) => [`${row.warehouseId}:${row.articleVariantId}`, row.quantity.toNumber()]),
    );

    return minimums
      .map((minimum) => {
        const minimumQuantity = minimum.minimumQuantity.toNumber();
        const currentQuantity =
          ledgerByKey.get(`${minimum.warehouseId}:${minimum.articleVariantId}`) ?? 0;
        const { articleVariant } = minimum;
        return {
          warehouseId: minimum.warehouseId,
          warehouseName: minimum.warehouse.name,
          articleVariantId: minimum.articleVariantId,
          sku: articleVariant.sku,
          articleName: articleVariant.article.name,
          variantLabel: buildVariantLabel(articleVariant),
          imageUrl: articleVariant.article.imageUrl,
          preferredSupplierId: articleVariant.article.preferredSupplierId,
          preferredSupplierName: articleVariant.article.preferredSupplier?.name ?? null,
          minimumQuantity,
          currentQuantity,
          suggestedQuantity: minimumQuantity - currentQuantity,
          autoReplenish: minimum.autoReplenish,
        };
      })
      .filter((row) => row.currentQuantity < row.minimumQuantity);
  }

  // Snapshot actual (no histórico - StockLedger sólo guarda el saldo
  // corriente, ver PriceHistory para lo que sí tiene fecha). Una fila sin
  // avgUnitCost todavía (nunca tuvo un ingreso costeado, ver el comentario
  // del propio campo) no aporta valor - no es lo mismo que $0, es "todavía
  // no lo sabemos", así que se excluye en vez de sumar como cero.
  async getStockValueByCategory(): Promise<CategoryStockValue[]> {
    const db = getTenantDb();
    const rows = await db.stockLedger.findMany({
      where: { quantity: { gt: 0 }, avgUnitCost: { not: null } },
      select: {
        quantity: true,
        avgUnitCost: true,
        articleVariant: { select: { article: { select: { categoryId: true, category: { select: { name: true } } } } } },
      },
    });

    const byCategory = new Map<string, CategoryStockValue>();
    for (const row of rows) {
      const { categoryId, category } = row.articleVariant.article;
      const key = categoryId ?? '__none__';
      const existing = byCategory.get(key) ?? {
        categoryId,
        categoryName: category?.name ?? 'Sin categoría',
        totalValue: new Prisma.Decimal(0),
      };
      existing.totalValue = existing.totalValue.add(row.quantity.mul(row.avgUnitCost as Prisma.Decimal));
      byCategory.set(key, existing);
    }

    return [...byCategory.values()].sort((a, b) => b.totalValue.cmp(a.totalValue));
  }
}

/** Mismo mapeo TaxCalculationType->(rate,kind) que
 * InvoicingService.resolveLineTax/QuoteService.resolveLineTax, duplicado a
 * propósito acá (un lib module nunca importa el Service de otro módulo) -
 * sólo para que ArticlePicker pueda mostrar/arrastrar la alícuota por
 * defecto sin que el frontend tenga que reimplementar esta lógica. FORMULA/
 * FIXED_AMOUNT no lanzan acá (a diferencia de Facturación) porque esto es
 * sólo un valor informativo de catálogo, no un cálculo de comprobante -
 * caen en GRAVADO 0% en vez de romper el listado de artículos. */
function resolveArticleTax(taxDefinition: TaxDefinition | null): { rate: number | null; kind: TaxLineKind } {
  if (!taxDefinition) {
    return { rate: 0, kind: 'GRAVADO' };
  }
  if (taxDefinition.calculationType === 'EXENTO') {
    return { rate: null, kind: 'EXENTO' };
  }
  if (taxDefinition.calculationType === 'NO_GRAVADO') {
    return { rate: null, kind: 'NO_GRAVADO' };
  }
  if (taxDefinition.calculationType === 'PERCENTAGE') {
    return { rate: taxDefinition.rate?.toNumber() ?? 0, kind: 'GRAVADO' };
  }
  return { rate: 0, kind: 'GRAVADO' };
}
