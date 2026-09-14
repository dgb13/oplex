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

export interface Article {
  id: string;
  name: string;
  description: string | null;
  unitOfMeasure: string;
  categoryId: string | null;
  categoryName: string | null;
  isService: boolean;
  isPublished: boolean;
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
  // Alícuota por defecto (Article.taxDefinition) - lo que ArticlePicker
  // arrastra a la fila de Facturación/Cotizaciones al elegir este artículo,
  // antes de cualquier override manual del usuario en esa línea.
  taxRate: number | null;
  taxKind: 'GRAVADO' | 'EXENTO' | 'NO_GRAVADO';
  variants: ArticleVariant[];
}

export interface UpdateArticleInput {
  isService?: boolean;
  isPublished?: boolean;
  // null clears it, undefined/omitted leaves it untouched.
  preferredSupplierId?: string | null;
  markupPercent?: number | null;
  description?: string | null;
}

export interface CreateArticleInput {
  name: string;
  unitOfMeasure: string;
  description?: string;
  categoryId?: string;
  isService?: boolean;
  isPublished?: boolean;
  hasVariants?: boolean;
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
