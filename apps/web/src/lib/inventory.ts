import { api } from '@/lib/api';

export interface Warehouse {
  id: string;
  name: string;
  location: string | null;
}

export interface Category {
  id: string;
  name: string;
  parentId: string | null;
}

export interface WarehouseStockRow {
  warehouseId: string;
  warehouseName: string;
  quantity: number;
}

export interface ArticleVariant {
  id: string;
  sku: string;
  color: string | null;
  size: string | null;
  brand: string | null;
  // Pares clave/valor libres ("Color": "Rojo", "Talle": "M") del creador de
  // atributos/matriz de ArticleFormModal - alternativa a color/size/brand
  // de arriba, que quedan por compatibilidad con datos/imports viejos.
  attributes: Record<string, string> | null;
  unitPrice: number;
  totalStock: number;
  minimumStock: number | null;
  stockByWarehouse: WarehouseStockRow[];
  // Sólo tiene sentido cuando el Article dueño es measurementType
  // LINEAL_1D - desglose EXACTO (piezas reales, no una cuenta) de
  // totalStock en barras/rollos sin cortar vs recortes reutilizables. Ver
  // formatStock más abajo.
  wholePiecesCount: number;
  offcutsCount: number;
}

/** Único lugar que arma la etiqueta visible de una variante ("Rojo / M") -
 * usado por ArticlePicker y por la tabla de Inventario, para no duplicar
 * el criterio "attributes gana, color/size/brand como fallback" en los
 * dos lados. `attributes` no tiene un orden garantizado entre variantes
 * (es un objeto JS) - se ordena por clave para que "Talle: M, Color: Rojo"
 * y "Color: Rojo, Talle: M" no aparezcan como etiquetas distintas entre
 * dos variantes del mismo artículo. */
export function buildVariantLabel(variant: {
  color: string | null;
  size: string | null;
  brand: string | null;
  attributes: Record<string, string> | null;
}): string | null {
  if (variant.attributes && Object.keys(variant.attributes).length > 0) {
    return Object.keys(variant.attributes)
      .sort()
      .map((key) => variant.attributes?.[key])
      .filter(Boolean)
      .join(' / ');
  }
  return [variant.color, variant.size, variant.brand].filter(Boolean).join(' / ') || null;
}

export interface ArticleVariantLookupEntry {
  articleName: string;
  variantLabel: string | null;
  sku: string;
}

/** articleVariantId -> nombre/SKU legible, para pantallas que sólo tienen
 * el UUID a mano (BOM/órdenes/piezas de Producción, que devuelven el
 * modelo crudo de Prisma sin joinear nombres) - se arma en el cliente a
 * partir de ['inventory-articles'] (ya cacheado por ArticlePicker/el
 * catálogo, React Query lo dedupea) en vez de agregar un include al
 * backend sólo para mostrar texto. */
export function buildArticleVariantLookup(articles: Article[]): Record<string, ArticleVariantLookupEntry> {
  const map: Record<string, ArticleVariantLookupEntry> = {};
  for (const article of articles) {
    for (const variant of article.variants) {
      map[variant.id] = { articleName: article.name, variantLabel: buildVariantLabel(variant), sku: variant.sku };
    }
  }
  return map;
}

export interface Article {
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
  // Override individual del % de remarca de este artículo - null = usa
  // TenantSettings.defaultMarkupPercent en su lugar (ver Preferencias).
  markupPercent: number | null;
  // Folleto (PDF) y adjunto ZIP opcionales - "dato extra", ver ArticleDetailsModal.
  brochureUrl: string | null;
  attachmentZipUrl: string | null;
  // Informativo - ver el comentario del campo en schema.prisma. No impide
  // que un artículo con hasVariants=false tenga más de un ArticleVariant.
  hasVariants: boolean;
  // true = tiene (o tuvo alguna vez) una receta propia - ver el comentario
  // en InventoryService.listArticles (backend). Usado por ArticlePicker en
  // modo `filter` para el selector "Producto a fabricar" de Recetas.
  isManufactured: boolean;
  // "Medida comercial" (ver ArticleFormModal, sección "Tipo de medición") -
  // fija desde que se crea el artículo, sin forma de editarla después (ver
  // UpdateArticleInput, no la incluye a propósito). null en los campos que
  // no le corresponden al measurementType elegido.
  measurementType: 'DISCRETE' | 'CONTINUOUS' | 'LINEAL_1D' | 'SURFACE_2D';
  purchaseSize: number | null;
  baseUnit: string | null;
  commercialLength: number | null;
  minUsableLength: number | null;
  sheetWidth: number | null;
  sheetLength: number | null;
  // Alícuota por defecto (Article.taxDefinition) - lo que ArticlePicker
  // arrastra a la fila de Facturación/Cotizaciones al elegir este artículo,
  // antes de cualquier override manual del usuario en esa línea.
  taxRate: number | null;
  taxKind: 'GRAVADO' | 'EXENTO' | 'NO_GRAVADO';
  variants: ArticleVariant[];
}

