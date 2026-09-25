'use client';

import ArticleFormModal, {
  type CreatedArticleVariantRef,
} from '@/components/ArticleFormModal';
import ToggleSwitch from '@/components/ToggleSwitch';
import { computeLineTotals } from '@/components/VatLineSummary';
import VatRateSelect from '@/components/VatRateSelect';
import {
  buildVariantLabel,
  inventoryApi,
  resolveUploadUrl,
  stockUnitLabel,
  type Article,
} from '@/lib/inventory';
import { useQuery } from '@tanstack/react-query';
import { Package, PencilLine, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatAmount, newLineKey, type SalesLine } from './salesDocument';
import { LinkButton, SectionLabel } from './SalesDocumentSheet';

interface ArticleOption {
  id: string; // articleVariantId
  name: string;
  variantLabel: string | null;
  sku: string;
  imageUrl: string | null;
  unitPrice: number;
  totalStock: number;
  unit: string;
  isService: boolean;
  taxKind: SalesLine['taxKind'];
  taxRate: number;
}

function flattenArticles(articles: Article[]): ArticleOption[] {
  return articles.flatMap((article) =>
    article.variants.map((variant) => ({
      id: variant.id,
      name: article.name,
      variantLabel: buildVariantLabel(variant),
      sku: variant.sku,
      imageUrl: article.imageUrl,
      unitPrice: variant.unitPrice,
      totalStock: variant.totalStock,
      unit: stockUnitLabel(article),
      isService: article.isService,
      taxKind: article.taxKind,
      taxRate: article.taxRate ?? 0,
    })),
  );
}

/** "2*mesa" / "2 x mesa" = agregar 2 de una (atajo típico de caja). */
function parseSearch(value: string): { searchText: string; searchQty: number } {
  const match = value.trim().match(/^(\d+(?:[.,]\d+)?)\s*[*xX]\s*(.+)$/);
  return match
    ? { searchText: match[2], searchQty: Number(match[1].replace(',', '.')) }
    : { searchText: value, searchQty: 1 };
}

const QTY_FORMAT = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 3 });

/**
 * Artículos de un comprobante de venta, como tabla: una fila por línea con
 * cantidad/precio/IVA editables en el lugar y subtotal, y abajo una
 * búsqueda siempre visible para agregar (Enter agrega el primero, flechas
 * para elegir, "2*mesa" agrega 2, si el artículo ya está suma a la
 * cantidad - sirve también con lector de código de barras, que "tipea" el
 * SKU y manda Enter; el foco se queda en la búsqueda para el próximo).
 * Enter en una celda vuelve a la búsqueda, para cargar de corrido.
 */
