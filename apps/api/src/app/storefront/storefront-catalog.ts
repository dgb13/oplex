import { getOwnTaxCondition, Prisma, vatRatePercent } from '@plexo/database';
import type { StorefrontSettings, StorefrontStockDisplay, TenantTaxCondition } from '@plexo/database';

/** Con 5 o menos, la tienda avisa "Quedan N" (modo LOW). */
export const LOW_STOCK_THRESHOLD = 5;

export interface StorefrontVariant {
  id: string;
  label: string;
  price: number;
  // Precio sin IVA - sólo para Responsable Inscripto (ver priceFor).
  netPrice: number | null;
  // Lo que se le muestra al visitante según stockDisplay (null = no mostrar).
  stockShown: number | null;
}

export interface StorefrontProduct {
  id: string;
  name: string;
  description: string | null;
  category: string;
  sku: string;
  images: string[];
  price: number;
  netPrice: number | null;
  stockShown: number | null;
  variants: StorefrontVariant[];
}

export interface StorefrontCatalog {
  categories: string[];
  products: StorefrontProduct[];
  taxCondition: TenantTaxCondition | null;
}

/** Por qué cada artículo activo quedó afuera (un artículo puede sumar en más de uno). */
export interface StorefrontCoverage {
  visible: number;
  total: number;
  notPublished: number;
  noStock: number;
  noCategory: number;
  noPrice: number;
}

interface VariantInternal {
  id: string;
  label: string;
  price: Prisma.Decimal;
  netPrice: Prisma.Decimal | null;
  stock: number;
}

/**
 * Precio final al consumidor. Responsable Inscripto carga el precio de
 * venta sin IVA (Facturación lo suma al emitir), así que acá se le agrega
 * la alícuota del artículo; Monotributo/Exento ya cargan el precio final.
 * Sin condición cargada, tal cual (la tienda no se puede publicar así).
 */
export function priceFor(
  unitPrice: Prisma.Decimal,
  vatRate: Prisma.Decimal,
  condition: TenantTaxCondition | null,
): { price: Prisma.Decimal; netPrice: Prisma.Decimal | null } {
  if (condition === 'RESPONSABLE_INSCRIPTO') {
    const price = unitPrice.mul(new Prisma.Decimal(1).add(vatRate.div(100))).toDecimalPlaces(2);
    return { price, netPrice: unitPrice.toDecimalPlaces(2) };
  }
  return { price: unitPrice.toDecimalPlaces(2), netPrice: null };
}

export function stockShown(stock: number, mode: StorefrontStockDisplay): number | null {
  if (mode === 'ALWAYS') return stock;
  if (mode === 'LOW') return stock <= LOW_STOCK_THRESHOLD ? stock : null;
  return null;
}

function variantLabel(variant: {
  sku: string;
  color: string | null;
  size: string | null;
  attributes: Prisma.JsonValue;
}): string {
  const parts = [variant.color, variant.size].filter((p): p is string => !!p);
  if (parts.length === 0 && variant.attributes && typeof variant.attributes === 'object' && !Array.isArray(variant.attributes)) {
    for (const value of Object.values(variant.attributes)) {
      if (typeof value === 'string' && value.trim()) parts.push(value.trim());
    }
  }
  return parts.length > 0 ? parts.join(' / ') : variant.sku;
}

/**
 * Arma el catálogo de la tienda con el contexto de tenant ya activo. Un
 * artículo aparece cuando: está activo, no es un servicio, está publicado,
 * tiene categoría y al menos una variante con precio y stock disponible
 * (físico menos reservado por Producción) en el depósito elegido.
 */