export interface StockDisplay {
  /** "3 barras + 3 recortes", "3,28 m²", "12 un." - lo primero que se ve. */
  primary: string;
  /** "24.856 mm disponibles en total", "≈ 1,1 planchas" - contexto/detalle
   * opcional en letra chica debajo de `primary`. */
  secondary: string | null;
  /** "exact" = sale de contar StockPiece reales (sólo LINEAL_1D, ver
   * wholePiecesCount/offcutsCount). "approx" = total ÷ medida comercial
   * configurada, sin pieza física verificable detrás (SURFACE_2D/CONTINUOUS
   * - "no hay nesting/recortes 2D rastreables en v1", ver schema.prisma).
   * null = no hay medida comercial cargada, nada para estimar. */
  badge: 'exact' | 'approx' | null;
}

const NUMBER_FORMAT = new Intl.NumberFormat('es-AR');
const DECIMAL_FORMAT = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });

/** Traduce el stock crudo de una variante al idioma de su measurementType,
 * en vez del número pelado que se mostraba antes (sin unidad, sin
 * contexto) - ver docs de la sesión "Medida Comercial". Un artículo
 * LINEAL_1D sin ninguna compra recibida todavía (wholePiecesCount=0,
 * offcutsCount=0 pero totalStock>0 no debería pasar nunca en la práctica,
 * pero por las dudas cae al mm crudo en vez de mostrar "0 barras" con
 * stock real arriba). */
export function formatStock(article: Article, variant: ArticleVariant): StockDisplay {
  const total = variant.totalStock;
  switch (article.measurementType) {
    case 'LINEAL_1D': {
      const { wholePiecesCount: whole, offcutsCount: offcuts } = variant;
      if (whole === 0 && offcuts === 0) {
        return { primary: `${NUMBER_FORMAT.format(total)} mm`, secondary: null, badge: null };
      }
      const parts: string[] = [];
      if (whole > 0) parts.push(`${whole} barra${whole === 1 ? '' : 's'}`);
      if (offcuts > 0) parts.push(`${offcuts} recorte${offcuts === 1 ? '' : 's'}`);
      return {
        primary: parts.join(' + '),
        secondary: `${NUMBER_FORMAT.format(total)} mm disponibles en total`,
        badge: 'exact',
      };
    }
    case 'SURFACE_2D': {
      const primary = `${DECIMAL_FORMAT.format(total)} m²`;
      if (!article.sheetWidth || !article.sheetLength) {
        return { primary, secondary: null, badge: null };
      }
      const sheetArea = (article.sheetWidth / 1000) * (article.sheetLength / 1000);
      const estimatedSheets = sheetArea > 0 ? total / sheetArea : 0;
      return { primary, secondary: `≈ ${DECIMAL_FORMAT.format(estimatedSheets)} planchas`, badge: 'approx' };
    }
    case 'CONTINUOUS': {
      const unit = article.baseUnit ?? '';
      const primary = `${NUMBER_FORMAT.format(total)}${unit ? ` ${unit}` : ''}`;
      if (!article.purchaseSize) {
        return { primary, secondary: null, badge: null };
      }
      const estimatedUnits = total / article.purchaseSize;
      const label = estimatedUnits === 1 ? 'unidad de compra' : 'unidades de compra';
      return { primary, secondary: `≈ ${DECIMAL_FORMAT.format(estimatedUnits)} ${label}`, badge: 'approx' };
    }
    default:
      return { primary: `${NUMBER_FORMAT.format(total)} un.`, secondary: null, badge: null };
  }
}