export default function SalesLinesEditor({
  lines,
  onChange,
  pricesIncludeTax,
  onPricesIncludeTaxChange,
  currencyCode,
  allowNotes,
  addInputRef,
}: {
  lines: SalesLine[];
  onChange: (lines: SalesLine[]) => void;
  pricesIncludeTax: boolean;
  onPricesIncludeTaxChange: (value: boolean) => void;
  currencyCode?: string;
  // Botón de "detalle" por línea (texto libre que sale en el PDF) - sólo
  // Cotizaciones lo guarda hoy.
  allowNotes?: boolean;
  addInputRef?: React.RefObject<HTMLInputElement | null>;
}) {
  const articlesQuery = useQuery({
    queryKey: ['inventory-articles'],
    queryFn: () => inventoryApi.listArticles(),
  });
  const options = useMemo(
    () => flattenArticles(articlesQuery.data ?? []),
    [articlesQuery.data],
  );
  const optionById = useMemo(
    () => new Map(options.map((o) => [o.id, o])),
    [options],
  );

  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const [openNotes, setOpenNotes] = useState<Set<string>>(
    () => new Set(lines.filter((l) => l.notes).map((l) => l.key)),
  );
  const [justOpenedNote, setJustOpenedNote] = useState<string | null>(null);
  const [creatingArticle, setCreatingArticle] = useState(false);
  const ownAddRef = useRef<HTMLInputElement>(null);
  const addRef = addInputRef ?? ownAddRef;

  const { searchText, searchQty } = useMemo(() => parseSearch(query), [query]);

  // Función (no sólo el useMemo de abajo) porque Enter la vuelve a correr
  // sobre el valor del input EN ESE MOMENTO: un lector de código de barras
  // tipea el SKU y manda Enter antes de que React vuelva a renderizar, y
  // con los resultados del render anterior no agregaba nada.
  function findMatches(text: string): ArticleOption[] {
    const normalized = text.trim().toLowerCase();
    if (!normalized) return [];
    const words = normalized.split(/\s+/);
    const found = options.filter((o) => {
      const haystack =
        `${o.name} ${o.sku} ${o.variantLabel ?? ''}`.toLowerCase();
      return words.every((w) => haystack.includes(w));
    });
    // SKU exacto primero (lector de código de barras).
    const exact = found.findIndex((o) => o.sku.toLowerCase() === normalized);
    if (exact > 0) found.unshift(...found.splice(exact, 1));
    return found.slice(0, 8);
  }
  const matches = findMatches(searchText);

  function updateLine(key: string, patch: Partial<SalesLine>) {
    onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  // Resalta un momento la línea recién agregada/sumada, para que se vea
  // dónde cayó el escaneo sin mover el foco de la búsqueda.
  const [flashKey, setFlashKey] = useState<string | null>(null);
  useEffect(() => {
    if (!flashKey) return;
    const timer = setTimeout(() => setFlashKey(null), 900);
    return () => clearTimeout(timer);
  }, [flashKey]);
  function flashLine(key: string) {
    setFlashKey(key);
  }

  // El foco se QUEDA en la búsqueda después de agregar: con un lector de
  // código de barras el próximo escaneo tiene que caer acá, no en la
  // cantidad de la línea anterior (la pisaba). La cantidad se carga con
  // "2*mesa" o tocando la celda.
  function addOption(
    option: {
      id: string;
      unitPrice: number;
      taxKind: SalesLine['taxKind'];
      taxRate: number;
    },
    qty = 1,
  ) {
    const existing = lines.find((l) => l.articleVariantId === option.id);
    if (existing) {
      onChange(
        lines.map((l) =>
          l.key === existing.key ? { ...l, quantity: l.quantity + qty } : l,
        ),
      );
      flashLine(existing.key);
    } else {
      const key = newLineKey();
      onChange([
        ...lines,
        {
          key,
          articleVariantId: option.id,
          quantity: qty,
          unitPrice: option.unitPrice,
          taxKind: option.taxKind,
          taxRate: option.taxRate,
        },
      ]);
      flashLine(key);
    }
    setQuery('');
    setActive(0);
    setOpen(false);
  }

  function handleArticleCreated(created: CreatedArticleVariantRef) {
    setCreatingArticle(false);
    addOption({
      id: created.variantId,
      unitPrice: created.unitPrice,
      taxKind: 'GRAVADO',
      taxRate: 0,
    });
  }

  function backToSearch(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      addRef.current?.focus();
    }
  }

  const cellClass =
    'h-9 w-full rounded-lg border border-transparent bg-transparent px-2 text-right text-sm tabular-nums outline-none transition hover:border-border focus:border-ring focus:bg-card';

  return (
    <section>
      <SectionLabel
        action={
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <ToggleSwitch
              checked={pricesIncludeTax}
              onChange={onPricesIncludeTaxChange}
              label="Precios con IVA incluido"
            />
            Precios con IVA incluido
          </label>
        }
      >
        Artículos
      </SectionLabel>

      <div className="overflow-x-auto rounded-t-xl border">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-[11px] tracking-wide text-muted-foreground uppercase">
              <th className="w-9 px-3 py-2.5 font-semibold">#</th>
              <th className="px-2 py-2.5 font-semibold">Artículo</th>
              <th className="w-20 px-2 py-2.5 text-right font-semibold">
                Cant.
              </th>
              <th className="w-32 px-2 py-2.5 text-right font-semibold">
                Precio unit.{pricesIncludeTax ? ' (final)' : ''}
              </th>
              <th className="w-36 px-2 py-2.5 font-semibold">IVA</th>
              <th className="w-36 px-2 py-2.5 text-right font-semibold">
                Subtotal
              </th>
              <th className="w-16 px-2 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-8 text-center text-muted-foreground"
                >
                  Todavía no agregaste artículos. Buscalos abajo.
                </td>
              </tr>
            )}
            {lines.map((line, index) => {
              const option = optionById.get(line.articleVariantId);
              const { lineTotal } = computeLineTotals(line, pricesIncludeTax);
              const noPrice = !(line.unitPrice > 0);
              const shortStock =
                option &&
                !option.isService &&
                option.totalStock < line.quantity;
              const notesOpen = openNotes.has(line.key);
              return (
                <tr
                  key={line.key}
                  className={`border-b align-top transition-colors duration-500 last:border-b-0 hover:bg-muted/20 ${
                    flashKey === line.key ? 'bg-primary/10' : ''
                  }`}
                >
                  <td className="px-3 pt-4 text-muted-foreground tabular-nums">
                    {index + 1}
                  </td>
                  <td className="px-2 py-2.5">
                    <div className="flex min-w-0 items-start gap-2.5">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted">
                        {option?.imageUrl ? (
                          <img
                            src={resolveUploadUrl(option.imageUrl) ?? undefined}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <Package className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="leading-snug font-semibold">
                          {option ? option.name : 'Artículo no encontrado'}
                          {option?.variantLabel && (
                            <span className="font-normal text-muted-foreground">
                              {' '}
                              · {option.variantLabel}
                            </span>
                          )}
                        </p>
                        {option && (
                          <p className="font-mono text-xs text-muted-foreground">
                            {option.sku}
                          </p>
                        )}
                        {option && !option.isService && (
                          <p
                            className={`text-xs ${shortStock ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}
                          >
                            {QTY_FORMAT.format(option.totalStock)} {option.unit}{' '}
                            en stock
                            {shortStock
                              ? ' · no alcanza para esta cantidad'
                              : ''}
                          </p>
                        )}
                        {allowNotes && notesOpen && (
                          <input
                            value={line.notes ?? ''}
                            onChange={(e) =>
                              updateLine(line.key, { notes: e.target.value })
                            }
                            onKeyDown={backToSearch}
                            // Sólo al abrirlo con el botón, no al abrir una
                            // cotización que ya traía detalles.
                            autoFocus={justOpenedNote === line.key}
                            placeholder="Detalle de la línea (aparece en el PDF)"
                            className="mt-1.5 h-8 w-full rounded-lg border border-dashed bg-card px-2 text-xs outline-none focus:border-ring"
                          />
                        )}
                        {noPrice && (
                          <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                            Sin precio de venta: cargalo en esta línea.
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-2.5">
                    <input
                      type="number"
                      min={0}
                      step="any"
                      aria-label="Cantidad"
                      className={cellClass}
                      value={line.quantity}
                      onChange={(e) =>
                        updateLine(line.key, {
                          quantity: Number(e.target.value),
                        })
                      }
                      onKeyDown={backToSearch}
                    />
                  </td>
                  <td className="px-2 py-2.5">
                    <input
                      type="number"
                      min={0}
                      step="any"
                      aria-label="Precio unitario"
                      className={`${cellClass} ${noPrice ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/40' : ''}`}
                      value={line.unitPrice}
                      onChange={(e) =>
                        updateLine(line.key, {
                          unitPrice: Number(e.target.value),
                        })
                      }
                      onKeyDown={backToSearch}
                    />
                  </td>
                  <td className="px-2 py-2.5">
                    <VatRateSelect
                      value={{ taxKind: line.taxKind, taxRate: line.taxRate }}
                      onChange={(v) =>
                        updateLine(line.key, {
                          taxKind: v.taxKind,
                          taxRate: v.taxRate,
                        })
                      }
                    />
                  </td>
                  <td className="px-2 pt-4 text-right font-semibold tabular-nums">
                    {formatAmount(lineTotal, currencyCode)}
                  </td>
                  <td className="px-2 pt-2.5">
                    <div className="flex justify-end gap-0.5">
                      {allowNotes && (
                        <button
                          type="button"
                          title="Agregar detalle"
                          onClick={() => {
                            setJustOpenedNote(notesOpen ? null : line.key);
                            setOpenNotes((prev) => {
                              const next = new Set(prev);
                              if (next.has(line.key)) next.delete(line.key);
                              else next.add(line.key);
                              return next;
                            });
                          }}
                          className={`flex h-8 w-8 items-center justify-center rounded-lg transition hover:bg-muted ${
                            notesOpen || line.notes
                              ? 'text-primary'
                              : 'text-muted-foreground'
                          }`}
                        >
                          <PencilLine className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        title="Quitar"
                        onClick={() =>
                          onChange(lines.filter((l) => l.key !== line.key))
                        }
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-destructive"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {/* Fuera de la tabla a propósito: dentro del contenedor con scroll
          horizontal, la lista de resultados quedaba recortada. */}
      <div className="rounded-b-xl border border-t-0 bg-muted/30 py-3 pr-2 pl-11">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={addRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 120)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((i) => Math.min(i + 1, matches.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((i) => Math.max(i - 1, 0));
              } else if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
                const match = matches[active];
                // Si el texto cambió desde el último render (tipeo muy rápido),
                // se busca de nuevo y va el primero.
                const typed = e.currentTarget.value;
                if (typed === query) {
                  if (match) addOption(match, searchQty);
                } else {
                  const parsed = parseSearch(typed);
                  const first = findMatches(parsed.searchText)[0];
                  if (first) addOption(first, parsed.searchQty);
                }
              } else if (e.key === 'Escape') {
                setOpen(false);
              }
            }}
            placeholder="Agregar artículo: buscá por nombre o SKU (o escaneá el código)"
            className="h-10 w-full rounded-xl border border-dashed bg-card pr-3 pl-9 text-sm outline-none focus:border-solid focus:border-ring focus:ring-3 focus:ring-ring/40"
            autoComplete="off"
          />
          {open && query.trim() && (
            <div className="absolute top-full right-0 left-0 z-20 mt-1 max-h-80 overflow-y-auto rounded-xl border bg-popover py-1 shadow-xl">
              {articlesQuery.isLoading ? (
                    <p className="px-3 py-2 text-sm text-muted-foreground">Cargando artículos...</p>
                  ) : matches.length === 0 ? (
                <p className="px-3 py-2 text-sm text-muted-foreground">
                  Sin artículos que coincidan
                </p>
              ) : (
                matches.map((o, i) => (
                  <button
                    key={o.id}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      addOption(o, searchQty);
                    }}
                    onMouseEnter={() => setActive(i)}
                    className={`flex w-full items-center gap-3 px-3 py-2 text-left ${i === active ? 'bg-muted' : ''}`}
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                      {o.imageUrl ? (
                        <img
                          src={resolveUploadUrl(o.imageUrl) ?? undefined}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <Package className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">
                        {o.name}
                        {o.variantLabel && (
                          <span className="text-muted-foreground">
                            {' '}
                            · {o.variantLabel}
                          </span>
                        )}
                      </p>
                      <p className="truncate font-mono text-xs text-muted-foreground">
                        {o.sku}
                      </p>
                    </div>
                    <div className="shrink-0 text-right text-xs tabular-nums">
                      <p
                        className={
                          o.unitPrice > 0
                            ? ''
                            : 'text-amber-600 dark:text-amber-400'
                        }
                      >
                        {o.unitPrice > 0
                          ? formatAmount(o.unitPrice)
                          : 'sin precio'}
                      </p>
                      {!o.isService && (
                        <p className="text-muted-foreground">
                          {QTY_FORMAT.format(o.totalStock)} {o.unit}
                        </p>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            <Kbd>Enter</Kbd> agrega el primero · <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> para elegir · <Kbd>2*mesa</Kbd> agrega 2 · si ya
            está, suma a la cantidad
          </span>
          <LinkButton onClick={() => setCreatingArticle(true)}>
            + Nuevo artículo
          </LinkButton>
        </div>
      </div>

      {creatingArticle && (
        <ArticleFormModal
          onClose={() => setCreatingArticle(false)}
          onSaved={handleArticleCreated}
        />
      )}
    </section>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="mx-0.5 rounded border border-b-2 bg-card px-1 font-mono text-[10.5px] text-muted-foreground">
      {children}
    </kbd>
  );
}
