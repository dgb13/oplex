/**
 * Único lugar (lado backend) que arma la etiqueta visible de una
 * ArticleVariant ("Rojo / M") - prioriza `attributes` (el creador de
 * atributos/matriz de ArticleFormModal, ver @plexo/inventory) y cae a los
 * 3 campos fijos color/size/brand para variantes viejas/importadas por
 * Excel. Vive en @plexo/types (no en @plexo/inventory) porque los límites
 * de scope de Nx no dejan a invoicing/quotes/purchases/inventory-cart
 * importar de otro módulo de dominio - éste es el único lib pensado para
 * código compartido entre scopes. Espejo exacto de
 * apps/web/src/lib/inventory.ts:buildVariantLabel - mismo criterio de
 * ordenar `attributes` por clave para que dos variantes del mismo
 * artículo no muestren el mismo par en orden distinto.
 */
export function buildVariantLabel(variant: {
  color?: string | null;
  size?: string | null;
  brand?: string | null;
  attributes?: unknown;
}): string | null {
  const attributes = variant.attributes as Record<string, string> | null | undefined;
  if (attributes && typeof attributes === 'object' && Object.keys(attributes).length > 0) {
    const values = Object.keys(attributes)
      .sort()
      .map((key) => attributes[key])
      .filter(Boolean);
    // La marca va adelante aunque haya atributos: si no, dos marcas del mismo
    // repuesto (mismo código original, mismo vehículo) se ven iguales.
    const brand = variant.brand?.trim();
    if (brand && !values.some((value) => value.toLowerCase() === brand.toLowerCase())) {
      values.unshift(brand);
    }
    return values.join(' / ');
  }
  return [variant.color, variant.size, variant.brand].filter(Boolean).join(' / ') || null;
}