export interface UpdateArticleInput {
  isService?: boolean;
  isPublished?: boolean;
  isManufactured?: boolean;
  // null clears it, undefined/omitted leaves it untouched.
  preferredSupplierId?: string | null;
  markupPercent?: number | null;
  description?: string | null;
  name?: string;
  categoryId?: string | null;
  unitOfMeasure?: string;
  // "Eliminar"/reactivar (soft delete) - ver Article.active. El backend
  // rechaza active:false si el artículo está en producción.
  active?: boolean;
}

export interface CreateArticleInput {
  name: string;
  unitOfMeasure: string;
  description?: string;
  categoryId?: string;
  isService?: boolean;
  isPublished?: boolean;
  hasVariants?: boolean;
  isManufactured?: boolean;
  measurementType?: 'DISCRETE' | 'CONTINUOUS' | 'LINEAL_1D' | 'SURFACE_2D';
  purchaseSize?: number;
  baseUnit?: string;
  commercialLength?: number;
  minUsableLength?: number;
  sheetWidth?: number;
  sheetLength?: number;
}

export interface CreateArticleVariantInput {
  articleId: string;
  sku: string;
  color?: string;
  size?: string;
  brand?: string;
  attributes?: Record<string, string>;
  unitPrice: number;
  // Sólo para sembrar el primer costo conocido de una variante recién
  // creada (sin ninguna compra real todavía) - ver el comentario del DTO
  // en el backend.
  costPrice?: number;
}

/** Article images (and goods-receipt attachments, and Person avatars) are
 * served from @fastify/static at the API's root (`/uploads/...`), not under
 * the `/api` prefix everything else in `api` (axios instance) uses - strip
 * that suffix to get the plain origin. Person.avatarUrl is the one field
 * that can ALSO hold a value that never went through our own upload
 * endpoint at all - a URL (or data: URI) the user pasted directly - so
 * anything that already looks absolute passes through untouched instead of
 * getting the origin prepended onto it. */
export function resolveUploadUrl(path: string | null): string | null {
  if (!path) return null;
  if (/^(https?:|data:|blob:)/.test(path)) return path;
  const origin = (api.defaults.baseURL ?? '').replace(/\/api\/?$/, '');
  return `${origin}${path}`;
}

export const UNIT_OF_MEASURE_OPTIONS = [
  { value: 'UNIT', label: 'Unidad' },
  { value: 'KG', label: 'Kilogramo' },
  { value: 'LTR', label: 'Litro' },
  { value: 'MM', label: 'Milímetro' },
  { value: 'M2', label: 'Metro cuadrado' },
] as const;

export const MOVEMENT_TYPES = [
  { value: 'PURCHASE_IN', label: 'Compra (entrada)' },
  { value: 'SALE_OUT', label: 'Venta (salida)' },
  { value: 'RETURN', label: 'Devolución (entrada)' },
  { value: 'PRODUCTION_IN', label: 'Producción (entrada)' },
  { value: 'PRODUCTION_OUT', label: 'Producción (salida/consumo)' },
  { value: 'ADJUSTMENT', label: 'Ajuste manual (+/-)' },
] as const;

export type MovementType = (typeof MOVEMENT_TYPES)[number]['value'];

// No purchaseOrderId here on purpose (2026-07-29) - linking a manual
// movement to a real Orden de Compra with no quantity/cost validation was
// exactly the bug "Recibir mercadería" (ReceiveGoodsModal) was built to
// close; the backend also rejects this field on POST /inventory/movements
// now (InventoryController.recordMovement), it's not just hidden here.
export interface RecordStockMovementInput {
  warehouseId: string;
  articleVariantId: string;
  type: MovementType;
  quantity: number;
  unitCost?: number;
}

export interface PriceHistoryEntry {
  id: string;
  unitPrice: string;
  costPrice: string | null;
  effectiveAt: string;
  purchaseOrderId: string | null;
  purchaseOrderNumber: string | null;
}

export interface ImportRowError {
  row: number;
  sku?: string;
  message: string;
}

export interface ImportResult {
  created: number;
  errors: ImportRowError[];
}

export interface ListArticlesFilters {
  search?: string;
  categoryId?: string;
  isPublished?: boolean;
  includeInactive?: boolean;
}

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

