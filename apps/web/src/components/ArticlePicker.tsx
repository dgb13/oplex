'use client';

import { buildVariantLabel, inventoryApi, resolveUploadUrl, type Article } from '@/lib/inventory';
import {
  Combobox,
  ComboboxButton,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
} from '@headlessui/react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Plus, ShoppingBasket } from 'lucide-react';
import { useMemo, useState } from 'react';
import ArticleFormModal, { type CreatedArticleVariantRef } from './ArticleFormModal';

export interface ArticlePickerOption {
  id: string; // articleVariantId
  articleName: string;
  variantLabel: string | null;
  sku: string;
  imageUrl: string | null;
  categoryName: string | null;
  unitPrice: number;
  totalStock: number;
  minimumStock: number | null;
  // Alícuota por defecto del artículo (Article.taxDefinition) - Facturación
  // y Cotizaciones la usan para prefillar la fila al elegir este artículo.
  taxRate: number | null;
  taxKind: 'GRAVADO' | 'EXENTO' | 'NO_GRAVADO';
  isManufactured: boolean;
  measurementType: 'DISCRETE' | 'CONTINUOUS' | 'LINEAL_1D' | 'SURFACE_2D';
}

function flattenOptions(articles: Article[]): ArticlePickerOption[] {
  return articles.flatMap((article) =>
    article.variants.map((variant) => ({
      id: variant.id,
      articleName: article.name,
      variantLabel: buildVariantLabel(variant),
      sku: variant.sku,
      imageUrl: article.imageUrl,
      categoryName: article.categoryName,
      unitPrice: variant.unitPrice,
      totalStock: variant.totalStock,
      minimumStock: variant.minimumStock,
      taxRate: article.taxRate,
      taxKind: article.taxKind,
      isManufactured: article.isManufactured,
      measurementType: article.measurementType,
    })),
  );
}