export async function buildStorefrontCatalog(
  db: Prisma.TransactionClient,
  settings: Pick<StorefrontSettings, 'warehouseId' | 'stockDisplay'>,
): Promise<{ catalog: StorefrontCatalog; coverage: StorefrontCoverage; variantsById: Map<string, VariantInternal & { articleName: string }> }> {
  const taxCondition = await getOwnTaxCondition(db);
  const warehouseFilter = settings.warehouseId ? { warehouseId: settings.warehouseId } : {};

  const [articles, ledger, reservations] = await Promise.all([
    db.article.findMany({
      where: { active: true, isService: false },
      include: {
        category: { select: { name: true } },
        taxDefinition: true,
        images: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], select: { url: true } },
        variants: { select: { id: true, sku: true, color: true, size: true, attributes: true, unitPrice: true }, orderBy: { createdAt: 'asc' } },
      },
      orderBy: { name: 'asc' },
    }),
    db.stockLedger.groupBy({ by: ['articleVariantId'], where: warehouseFilter, _sum: { quantity: true } }),
    db.stockReservation.groupBy({
      by: ['inputArticleVariantId'],
      where: { status: 'ACTIVE', ...warehouseFilter },
      _sum: { quantityReserved: true },
    }),
  ]);

  const physical = new Map(ledger.map((row) => [row.articleVariantId, Number(row._sum.quantity ?? 0)]));
  const reserved = new Map(reservations.map((row) => [row.inputArticleVariantId, Number(row._sum.quantityReserved ?? 0)]));

  const coverage: StorefrontCoverage = { visible: 0, total: articles.length, notPublished: 0, noStock: 0, noCategory: 0, noPrice: 0 };
  const products: StorefrontProduct[] = [];
  const categories = new Set<string>();
  const variantsById = new Map<string, VariantInternal & { articleName: string }>();

  for (const article of articles) {
    const vatRate = vatRatePercent(article.taxDefinition);
    const variants: VariantInternal[] = article.variants.map((variant) => {
      const stock = Math.max(0, Math.floor((physical.get(variant.id) ?? 0) - (reserved.get(variant.id) ?? 0)));
      return { id: variant.id, label: variantLabel(variant), stock, ...priceFor(variant.unitPrice, vatRate, taxCondition) };
    });
    const priced = variants.filter((v) => v.price.greaterThan(0));
    const sellable = priced.filter((v) => v.stock > 0);

    if (!article.isPublished) coverage.notPublished++;
    if (!article.categoryId) coverage.noCategory++;
    if (priced.length === 0) coverage.noPrice++;
    if (!variants.some((v) => v.stock > 0)) coverage.noStock++;
    if (!article.isPublished || !article.category || sellable.length === 0) continue;

    coverage.visible++;
    categories.add(article.category.name);
    for (const variant of sellable) variantsById.set(variant.id, { ...variant, articleName: article.name });

    const cheapest = sellable.reduce((min, v) => (v.price.lessThan(min.price) ? v : min));
    const totalStock = sellable.reduce((sum, v) => sum + v.stock, 0);
    const images = article.images.map((i) => i.url);
    if (images.length === 0 && article.imageUrl) images.push(article.imageUrl);

    products.push({
      id: article.id,
      name: article.name,
      description: article.description,
      category: article.category.name,
      sku: article.variants[0]?.sku ?? '',
      images,
      price: cheapest.price.toNumber(),
      netPrice: cheapest.netPrice?.toNumber() ?? null,
      stockShown: stockShown(totalStock, settings.stockDisplay),
      variants:
        sellable.length > 1 || article.hasVariants
          ? sellable.map((v) => ({
              id: v.id,
              label: v.label,
              price: v.price.toNumber(),
              netPrice: v.netPrice?.toNumber() ?? null,
              stockShown: stockShown(v.stock, settings.stockDisplay),
            }))
          : [{ id: cheapest.id, label: cheapest.label, price: cheapest.price.toNumber(), netPrice: cheapest.netPrice?.toNumber() ?? null, stockShown: stockShown(cheapest.stock, settings.stockDisplay) }],
    });
  }

  return {
    catalog: { categories: [...categories].sort((a, b) => a.localeCompare(b, 'es')), products, taxCondition },
    coverage,
    variantsById,
  };
}