export interface SetMinimumStockInput {
  warehouseId: string;
  articleVariantId: string;
  minimumQuantity: number;
  autoReplenish?: boolean;
}

// Estos dos devuelven el modelo de Prisma crudo (POST /inventory/articles,
// POST /inventory/article-variants) - a diferencia de `Article`/
// `ArticleVariant` de arriba, que son el shape ya mapeado de
// listArticles() (con Decimal ya convertido a number). unitPrice acá
// llega como string (serialización de Prisma.Decimal), no number.
export interface CreatedArticle {
  id: string;
  name: string;
}

export interface CreatedArticleVariant {
  id: string;
  sku: string;
  unitPrice: string;
}

export interface AutoReplenishmentResult {
  created: number;
  skippedAlreadyToday: number;
}

export const inventoryApi = {
  listArticles: (filters?: ListArticlesFilters) =>
    api.get<Article[]>('/inventory/articles', { params: filters }).then((r) => r.data),
  listWarehouses: () => api.get<Warehouse[]>('/inventory/warehouses').then((r) => r.data),
  createWarehouse: (dto: { name: string; location?: string }) =>
    api.post<Warehouse>('/inventory/warehouses', dto).then((r) => r.data),
  listReorderSuggestions: () =>
    api.get<ReorderSuggestion[]>('/inventory/reorder-suggestions').then((r) => r.data),
  setMinimumStock: (dto: SetMinimumStockInput) => api.post('/inventory/minimum-stock', dto).then((r) => r.data),
  listCategories: () => api.get<Category[]>('/inventory/categories').then((r) => r.data),
  createCategory: (dto: { name: string; parentId?: string }) =>
    api.post<Category>('/inventory/categories', dto).then((r) => r.data),
  recordMovement: (dto: RecordStockMovementInput) =>
    api.post('/inventory/movements', dto).then((r) => r.data),
  downloadImportTemplate: async () => {
    const res = await api.get('/inventory/articles/import/template', { responseType: 'blob' });
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'plantilla-articulos.xlsx';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },
  importArticles: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api
      .post<ImportResult>('/inventory/articles/import', formData)
      .then((r) => r.data);
  },
  uploadArticleImage: (articleId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api
      .post<Article>(`/inventory/articles/${articleId}/image`, formData)
      .then((r) => r.data);
  },
  removeArticleImage: (articleId: string) =>
    api.delete<Article>(`/inventory/articles/${articleId}/image`).then((r) => r.data),
  uploadArticleBrochure: (articleId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api
      .post<Article>(`/inventory/articles/${articleId}/brochure`, formData)
      .then((r) => r.data);
  },
  removeArticleBrochure: (articleId: string) =>
    api.delete<Article>(`/inventory/articles/${articleId}/brochure`).then((r) => r.data),
  uploadArticleAttachmentZip: (articleId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api
      .post<Article>(`/inventory/articles/${articleId}/attachment-zip`, formData)
      .then((r) => r.data);
  },
  removeArticleAttachmentZip: (articleId: string) =>
    api.delete<Article>(`/inventory/articles/${articleId}/attachment-zip`).then((r) => r.data),
  updateArticle: (id: string, dto: UpdateArticleInput) =>
    api.patch<Article>(`/inventory/articles/${id}`, dto).then((r) => r.data),
  createArticle: (dto: CreateArticleInput) =>
    api.post<CreatedArticle>('/inventory/articles', dto).then((r) => r.data),
  createArticleVariant: (dto: CreateArticleVariantInput) =>
    api.post<CreatedArticleVariant>('/inventory/article-variants', dto).then((r) => r.data),
  updateArticleVariantPrice: (articleVariantId: string, unitPrice: number) =>
    api
      .patch<ArticleVariant>(`/inventory/article-variants/${articleVariantId}/price`, { unitPrice })
      .then((r) => r.data),
  getPriceHistory: (articleVariantId: string) =>
    api
      .get<PriceHistoryEntry[]>(`/inventory/article-variants/${articleVariantId}/price-history`)
      .then((r) => r.data),
  runReplenishmentNow: () =>
    api.post<AutoReplenishmentResult>('/inventory/replenishment/run-now').then((r) => r.data),
};