interface ArticlePickerProps {
  value: string;
  onChange: (variantId: string, option: ArticlePickerOption | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  // Restringe qué opciones se listan/buscan, sin tocar el fetch compartido
  // (['inventory-articles'], deduplicado con los otros 6+ formularios que
  // usan este picker) - p. ej. production/bom/page.tsx lo usa en "Producto a
  // fabricar" para no mezclar insumos con productos terminados
  // (`(o) => o.isManufactured`). undefined = sin filtrar, comportamiento de
  // siempre en el resto de los formularios.
  filter?: (option: ArticlePickerOption) => boolean;
  // false oculta el "+ nuevo artículo" genérico - Recetas lo apaga en
  // "Producto a fabricar" porque tiene su propio alta ("Nuevo producto
  // fabricable"), pensada para un producto con receta.
  allowCreate?: boolean;
}

/** Selector de artículo/variante compartido, con búsqueda por nombre/SKU e
 * imagen/stock por opción — reemplaza el <select> nativo que 6 formularios
 * distintos (Factura, Cotización, Orden de Compra, Pedido de Cotización x2,
 * Ajuste de Stock) reimplementaban cada uno con su propio flatMap. Reusa la
 * misma queryKey/queryFn que ya usaban esos 6 sitios y `ArticleCatalogGrid`
 * (React Query dedupea la request), así que sumar este picker a un form más
 * no agrega ningún pedido nuevo al backend. Sólo resuelve "elegir variante"
 * - cada caller sigue completando cantidad/precio/costo en sus propios
 * inputs, ya que eso difiere de formulario a formulario (auto-fill de
 * precio en Cotización, costo obligatorio en Orden de Compra, sin costo en
 * Pedido de Cotización grupal, etc.). */
export default function ArticlePicker({
  value,
  onChange,
  placeholder,
  disabled,
  className,
  filter,
  allowCreate = true,
}: ArticlePickerProps) {
  const articlesQuery = useQuery({
    queryKey: ['inventory-articles'],
    queryFn: () => inventoryApi.listArticles(),
  });
  const [query, setQuery] = useState('');
  const [creatingArticle, setCreatingArticle] = useState(false);

  const allOptions = useMemo(() => flattenOptions(articlesQuery.data ?? []), [articlesQuery.data]);
  const options = useMemo(() => (filter ? allOptions.filter(filter) : allOptions), [allOptions, filter]);
  // El valor ya elegido se sigue resolviendo contra TODAS las opciones, no
  // sólo las filtradas - si el filtro cambia el resultado no debería dejar
  // de mostrar lo que ya estaba seleccionado (p. ej. bom/page.tsx precarga
  // el producto de una receta existente antes de que isManufactured se
  // haya podido marcar retroactivamente).
  const selected = allOptions.find((o) => o.id === value) ?? null;
  const isEmpty = !articlesQuery.isLoading && options.length === 0;
  // Distingue "no hay ningún artículo cargado todavía" de "hay artículos,
  // pero ninguno pasa el filtro" (p. ej. ningún producto marcado como
  // fabricable en Recetas) - lo segundo no debería sonar a catálogo vacío,
  // el "+ nuevo artículo" de al lado sigue siendo el camino para el primero.
  const emptyPlaceholder =
    filter && allOptions.length > 0 ? 'Sin artículos que coincidan con el filtro' : 'Sin artículos cargados';

  // Lector de código de barras / tipear el SKU completo + Enter: sin
  // ningún manejo especial, si el filtro deja un único resultado Combobox
  // ya lo activa por default y Enter lo selecciona solo (confirmado
  // probando en Chrome). El único caso no cubierto por eso es un SKU
  // exacto que además sea substring de otro (p. ej. "ARROZ-1KG" dentro de
  // "ARROZ-1KG-XL") - ahí ordenamos el match exacto primero para que sea
  // el que quede activo, en vez de dejarlo a la suerte del orden original.
  //
  // También matchea por variantLabel ("Rojo", "M") - no sólo nombre/SKU -
  // para poder buscar "Remera Rojo" y encontrar la variante correcta de un
  // artículo con variantes (ver ArticleFormModal, creador de atributos).
  // Por palabra, no por frase completa: "Remera Rojo" no aparece tal cual
  // en ningún campo (el nombre es "Remera Basica", la variante "Rojo / S"
  // en campos separados) - cada palabra de la búsqueda tiene que aparecer
  // en algún lado de nombre+SKU+variante, no las dos juntas y seguidas.
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (normalized === '') return options;
    const words = normalized.split(/\s+/).filter(Boolean);
    const matches = options.filter((o) => {
      const haystack = `${o.articleName} ${o.sku} ${o.variantLabel ?? ''}`.toLowerCase();
      return words.every((w) => haystack.includes(w));
    });
    const exactIndex = matches.findIndex((o) => o.sku.toLowerCase() === normalized);
    if (exactIndex <= 0) return matches;
    const [exact] = matches.splice(exactIndex, 1);
    return [exact, ...matches];
  }, [options, query]);

  function handleArticleCreated(created: CreatedArticleVariantRef) {
    // El artículo recién creado sin stock/imagen/categoría todavía - se
    // arma la opción a mano en vez de esperar el refetch de
    // ['inventory-articles'] (que ArticleFormModal ya invalida, así que la
    // próxima vez que se abra esta lista el artículo real ya aparece ahí).
    onChange(created.variantId, {
      id: created.variantId,
      articleName: created.articleName,
      variantLabel: null,
      sku: created.sku,
      imageUrl: null,
      categoryName: null,
      unitPrice: created.unitPrice,
      totalStock: 0,
      minimumStock: null,
      // El alta rápida desde acá no pide impuesto todavía (ver
      // ArticleFormModal) - mismo default que un artículo sin
      // taxDefinition en el backend (resolveArticleTax/resolveLineTax).
      taxRate: 0,
      taxKind: 'GRAVADO',
      isManufactured: created.isManufactured,
      measurementType: created.measurementType,
    });
    setCreatingArticle(false);
  }

  return (
    <>
      <Combobox
        value={value || null}
        onChange={(id: string | null) => onChange(id ?? '', id ? (options.find((o) => o.id === id) ?? null) : null)}
        disabled={disabled || isEmpty}
      >
        <div className={`relative ${className ?? ''}`}>
          <div className="relative">
            <ComboboxInput
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 py-2 pl-3 pr-16 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500 disabled:opacity-70"
              displayValue={() =>
                selected
                  ? `${selected.sku} — ${selected.articleName}${selected.variantLabel ? ` (${selected.variantLabel})` : ''}`
                  : ''
              }
              onChange={(e) => setQuery(e.target.value)}
              placeholder={isEmpty ? emptyPlaceholder : (placeholder ?? 'Buscar artículo o SKU...')}
            />
            {allowCreate && (
              <button
                type="button"
                onClick={() => setCreatingArticle(true)}
                title="Nuevo artículo"
                className="absolute inset-y-0 right-7 flex items-center px-1.5 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400"
              >
                <Plus className="h-4 w-4" />
              </button>
            )}
            <ComboboxButton className="absolute inset-y-0 right-0 flex items-center px-2 text-slate-500">
              <ChevronDown className="h-4 w-4" />
            </ComboboxButton>
          </div>
          <ComboboxOptions
            anchor="bottom start"
            className="z-[60] mt-1 max-h-72 w-[var(--input-width)] overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-1 shadow-xl focus:outline-none"
          >
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-sm text-slate-500">Sin artículos que coincidan</p>
            ) : (
              filtered.map((option) => {
                const belowMinimum = option.minimumStock !== null && option.totalStock < option.minimumStock;
                return (
                  <ComboboxOption
                    key={option.id}
                    value={option.id}
                    className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm data-[focus]:bg-slate-100 dark:data-[focus]:bg-slate-800"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded bg-slate-200 dark:bg-slate-800">
                      {option.imageUrl ? (
                        <img
                          src={resolveUploadUrl(option.imageUrl) ?? undefined}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <ShoppingBasket className="h-4 w-4 text-slate-400 dark:text-slate-600" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 truncate text-slate-900 dark:text-slate-100">
                        <span className="truncate">
                          {option.articleName}
                          {option.variantLabel && <span className="text-slate-500"> · {option.variantLabel}</span>}
                        </span>
                        {belowMinimum && (
                          <span className="shrink-0 rounded-full bg-red-100 dark:bg-red-950/50 px-1.5 py-0.5 text-[10px] font-medium text-red-700 dark:text-red-400">
                            Bajo mínimo
                          </span>
                        )}
                      </p>
                      <p className="truncate text-xs text-slate-500">{option.sku}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-slate-700 dark:text-slate-300">${option.unitPrice.toFixed(2)}</p>
                      <p className="text-xs text-slate-500">Stock: {option.totalStock}</p>
                    </div>
                  </ComboboxOption>
                );
              })
            )}
          </ComboboxOptions>
        </div>
      </Combobox>

      {creatingArticle && (
        <ArticleFormModal onClose={() => setCreatingArticle(false)} onSaved={handleArticleCreated} />
      )}
    </>
  );
}
