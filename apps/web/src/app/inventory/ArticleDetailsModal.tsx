'use client';

import { priceTag } from '@/components/CostVat';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Select from '@/components/ui/Select';
import { Textarea } from '@/components/ui/textarea';
import { companiesApi } from '@/lib/companies';
import type { Article, ArticleSheet, Category } from '@/lib/inventory';
import { inventoryApi, resolveUploadUrl, UNIT_OF_MEASURE_OPTIONS } from '@/lib/inventory';
import { formatMoney, useTaxCondition, useTaxOptions } from '@/lib/vatCost';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { FileArchive, FileText } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

interface Props {
  article: {
    id: string;
    name: string;
    description: string | null;
    brochureUrl: string | null;
    attachmentZipUrl: string | null;
    categoryId: string | null;
    unitOfMeasure: string;
    measurementType: Article['measurementType'];
    commercialLength: number | null;
    isService: boolean;
    isPublished: boolean;
    isManufactured: boolean;
    active: boolean;
  };
  categories: Category[];
  onClose: () => void;
}

type Tab = 'general' | 'precios' | 'variantes' | 'stock' | 'adjuntos';

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'general', label: 'Datos generales' },
  { key: 'precios', label: 'Precios e IVA' },
  { key: 'variantes', label: 'Variantes' },
  { key: 'stock', label: 'Stock' },
  { key: 'adjuntos', label: 'Adjuntos' },
];

function apiMessage(err: unknown, fallback: string): string {
  const message = (err as AxiosError<{ message?: string | string[] }>).response?.data?.message ?? fallback;
  return Array.isArray(message) ? message.join(', ') : message;
}

/**
 * Ficha de un artículo ya creado - se abre con el lapicito de cada fila de
 * Inventario (boceto aprobado "Edición de artículos"). Pestañas como el alta
 * (ArticleFormModal) y un solo "Guardar cambios" para todo lo editable:
 * datos generales, IVA, proveedor, remarca, precio y SKU por variante y
 * stock mínimo por depósito. Lo que se guarda al instante: adjuntos
 * (subir/quitar) y activar/desactivar.
 *
 * A propósito NO se edita acá: el costo (sale de compras, producción y
 * movimientos - se muestra de sólo lectura), el stock actual (se mueve con
 * un movimiento), measurementType/purchaseSize (ver schema.prisma) y la
 * unidad si ya tiene registros (getUnitOfMeasureLockReasons). De la
 * "medida comercial" sólo commercialLength, y sólo en LINEAL_1D - cada barra
 * ya recibida guarda su propio largo. Sin <form> (bug de forms anidados,
 * mismo criterio que ArticleFormModal).
 */
export default function ArticleDetailsModal({ article, categories, onClose }: Props) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('general');

  const sheetQuery = useQuery({
    queryKey: ['article-sheet', article.id],
    queryFn: () => inventoryApi.getArticleSheet(article.id),
    staleTime: 0,
  });
  const sheet = sheetQuery.data;
  const taxOptionsQuery = useTaxOptions();
  const taxOptions = taxOptionsQuery.data ?? [];
  const suppliersQuery = useQuery({ queryKey: ['companies', 'SUPPLIER'], queryFn: () => companiesApi.list('SUPPLIER') });
  const { condition } = useTaxCondition();
  const salePriceTag = priceTag(condition);

  // --- Datos generales (lo que ya editaba la ficha)
  const [name, setName] = useState(article.name);
  const [categoryId, setCategoryId] = useState(article.categoryId ?? '');
  const [unitOfMeasure, setUnitOfMeasure] = useState(article.unitOfMeasure);
  const [description, setDescription] = useState(article.description ?? '');
  const [isService, setIsService] = useState(article.isService);
  const [isPublished, setIsPublished] = useState(article.isPublished);
  const [isManufactured, setIsManufactured] = useState(article.isManufactured);
  // Unidad bloqueada si algo ya guarda cantidades del artículo (stock,
  // recetas, comprobantes...) - el backend lo rechaza igual, esto es para
  // deshabilitar el selector y explicar por qué. Siempre fresco al abrir.
  const unitLockQuery = useQuery({
    queryKey: ['article-unit-of-measure-lock', article.id],
    queryFn: () => inventoryApi.getUnitOfMeasureLock(article.id),
    staleTime: 0,
    gcTime: 0,
  });
  const unitLockReasons = unitLockQuery.data?.reasons ?? [];
  const unitLocked = unitLockQuery.isPending || unitLockReasons.length > 0;
  const isLineal = article.measurementType === 'LINEAL_1D';
  const [commercialLength, setCommercialLength] = useState(
    article.commercialLength === null ? '' : String(article.commercialLength),
  );
  const commercialLengthValue = Number(commercialLength);
  const commercialLengthInvalid =
    isLineal &&
    commercialLength.trim() !== '' &&
    !(Number.isFinite(commercialLengthValue) && commercialLengthValue > 0);
  const commercialLengthChanged =
    isLineal && commercialLength.trim() !== '' && commercialLengthValue !== article.commercialLength;

  // --- Precios e IVA, variantes y stock: arrancan cuando llega la ficha.
  const [taxDefinitionId, setTaxDefinitionId] = useState('');
  const [preferredSupplierId, setPreferredSupplierId] = useState('');
  const [markup, setMarkup] = useState('');
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [skus, setSkus] = useState<Record<string, string>>({});
  const [minimums, setMinimums] = useState<Record<string, string>>({});
  const [loadedSheet, setLoadedSheet] = useState<ArticleSheet | null>(null);
  useEffect(() => {
    if (!sheet || loadedSheet) return;
    setLoadedSheet(sheet);
    setTaxDefinitionId(sheet.article.taxDefinitionId ?? '');
    setPreferredSupplierId(sheet.article.preferredSupplierId ?? '');
    setMarkup(sheet.article.markupPercent === null ? '' : String(sheet.article.markupPercent));
    setPrices(Object.fromEntries(sheet.variants.map((v) => [v.id, String(v.unitPrice)])));
    setSkus(Object.fromEntries(sheet.variants.map((v) => [v.id, v.sku])));
    setMinimums(
      Object.fromEntries(
        sheet.variants.flatMap((v) =>
          v.stocks.map((s) => [`${v.id}|${s.warehouseId}`, s.minimumQuantity === null ? '' : String(s.minimumQuantity)]),
        ),
      ),
    );
  }, [sheet, loadedSheet]);

  // --- Qué cambió respecto de lo guardado
  const changes = useMemo(() => {
    const base = loadedSheet;
    const articlePatch: Record<string, unknown> = {};
    if (name.trim() !== article.name) articlePatch.name = name.trim();
    if ((categoryId || null) !== article.categoryId) articlePatch.categoryId = categoryId || null;
    if (unitOfMeasure !== article.unitOfMeasure) articlePatch.unitOfMeasure = unitOfMeasure;
    if ((description.trim() || null) !== (article.description?.trim() || null))
      articlePatch.description = description.trim() === '' ? null : description;
    if (isService !== article.isService) articlePatch.isService = isService;
    if (isPublished !== article.isPublished) articlePatch.isPublished = isPublished;
    if (isManufactured !== article.isManufactured) articlePatch.isManufactured = isManufactured;
    if (commercialLengthChanged) articlePatch.commercialLength = commercialLengthValue;
    const variantSkus: Array<{ id: string; sku: string }> = [];
    const variantPrices: Array<{ id: string; price: number }> = [];
    const minimumChanges: Array<{ variantId: string; warehouseId: string; quantity: number }> = [];
    if (base) {
      if ((taxDefinitionId || null) !== base.article.taxDefinitionId) articlePatch.taxDefinitionId = taxDefinitionId || null;
      if ((preferredSupplierId || null) !== base.article.preferredSupplierId)
        articlePatch.preferredSupplierId = preferredSupplierId || null;
      const markupValue = markup.trim() === '' ? null : Number(markup);
      if (markupValue !== base.article.markupPercent) articlePatch.markupPercent = markupValue;
      for (const v of base.variants) {
        const sku = (skus[v.id] ?? v.sku).trim();
        if (sku !== v.sku) variantSkus.push({ id: v.id, sku });
        const price = Number(prices[v.id]);
        if (prices[v.id] !== undefined && prices[v.id].trim() !== '' && price !== v.unitPrice)
          variantPrices.push({ id: v.id, price });
        for (const s of v.stocks) {
          const raw = minimums[`${v.id}|${s.warehouseId}`] ?? '';
          if (raw.trim() === '') continue;
          const quantity = Number(raw);
          if (quantity !== s.minimumQuantity) minimumChanges.push({ variantId: v.id, warehouseId: s.warehouseId, quantity });
        }
      }
    }
    return { articlePatch, variantSkus, variantPrices, minimumChanges };
  }, [
    loadedSheet,
    article,
    name,
    categoryId,
    unitOfMeasure,
    description,
    isService,
    isPublished,
    isManufactured,
    commercialLengthChanged,
    commercialLengthValue,
    taxDefinitionId,
    preferredSupplierId,
    markup,
    skus,
    prices,
    minimums,
  ]);
  const dirty =
    Object.keys(changes.articlePatch).length > 0 ||
    changes.variantSkus.length > 0 ||
    changes.variantPrices.length > 0 ||
    changes.minimumChanges.length > 0;
  const invalid =
    name.trim() === '' ||
    commercialLengthInvalid ||
    changes.variantSkus.some((v) => v.sku === '') ||
    changes.variantPrices.some((v) => !(v.price >= 0)) ||
    changes.minimumChanges.some((m) => !(m.quantity >= 0)) ||
    (markup.trim() !== '' && !(Number(markup) >= 0));

  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [confirmClose, setConfirmClose] = useState(false);

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['inventory-articles'] });
    void queryClient.invalidateQueries({ queryKey: ['article-sheet', article.id] });
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (Object.keys(changes.articlePatch).length > 0) {
        await inventoryApi.updateArticle(article.id, changes.articlePatch);
      }
      for (const v of changes.variantSkus) await inventoryApi.updateArticleVariantSku(v.id, v.sku);
      for (const v of changes.variantPrices) await inventoryApi.updateArticleVariantPrice(v.id, v.price);
      for (const m of changes.minimumChanges) {
        await inventoryApi.setMinimumStock({
          warehouseId: m.warehouseId,
          articleVariantId: m.variantId,
          minimumQuantity: m.quantity,
        });
      }
    },
    onSuccess: () => {
      setSaveError('');
      setSaved(true);
      // Lo guardado pasa a ser la base contra la que se miran los cambios.
      setLoadedSheet(null);
      invalidate();
      setTimeout(() => setSaved(false), 2000);
    },
    onError: (err) => setSaveError(apiMessage(err, 'No se pudieron guardar los cambios')),
  });

  // --- Lo que se guarda al instante (como antes)
  const [activeError, setActiveError] = useState('');
  const toggleActiveMutation = useMutation({
    mutationFn: () => inventoryApi.updateArticle(article.id, { active: !article.active }),
    onSuccess: () => {
      invalidate();
      setActiveError('');
    },
    onError: (err) => setActiveError(apiMessage(err, 'No se pudo cambiar el estado del artículo')),
  });
  const [brochureFile, setBrochureFile] = useState<File | null>(null);
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [attachError, setAttachError] = useState('');
  const brochureUploadMutation = useMutation({
    mutationFn: (f: File) => inventoryApi.uploadArticleBrochure(article.id, f),
    onSuccess: () => {
      invalidate();
      setBrochureFile(null);
    },
    onError: (err) => setAttachError(apiMessage(err, 'No se pudo subir el folleto')),
  });
  const brochureRemoveMutation = useMutation({
    mutationFn: () => inventoryApi.removeArticleBrochure(article.id),
    onSuccess: invalidate,
  });
  const zipUploadMutation = useMutation({
    mutationFn: (f: File) => inventoryApi.uploadArticleAttachmentZip(article.id, f),
    onSuccess: () => {
      invalidate();
      setZipFile(null);
    },
    onError: (err) => setAttachError(apiMessage(err, 'No se pudo subir el archivo ZIP')),
  });
  const zipRemoveMutation = useMutation({
    mutationFn: () => inventoryApi.removeArticleAttachmentZip(article.id),
    onSuccess: invalidate,
  });

  const variants = loadedSheet?.variants ?? [];
  const singleVariant = variants.length === 1 ? variants[0] : null;
  const missingTax = loadedSheet !== null && taxDefinitionId === '';
  const currentTaxName = taxOptions.find((t) => t.id === taxDefinitionId)?.name ?? null;
  const markupNumber = markup.trim() === '' ? null : Number(markup);
  const suppliers = suppliersQuery.data ?? [];

  function requestClose() {
    if (dirty) setConfirmClose(true);
    else onClose();
  }

  const totalStock = variants.reduce((sum, v) => sum + v.stocks.reduce((s, x) => s + x.quantity, 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border bg-card text-card-foreground shadow-2xl">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b p-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold">{article.name}</h2>
              {!article.active && (
                <Badge className="bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300">Inactivo</Badge>
              )}
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {singleVariant && <span className="font-mono">{singleVariant.sku}</span>}
              {loadedSheet && !article.isService && (
                <span>
                  Stock: {totalStock.toLocaleString('es-AR')} en {loadedSheet.warehouses.length}{' '}
                  {loadedSheet.warehouses.length === 1 ? 'depósito' : 'depósitos'}
                </span>
              )}
              {loadedSheet &&
                (missingTax ? (
                  <span className="rounded-full bg-amber-500/15 px-2 font-semibold text-amber-700 dark:text-amber-300">
                    Sin IVA
                  </span>
                ) : (
                  currentTaxName && <span className="rounded-full bg-muted px-2">{currentTaxName}</span>
                ))}
            </div>
          </div>
          <button onClick={requestClose} className="text-muted-foreground transition hover:text-foreground" aria-label="Cerrar">
            ✕
          </button>
        </div>

        <div className="flex gap-1 overflow-x-auto border-b px-4 pt-2" role="tablist">
          {TABS.filter((t) => !(article.isService && t.key === 'stock')).map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`relative whitespace-nowrap rounded-t-md px-3 py-2 text-sm transition ${
                tab === t.key ? 'border-b-2 border-primary font-semibold text-foreground' : 'border-b-2 border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.label}
              {t.key === 'precios' && missingTax && (
                <span className="absolute right-0.5 top-1.5 h-1.5 w-1.5 rounded-full bg-amber-500" title="Falta el IVA" />
              )}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {tab === 'general' && (
            <div className="flex flex-col gap-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm text-muted-foreground">Nombre</label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm text-muted-foreground">Categoría</label>
                  <Select
                    value={categoryId}
                    onChange={setCategoryId}
                    options={[{ value: '', label: 'Sin categoría' }, ...categories.map((c) => ({ value: c.id, label: c.name }))]}
                  />
                </div>
              </div>
              <div className={isLineal ? 'grid grid-cols-2 gap-3' : 'flex flex-col gap-1.5'}>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm text-muted-foreground">Unidad de medida</label>
                  <Select value={unitOfMeasure} onChange={setUnitOfMeasure} options={UNIT_OF_MEASURE_OPTIONS} disabled={unitLocked} />
                </div>
                {isLineal && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm text-muted-foreground">Largo comercial (mm)</label>
                    <Input
                      type="number"
                      min={1}
                      inputMode="decimal"
                      value={commercialLength}
                      onChange={(e) => setCommercialLength(e.target.value)}
                      placeholder="Ej. 6000"
                    />
                  </div>
                )}
              </div>
              {unitLockReasons.length > 0 && (
                <p className="-mt-2 text-xs text-muted-foreground">
                  La unidad no se puede cambiar: {unitLockReasons.join('; ')}. Si está mal cargada, desactivá este
                  artículo y creá uno nuevo con la unidad correcta.
                </p>
              )}
              {isLineal && (
                <p className="-mt-2 text-xs text-muted-foreground">
                  {commercialLengthInvalid
                    ? 'Ingresá un largo mayor a 0.'
                    : 'Se aplica a las barras que se reciban de ahora en más. Las que ya están en stock conservan su largo.'}
                </p>
              )}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm text-muted-foreground">Descripción</label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="Notas, detalles técnicos, especificaciones... (opcional, no se muestra en el catálogo)"
                />
              </div>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={isService} onChange={(e) => setIsService(e.target.checked)} className="h-4 w-4 accent-primary" />
                  Es servicio
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} className="h-4 w-4 accent-primary" />
                  Publicado
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={isManufactured} onChange={(e) => setIsManufactured(e.target.checked)} className="h-4 w-4 accent-primary" />
                  Se fabrica
                </label>
              </div>
            </div>
          )}

          {tab !== 'general' && tab !== 'adjuntos' && !loadedSheet && (
            <p className="text-sm text-muted-foreground">{sheetQuery.isError ? 'No se pudo cargar la ficha.' : 'Cargando...'}</p>
          )}

          {tab === 'precios' && loadedSheet && (
            <div className="flex flex-col gap-4">
              {missingTax && (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
                  <b>Este artículo no tiene IVA cargado.</b> Elegilo acá: se usa en las facturas nuevas y para calcular el
                  costo real.
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm text-muted-foreground">IVA del artículo</label>
                  <Select
                    value={taxDefinitionId}
                    onChange={setTaxDefinitionId}
                    options={[{ value: '', label: '— Sin IVA cargado —' }, ...taxOptions.map((t) => ({ value: t.id, label: t.name }))]}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm text-muted-foreground">Proveedor preferido</label>
                  <Select
                    value={preferredSupplierId}
                    onChange={setPreferredSupplierId}
                    options={[{ value: '', label: '— Ninguno —' }, ...suppliers.map((s) => ({ value: s.id, label: s.name }))]}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm text-muted-foreground">% remarca</label>
                  <Input type="number" min={0} step="any" value={markup} onChange={(e) => setMarkup(e.target.value)} placeholder="La de Preferencias" />
                </div>
              </div>

              {singleVariant ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm text-muted-foreground">
                        Precio de venta{' '}
                        {salePriceTag && (
                          <span className="rounded-full bg-primary/10 px-1.5 py-px text-[11px] font-semibold text-primary">{salePriceTag}</span>
                        )}
                      </label>
                      <Input
                        type="number"
                        min={0}
                        step="any"
                        value={prices[singleVariant.id] ?? ''}
                        onChange={(e) => setPrices((p) => ({ ...p, [singleVariant.id]: e.target.value }))}
                      />
                    </div>
                    <p className="self-end pb-2 text-xs text-muted-foreground sm:col-span-2">
                      {salePriceTag === 'final'
                        ? 'Es lo que paga el cliente: facturás con comprobante C. '
                        : salePriceTag === 'sin IVA'
                          ? 'Al facturar se suma el IVA. '
                          : ''}
                      Cambiar el precio queda en el historial de precios.
                    </p>
                  </div>
                  <CostBox
                    variant={singleVariant}
                    markup={markupNumber}
                    onUsePrice={(value) => setPrices((p) => ({ ...p, [singleVariant.id]: value.toFixed(2) }))}
                  />
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Este artículo tiene {variants.length} variantes: el precio y el costo de cada una están en la pestaña
                  &quot;Variantes&quot;.
                </p>
              )}
              <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                El costo no se edita a mano: sale de las compras (órdenes y remitos), la producción y los movimientos de
                stock. Cambiar el IVA afecta a las facturas <b>nuevas</b>; las ya emitidas no cambian.
              </p>
            </div>
          )}

          {tab === 'variantes' && loadedSheet && (
            <div className="flex flex-col gap-3">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="pb-2 pr-3">SKU</th>
                      <th className="pb-2 pr-3">Variante</th>
                      <th className="pb-2 pr-3 text-right">Precio{salePriceTag ? ` (${salePriceTag})` : ''}</th>
                      <th className="pb-2 pr-3 text-right">Último costo</th>
                      <th className="pb-2 text-right">Stock</th>
                    </tr>
                  </thead>
                  <tbody>
                    {variants.map((v) => (
                      <tr key={v.id} className="border-b last:border-0">
                        <td className="py-2 pr-3">
                          <Input
                            value={skus[v.id] ?? ''}
                            onChange={(e) => setSkus((s) => ({ ...s, [v.id]: e.target.value }))}
                            className="h-8 w-36 font-mono text-xs"
                            aria-label={`SKU de ${v.label ?? v.sku}`}
                          />
                        </td>
                        <td className="py-2 pr-3 text-muted-foreground">{v.label ?? '—'}</td>
                        <td className="py-2 pr-3 text-right">
                          <Input
                            type="number"
                            min={0}
                            step="any"
                            value={prices[v.id] ?? ''}
                            onChange={(e) => setPrices((p) => ({ ...p, [v.id]: e.target.value }))}
                            className="ml-auto h-8 w-28 text-right tabular-nums"
                            aria-label={`Precio de ${v.label ?? v.sku}`}
                          />
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
                          {v.lastCost ? formatMoney(v.lastCost.amount) : '—'}
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {v.stocks.reduce((s, x) => s + x.quantity, 0).toLocaleString('es-AR')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                Se puede corregir el SKU y el precio de cada variante. Agregar variantes nuevas a un artículo que ya tiene
                movimientos queda para otra etapa.
              </p>
            </div>
          )}

          {tab === 'stock' && loadedSheet && (
            <div className="flex flex-col gap-3">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      {variants.length > 1 && <th className="pb-2 pr-3">Variante</th>}
                      <th className="pb-2 pr-3">Depósito</th>
                      <th className="pb-2 pr-3 text-right">Stock actual</th>
                      <th className="pb-2 text-right">Stock mínimo para alertas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {variants.flatMap((v) =>
                      loadedSheet.warehouses.map((w) => {
                        const stock = v.stocks.find((s) => s.warehouseId === w.id);
                        const key = `${v.id}|${w.id}`;
                        return (
                          <tr key={key} className="border-b last:border-0">
                            {variants.length > 1 && <td className="py-2 pr-3 text-muted-foreground">{v.label ?? v.sku}</td>}
                            <td className="py-2 pr-3">{w.name}</td>
                            <td className="py-2 pr-3 text-right tabular-nums">{(stock?.quantity ?? 0).toLocaleString('es-AR')}</td>
                            <td className="py-2 text-right">
                              <Input
                                type="number"
                                min={0}
                                step="any"
                                value={minimums[key] ?? ''}
                                onChange={(e) => setMinimums((m) => ({ ...m, [key]: e.target.value }))}
                                placeholder="—"
                                className="ml-auto h-8 w-28 text-right tabular-nums"
                                aria-label={`Stock mínimo en ${w.name}`}
                              />
                            </td>
                          </tr>
                        );
                      }),
                    )}
                  </tbody>
                </table>
              </div>
              <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                El stock actual no se edita acá: se mueve con compras, ventas, producción o un &quot;Nuevo movimiento&quot;
                (ajuste) desde Inventario.
              </p>
            </div>
          )}

          {tab === 'adjuntos' && (
            <div className="flex flex-col gap-4">
              <AttachmentBlock
                icon={<FileText className="h-4 w-4" />}
                title="Folleto (PDF)"
                currentUrl={article.brochureUrl}
                currentLabel="Ver folleto actual"
                accept="application/pdf"
                file={brochureFile}
                onFile={setBrochureFile}
                onUpload={() => brochureFile && brochureUploadMutation.mutate(brochureFile)}
                uploading={brochureUploadMutation.isPending}
                uploadLabel="Subir folleto"
                onRemove={() => brochureRemoveMutation.mutate()}
                removing={brochureRemoveMutation.isPending}
                removeLabel="Quitar folleto"
              />
              <AttachmentBlock
                icon={<FileArchive className="h-4 w-4" />}
                title="Adjunto (ZIP)"
                currentUrl={article.attachmentZipUrl}
                currentLabel="Descargar ZIP actual"
                accept=".zip,application/zip,application/x-zip-compressed"
                file={zipFile}
                onFile={setZipFile}
                onUpload={() => zipFile && zipUploadMutation.mutate(zipFile)}
                uploading={zipUploadMutation.isPending}
                uploadLabel="Subir ZIP"
                onRemove={() => zipRemoveMutation.mutate()}
                removing={zipRemoveMutation.isPending}
                removeLabel="Quitar ZIP"
              />
              <p className="text-xs text-muted-foreground">Los adjuntos se guardan al subirlos o quitarlos.</p>
              {attachError && <p className="text-sm text-destructive">{attachError}</p>}
            </div>
          )}
        </div>

        {confirmClose && (
          <div role="alertdialog" className="flex flex-wrap items-center justify-between gap-2 border-t bg-amber-500/10 px-5 py-3 text-sm">
            <span>Tenés cambios sin guardar. ¿Cerrar igual?</span>
            <span className="flex gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => setConfirmClose(false)}>
                Seguir editando
              </Button>
              <Button type="button" size="sm" variant="destructive" onClick={onClose}>
                Cerrar sin guardar
              </Button>
            </span>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/40 px-5 py-3">
          <div className="flex flex-col gap-1">
            <button
              onClick={() => toggleActiveMutation.mutate()}
              disabled={toggleActiveMutation.isPending}
              className={
                article.active
                  ? 'rounded-lg border border-destructive/30 px-3 py-1.5 text-xs text-destructive transition hover:bg-destructive/10 disabled:opacity-50'
                  : 'rounded-lg border border-green-300 px-3 py-1.5 text-xs text-green-600 transition hover:bg-green-50 disabled:opacity-50 dark:border-green-800 dark:text-green-400 dark:hover:bg-green-950'
              }
            >
              {toggleActiveMutation.isPending ? 'Guardando...' : article.active ? 'Desactivar artículo' : 'Activar artículo'}
            </button>
            {activeError && <p className="text-xs text-destructive">{activeError}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {saveError ? (
              <span className="text-xs text-destructive">{saveError}</span>
            ) : dirty ? (
              <span className="text-xs text-amber-600 dark:text-amber-400">● Tenés cambios sin guardar</span>
            ) : (
              saved && <span className="text-xs text-green-600 dark:text-green-400">✓ Cambios guardados</span>
            )}
            <Button type="button" variant="ghost" onClick={requestClose}>
              Cerrar
            </Button>
            <Button type="button" onClick={() => saveMutation.mutate()} disabled={!dirty || invalid || saveMutation.isPending}>
              {saveMutation.isPending ? 'Guardando...' : 'Guardar cambios'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Costo de sólo lectura de una variante: último costo real, promedio del
 * stock y precio sugerido (costo × remarca). */
function CostBox({
  variant,
  markup,
  onUsePrice,
}: {
  variant: ArticleSheet['variants'][number];
  markup: number | null;
  onUsePrice: (price: number) => void;
}) {
  const baseCost = variant.lastCost?.amount ?? variant.avgUnitCost;
  const suggested = baseCost !== null && baseCost !== undefined && markup !== null ? baseCost * (1 + markup / 100) : null;
  return (
    <div className="grid gap-3 rounded-lg border border-dashed p-3 text-xs text-muted-foreground sm:grid-cols-3" aria-label="Costo (sólo lectura)">
      <div>
        Último costo real
        <b className="block text-base text-foreground tabular-nums">{variant.lastCost ? formatMoney(variant.lastCost.amount) : '—'}</b>
        {variant.lastCost && <span>{new Date(variant.lastCost.at).toLocaleDateString('es-AR')}</span>}
      </div>
      <div>
        Costo promedio del stock
        <b className="block text-base text-foreground tabular-nums">
          {variant.avgUnitCost !== null ? formatMoney(variant.avgUnitCost) : '—'}
        </b>
      </div>
      <div>
        Sugerido (costo × remarca)
        <b className="block text-base text-foreground tabular-nums">{suggested !== null ? formatMoney(suggested) : '—'}</b>
        {suggested !== null && (
          <button type="button" onClick={() => onUsePrice(suggested)} className="text-primary underline">
            Usar este precio
          </button>
        )}
      </div>
    </div>
  );
}

function AttachmentBlock(props: {
  icon: React.ReactNode;
  title: string;
  currentUrl: string | null;
  currentLabel: string;
  accept: string;
  file: File | null;
  onFile: (f: File | null) => void;
  onUpload: () => void;
  uploading: boolean;
  uploadLabel: string;
  onRemove: () => void;
  removing: boolean;
  removeLabel: string;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {props.icon}
        {props.title}
      </div>
      {props.currentUrl && (
        <a
          href={resolveUploadUrl(props.currentUrl) ?? undefined}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-primary hover:underline"
        >
          {props.currentLabel}
        </a>
      )}
      <input type="file" accept={props.accept} onChange={(e) => props.onFile(e.target.files?.[0] ?? null)} className="text-sm" />
      <div className="flex justify-between gap-3">
        {props.currentUrl && !props.file ? (
          <Button
            size="sm"
            variant="outline"
            className="border-destructive/40 text-destructive hover:bg-destructive/10"
            onClick={props.onRemove}
            disabled={props.removing}
          >
            {props.removing ? 'Quitando...' : props.removeLabel}
          </Button>
        ) : (
          <span />
        )}
        <Button size="sm" onClick={props.onUpload} disabled={!props.file || props.uploading}>
          {props.uploading ? 'Subiendo...' : props.uploadLabel}
        </Button>
      </div>
    </div>
  );
}
