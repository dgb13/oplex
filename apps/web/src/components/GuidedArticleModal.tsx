'use client';

import ArticleFormModal, { type ArticleFormInitial, type CreatedArticleVariantRef } from '@/components/ArticleFormModal';
import { CostVatToggle } from '@/components/CostVat';
import ImageCropper from '@/components/ImageCropper';
import Select from '@/components/ui/Select';
import { companiesApi } from '@/lib/companies';
import { inventoryApi, type CreateArticleInput, type PhotoSuggestion } from '@/lib/inventory';
import { useCostIncludesVat, useTaxOptions } from '@/lib/vatCost';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

type Kind = 'insumo' | 'producto' | 'servicio';
type How = 'pack' | 'unit' | 'bar' | 'sheet' | 'kilo';
type PackUnit = 'kg' | 'g' | 'L' | 'ml';

const KINDS: { id: Kind; title: string; hint: string }[] = [
  { id: 'insumo', title: 'Un insumo', hint: 'Lo uso para fabricar. No lo vendo.' },
  { id: 'producto', title: 'Un producto que vendo', hint: 'Lo compro o lo fabrico y lo vendo.' },
  { id: 'servicio', title: 'Un servicio', hint: 'No lleva stock. Ej: envío, armado.' },
];

const HOWS: Record<'insumo' | 'producto', { id: How; title: string; hint: string }[]> = {
  insumo: [
    { id: 'pack', title: 'En bolsa, bidón o caja', hint: 'Por peso o volumen: harina, aceite.' },
    { id: 'unit', title: 'Por unidad', hint: 'Se cuentan: huevos, cajas, bandejas.' },
    { id: 'bar', title: 'En barras', hint: 'Se cortan por largo: caños, perfiles.' },
    { id: 'sheet', title: 'En planchas', hint: 'Se cortan por superficie: chapa, MDF.' },
  ],
  producto: [
    { id: 'unit', title: 'Por unidad', hint: 'Ej: prepizza, docena de facturas.' },
    { id: 'kilo', title: 'Por kilo', hint: 'Se pesa al vender: pan, masas secas.' },
  ],
};

const PACK_NAMES = ['bolsa', 'bidón', 'caja', 'paquete', 'balde', 'lata'];
// La unidad base de stock es la misma que usa el resto del sistema (gr/ml).
const PACK_UNITS: Record<PackUnit, { base: 'gr' | 'ml'; factor: number }> = {
  kg: { base: 'gr', factor: 1000 },
  g: { base: 'gr', factor: 1 },
  L: { base: 'ml', factor: 1000 },
  ml: { base: 'ml', factor: 1 },
};

const MONEY = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 });
const QTY = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 3 });

const inputClass =
  'h-9 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

interface Draft {
  kind: Kind | '';
  how: How | '';
  name: string;
  packName: string;
  packQty: string;
  packUnit: PackUnit;
  barLength: string;
  sheetWidth: string;
  sheetLength: string;
  cost: string;
  have: string;
  price: string;
  code: string;
  codeTouched: boolean;
  min: string;
  supplierId: string;
  categoryId: string;
  catalog: boolean;
}

function freshDraft(kind: Kind | '', how: How | '', name = ''): Draft {
  return {
    kind,
    how,
    name,
    packName: 'bolsa',
    packQty: '',
    packUnit: 'kg',
    barLength: '6000',
    sheetWidth: '1220',
    sheetLength: '2440',
    cost: '',
    have: '',
    price: '',
    code: '',
    codeTouched: false,
    min: '',
    supplierId: '',
    categoryId: '',
    catalog: kind !== 'insumo',
  };
}

type Photo =
  | { kind: 'suggested'; suggestion: PhotoSuggestion }
  | { kind: 'own'; file: File; previewUrl: string };

/** Lo que va quedando guardado de un intento: si falla un paso (la foto, el
 * stock), reintentar no vuelve a crear el artículo. */
interface Progress {
  articleId?: string;
  variant?: { id: string; sku: string; unitPrice: number };
  stockDone?: boolean;
}

const num = (v: string) => (v.trim() === '' ? NaN : Number(v.replace(',', '.')));

function plural(word: string, k: number): string {
  if (k === 1) return word;
  if (word.endsWith('ón')) return word.slice(0, -2) + 'ones';
  return /[aeiou]$/.test(word) ? word + 's' : word + 'es';
}

const CODE_SKIP_WORDS = new Set(['DE', 'DEL', 'LA', 'EL', 'LOS', 'LAS', 'Y', 'CON', 'SIN', 'PARA', 'POR', 'EN', 'X']);

/** "Harina 000" -> "HAR-000": código corto y legible, editable en "Más datos". */
function suggestCode(name: string): string {
  const words = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    // "Nivel de aluminio" -> NIV-ALU, no NIV-DE.
    .filter((w) => w && !CODE_SKIP_WORDS.has(w));
  return words
    .slice(0, 2)
    .map((w) => w.slice(0, 3))
    .join('-');
}

/** Cuánto stock trae una unidad de compra, en la unidad en que se guarda el
 * stock (gr/ml, mm, m², o 1 para unidades y kilos). */
function perPurchaseUnit(d: Draft): number {
  if (d.how === 'pack') return num(d.packQty) * PACK_UNITS[d.packUnit].factor;
  if (d.how === 'bar') return num(d.barLength);
  if (d.how === 'sheet') return (num(d.sheetWidth) * num(d.sheetLength)) / 1e6;
  return 1;
}

function summaryLines(d: Draft): string[] {
  const cost = num(d.cost);
  const have = num(d.have);
  const lines: string[] = [];
  if (d.kind === 'servicio' || !d.how) return lines;
  if (d.how === 'pack') {
    const per = perPurchaseUnit(d);
    if (!(per > 0)) return lines;
    const { base } = PACK_UNITS[d.packUnit];
    if (have > 0) {
      lines.push(
        `Stock: ${QTY.format(have * per)} ${base} (${QTY.format(have)} ${plural(d.packName, have)} de ${QTY.format(num(d.packQty))} ${d.packUnit})`,
      );
    }
    if (cost > 0) {
      lines.push(
        `Costo: ${MONEY.format(cost / per)} por ${base} · ${MONEY.format((cost / per) * 1000)} por ${base === 'gr' ? 'kg' : 'L'}`,
      );
    }
  } else if (d.how === 'bar') {
    const len = num(d.barLength);
    if (!(len > 0)) return lines;
    if (have > 0) lines.push(`Stock: ${QTY.format(have)} barras de ${QTY.format(len)} mm (${QTY.format((have * len) / 1000)} m en total)`);
    if (cost > 0) lines.push(`Costo: ${MONEY.format((cost / len) * 1000)} por metro`);
  } else if (d.how === 'sheet') {
    const area = perPurchaseUnit(d);
    if (!(area > 0)) return lines;
    if (have > 0) lines.push(`Stock: ${QTY.format(have)} planchas (${QTY.format(have * area)} m²)`);
    if (cost > 0) lines.push(`Costo: ${MONEY.format(cost / area)} por m²`);
  } else if (have > 0) {
    lines.push(d.how === 'kilo' ? `Stock: ${QTY.format(have)} kg` : `Stock: ${QTY.format(have)} unidades`);
  }
  return lines;
}

function validate(d: Draft, fixedKind: boolean): string[] {
  const e: string[] = [];
  if (!d.kind && !fixedKind) e.push('qué es');
  if (d.kind && d.kind !== 'servicio' && !d.how) e.push(d.kind === 'insumo' ? 'cómo lo comprás' : 'cómo lo vendés');
  if (!d.name.trim()) e.push('el nombre');
  if (d.how === 'pack' && !(num(d.packQty) > 0)) e.push(`el tamaño de la ${d.packName}`);
  if (d.how === 'bar' && !(num(d.barLength) > 0)) e.push('el largo de cada barra');
  if (d.how === 'bar' && d.have.trim() !== '' && !Number.isInteger(num(d.have))) e.push('las barras, en números enteros');
  if (d.how === 'sheet' && !(num(d.sheetWidth) > 0 && num(d.sheetLength) > 0)) e.push('las medidas de la plancha');
  if ((d.kind === 'producto' || d.kind === 'servicio') && !(num(d.price) > 0)) e.push('el precio de venta');
  if (num(d.have) > 0 && !(num(d.cost) > 0)) e.push('el costo, para valorizar el stock que cargaste');
  return e;
}

interface Props {
  onClose: () => void;
  // Desde un selector de artículos (ArticlePicker, Facturación): se usa el
  // artículo recién creado en vez de esperar el refetch de la lista.
  onSaved?: (created: CreatedArticleVariantRef) => void;
  // Lo que se tipeó en el buscador antes de tocar "+ Crear".
  initialName?: string;
  // Desde una receta: siempre es un insumo, no se pregunta.
  fixedKind?: 'insumo';
  saveLabel?: string;
}

/**
 * Alta guiada de artículos (boceto aprobado "Alta guiada de artículos",
 * 2026-10-17): tres preguntas en vez de cinco pestañas - qué es, cómo se
 * compra o vende, y los datos en el idioma del usuario ("la bolsa de 25 kg
 * a $20.000, tengo 20"). Pasa solo a la unidad de stock del sistema (gr/ml,
 * mm, m²), propone el código y avisa todos los faltantes juntos.
 *
 * Lo que no cubre (variantes por talle/color, folleto y adjuntos) sigue en
 * ArticleFormModal, que se abre desde "Formulario completo".
 */
export default function GuidedArticleModal({ onClose, onSaved, initialName = '', fixedKind, saveLabel }: Props) {
  const queryClient = useQueryClient();
  const articlesQuery = useQuery({ queryKey: ['inventory-articles'], queryFn: () => inventoryApi.listArticles() });
  const warehousesQuery = useQuery({ queryKey: ['inventory-warehouses'], queryFn: inventoryApi.listWarehouses });
  const categoriesQuery = useQuery({ queryKey: ['inventory-categories'], queryFn: inventoryApi.listCategories });
  const suppliersQuery = useQuery({ queryKey: ['companies', 'SUPPLIER'], queryFn: () => companiesApi.list('SUPPLIER') });
  const taxOptions = useTaxOptions().data ?? [];
  const [costIncludesVat, setCostIncludesVat] = useCostIncludesVat();

  const [draft, setDraft] = useState<Draft>(() => freshDraft(fixedKind ?? '', '', initialName));
  const [taxDefinitionId, setTaxDefinitionId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [serverError, setServerError] = useState('');
  const [savedNames, setSavedNames] = useState<string[]>([]);
  // Con valor, se muestra el formulario completo arrancando con eso.
  const [advanced, setAdvanced] = useState<ArticleFormInitial | null>(null);
  const progress = useRef<Progress>({});
  const nameRef = useRef<HTMLInputElement>(null);

  // Fotos
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [searchedFor, setSearchedFor] = useState<string | null>(null);
  const [picked, setPicked] = useState(-1);
  const [pendingCropFile, setPendingCropFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [trackEdges, setTrackEdges] = useState({ start: true, end: false });

  useEffect(() => {
    if (taxDefinitionId === '' && taxOptions.length > 0) {
      setTaxDefinitionId(taxOptions.find((t) => t.code === 'IVA21')?.id ?? taxOptions[0].id);
    }
  }, [taxOptions, taxDefinitionId]);

  useEffect(() => {
    const list = warehousesQuery.data;
    if (warehouseId === '' && list && list.length > 0) setWarehouseId(list[0].id);
  }, [warehousesQuery.data, warehouseId]);

  useEffect(() => {
    return () => {
      if (photo?.kind === 'own') URL.revokeObjectURL(photo.previewUrl);
    };
  }, [photo]);

  const photosQuery = useQuery({
    queryKey: ['photo-suggestions', searchedFor],
    queryFn: () => inventoryApi.searchPhotoSuggestions(searchedFor ?? ''),
    enabled: !!searchedFor,
    staleTime: 10 * 60_000,
  });
  const suggestions = photosQuery.data ?? [];

  const takenCodes = useMemo(() => {
    const set = new Set<string>();
    for (const a of articlesQuery.data ?? []) for (const v of a.variants) set.add(v.sku.toUpperCase());
    return set;
  }, [articlesQuery.data]);

  // Código propuesto sin chocar con uno existente: HAR-000, HAR-000-2...
  const proposedCode = useMemo(() => {
    const base = suggestCode(draft.name) || 'ART';
    if (!takenCodes.has(base)) return base;
    let i = 2;
    while (takenCodes.has(`${base}-${i}`)) i++;
    return `${base}-${i}`;
  }, [draft.name, takenCodes]);
  const code = draft.codeTouched ? draft.code : proposedCode;

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  // Los faltantes se recalculan mientras se corrige, una vez mostrados.
  useEffect(() => {
    if (errors.length > 0) setErrors(validate(draft, !!fixedKind));
  }, [draft]);

  function chooseKind(kind: Kind) {
    setDraft((d) => {
      const hows = kind === 'servicio' ? [] : HOWS[kind];
      const how = hows.some((h) => h.id === d.how) ? d.how : '';
      return { ...freshDraft(kind, how, d.name), code: d.code, codeTouched: d.codeTouched };
    });
  }

  const warehouses = warehousesQuery.data ?? [];
  const lines = summaryLines(draft);
  const needsMoreThanName = draft.kind === 'servicio' || !!draft.how;
  const purchaseWord =
    draft.how === 'pack' ? draft.packName : draft.how === 'bar' ? 'barra' : draft.how === 'sheet' ? 'plancha' : null;

  const mutation = useMutation({
    mutationFn: async (): Promise<CreatedArticleVariantRef> => {
      const d = draft;
      const p = progress.current;
      const have = num(d.have) > 0 ? num(d.have) : 0;
      const minPurchase = num(d.min) > 0 ? num(d.min) : 0;
      const cost = num(d.cost) > 0 ? num(d.cost) : undefined;
      const isService = d.kind === 'servicio';
      const measurementType: CreateArticleInput['measurementType'] =
        d.how === 'pack' ? 'CONTINUOUS' : d.how === 'bar' ? 'LINEAL_1D' : d.how === 'sheet' ? 'SURFACE_2D' : 'DISCRETE';
      const per = perPurchaseUnit(d);
      // Costo por unidad de stock (gr/ml, mm, m², unidad o kilo).
      const costPerStockUnit = cost === undefined ? undefined : cost / per;

      let targetWarehouse = warehouseId;
      if (!isService && (have > 0 || minPurchase > 0) && !targetWarehouse) {
        // Sin depósitos (se pueden borrar todos): se crea el principal.
        const created = await inventoryApi.createWarehouse({ name: 'Depósito principal' });
        targetWarehouse = created.id;
        setWarehouseId(created.id);
        void queryClient.invalidateQueries({ queryKey: ['inventory-warehouses'] });
      }

      if (!p.articleId) {
        const article = await inventoryApi.createArticle({
          name: d.name.trim(),
          unitOfMeasure: d.how === 'kilo' ? 'KG' : 'UNIT',
          categoryId: d.categoryId || undefined,
          isService,
          isPublished: d.catalog,
          isSupply: d.kind === 'insumo',
          measurementType,
          taxDefinitionId: taxDefinitionId || undefined,
          purchaseSize: d.how === 'pack' ? per : undefined,
          baseUnit: d.how === 'pack' ? PACK_UNITS[d.packUnit].base : undefined,
          commercialLength: d.how === 'bar' ? num(d.barLength) : undefined,
          sheetWidth: d.how === 'sheet' ? num(d.sheetWidth) : undefined,
          sheetLength: d.how === 'sheet' ? num(d.sheetLength) : undefined,
        });
        p.articleId = article.id;
        if (d.supplierId) {
          await inventoryApi.updateArticle(article.id, { preferredSupplierId: d.supplierId });
        }
      }
      const articleId = p.articleId;

      if (!p.variant) {
        const variant = await inventoryApi.createArticleVariant({
          articleId,
          sku: code.trim(),
          // Un insumo no se vende: queda en $0, como en el formulario completo.
          unitPrice: d.kind === 'insumo' ? 0 : num(d.price),
          costPrice: costPerStockUnit,
          costIncludesVat,
        });
        p.variant = { id: variant.id, sku: variant.sku, unitPrice: Number(variant.unitPrice) };
      }
      const variantId = p.variant.id;

      if (!isService && !p.stockDone && targetWarehouse) {
        if (minPurchase > 0) {
          await inventoryApi.setMinimumStock({
            warehouseId: targetWarehouse,
            articleVariantId: variantId,
            minimumQuantity: minPurchase * per,
          });
        }
        if (have > 0 && cost !== undefined) {
          if (d.how === 'bar') {
            await inventoryApi.recordInitialBars({
              warehouseId: targetWarehouse,
              articleVariantId: variantId,
              bars: have,
              costPerBar: cost,
              costIncludesVat,
            });
          } else {
            await inventoryApi.recordMovement({
              warehouseId: targetWarehouse,
              articleVariantId: variantId,
              type: 'PURCHASE_IN',
              quantity: have * per,
              unitCost: costPerStockUnit,
              costIncludesVat,
            });
          }
        }
        p.stockDone = true;
      }

      if (photo?.kind === 'suggested') {
        await inventoryApi.saveSuggestedImage(articleId, {
          url: photo.suggestion.url,
          credit: photo.suggestion.credit,
        });
      } else if (photo?.kind === 'own') {
        await inventoryApi.uploadArticleImage(articleId, photo.file);
      }

      return {
        variantId,
        articleId,
        articleName: d.name.trim(),
        sku: p.variant.sku,
        unitPrice: p.variant.unitPrice,
        isManufactured: false,
        measurementType: measurementType ?? 'DISCRETE',
      };
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? err.message ?? 'No se pudo guardar';
      const text = Array.isArray(message) ? message.join(', ') : message;
      setServerError(
        progress.current.articleId ? `El artículo quedó creado, pero falló un paso: ${text}. Tocá Guardar de nuevo para reintentarlo.` : text,
      );
    },
  });

  function save(another: boolean) {
    setServerError('');
    const found = validate(draft, !!fixedKind);
    if (!code.trim()) found.push('el código');
    setErrors(found);
    if (found.length > 0) return;
    mutation.mutate(undefined, {
      onSuccess: (created) => {
        void queryClient.invalidateQueries({ queryKey: ['inventory-articles'] });
        progress.current = {};
        if (!another) {
          onSaved?.(created);
          onClose();
          return;
        }
        // Mantiene las respuestas 1 y 2 y deja escribiendo el siguiente.
        setSavedNames((prev) => [created.articleName, ...prev]);
        setDraft((d) => ({ ...freshDraft(d.kind, d.how), packName: d.packName, packUnit: d.packUnit, catalog: d.catalog }));
        setPhoto(null);
        setSearchedFor(null);
        setPicked(-1);
        setErrors([]);
        nameRef.current?.focus();
      },
    });
  }

  /** Pasa lo cargado al formulario completo, en sus unidades (ver
   * ArticleFormInitial). La foto sugerida no viaja: se guarda bajándola
   * desde la API, y el formulario completo sólo sube archivos. */
  function openFullForm(withVariants: boolean) {
    const d = draft;
    const per = perPurchaseUnit(d);
    const toStock = (v: string) => (num(v) > 0 && per > 0 ? String(Number((num(v) * per).toFixed(4))) : '');
    // El formulario completo toma el costo por presentación en bolsas y
    // bidones, pero por mm o m² en barras y planchas.
    const perLength = d.how === 'bar' || d.how === 'sheet';
    const cost = perLength && num(d.cost) > 0 && per > 0 ? String(Number((num(d.cost) / per).toFixed(6))) : d.cost;
    setAdvanced({
      name: d.name.trim(),
      categoryId: d.categoryId,
      isService: d.kind === 'servicio',
      isPublished: d.catalog,
      isSupply: d.kind === 'insumo',
      hasVariants: withVariants,
      measurementType:
        d.how === 'pack' ? 'CONTINUOUS' : d.how === 'bar' ? 'LINEAL_1D' : d.how === 'sheet' ? 'SURFACE_2D' : 'DISCRETE',
      purchaseSize: d.how === 'pack' && per > 0 ? String(per) : undefined,
      baseUnit: d.how === 'pack' ? PACK_UNITS[d.packUnit].base : undefined,
      commercialLength: d.how === 'bar' ? d.barLength : undefined,
      sheetWidth: d.how === 'sheet' ? d.sheetWidth : undefined,
      sheetLength: d.how === 'sheet' ? d.sheetLength : undefined,
      preferredSupplierId: d.supplierId,
      cost,
      price: d.price,
      taxDefinitionId,
      sku: d.name.trim() ? code : '',
      unitOfMeasure: d.how === 'kilo' ? 'KG' : 'UNIT',
      warehouseId,
      // Las barras no tienen stock inicial en el formulario completo.
      stock: d.how === 'bar' ? '' : toStock(d.have),
      minimumStock: toStock(d.min),
      imageFile: photo?.kind === 'own' ? photo.file : undefined,
    });
  }

  function updateTrackEdges() {
    const el = trackRef.current;
    if (!el) return;
    setTrackEdges({ start: el.scrollLeft < 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
  }
  useEffect(updateTrackEdges, [suggestions.length]);

  if (advanced) {
    return <ArticleFormModal onClose={onClose} onSaved={onSaved} initial={advanced} />;
  }

  const trimmedName = draft.name.trim();
  const staleSearch = searchedFor !== null && searchedFor !== trimmedName;
  const step = (n: number) => (fixedKind ? n - 1 : n);
  const minPlaceholder = purchaseWord ? `2 ${plural(purchaseWord, 2)}` : '';

  const photoBlock = (() => {
    if (photo) {
      const src = photo.kind === 'own' ? photo.previewUrl : photo.suggestion.thumbUrl;
      return (
        <div className="flex items-center gap-3">
          <img src={src} alt="" className="h-12 w-12 rounded-lg border object-cover" />
          <div className="min-w-0 text-sm">
            <p className="font-medium">Foto elegida</p>
            <p className="truncate text-xs text-muted-foreground">
              {photo.kind === 'own' ? 'Subida por vos' : photo.suggestion.credit}
            </p>
          </div>
          <span className="ml-auto flex gap-3 text-xs font-medium text-primary">
            <button type="button" onClick={() => { setPhoto(null); if (trimmedName) setSearchedFor(trimmedName); }}>
              Cambiar
            </button>
            <button type="button" onClick={() => { setPhoto(null); setSearchedFor(null); setPicked(-1); }}>
              Quitar
            </button>
          </span>
        </div>
      );
    }
    if (searchedFor === null || staleSearch) {
      return (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!trimmedName}
            onClick={() => { setPicked(-1); setSearchedFor(trimmedName); }}
            className="rounded-lg border bg-card px-3 py-1.5 text-sm font-medium hover:border-primary disabled:opacity-50"
          >
            {staleSearch ? 'Buscar de nuevo' : 'Buscar fotos'} de “{trimmedName || '…'}”
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            Subir la mía
          </button>
        </div>
      );
    }
    if (photosQuery.isLoading) {
      return (
        <div className="grid grid-cols-3 gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="aspect-square animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      );
    }
    if (suggestions.length === 0) {
      return (
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>No encontramos fotos para “{searchedFor}”.</span>
          <button type="button" className="font-medium text-primary" onClick={() => fileRef.current?.click()}>
            Subir la mía
          </button>
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-2">
        <div className="relative">
          {!trackEdges.start && (
            <CarouselArrow side="left" onClick={() => trackRef.current?.scrollBy({ left: -trackRef.current.clientWidth, behavior: 'smooth' })} />
          )}
          <div
            ref={trackRef}
            onScroll={updateTrackEdges}
            className="flex snap-x snap-mandatory gap-2 overflow-x-auto scroll-smooth p-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {suggestions.map((s, i) => (
              <button
                key={s.url}
                type="button"
                onClick={() => setPicked(i)}
                aria-pressed={picked === i}
                aria-label={`Foto sugerida ${i + 1}, ${s.source === 'off' ? 'Open Food Facts' : 'Pexels'}`}
                className={`relative flex w-[calc((100%-1rem)/3)] shrink-0 snap-start flex-col overflow-hidden rounded-lg border-2 bg-card text-left ${
                  picked === i ? 'border-primary' : 'border-transparent'
                }`}
              >
                <img src={s.thumbUrl} alt="" loading="lazy" className="aspect-square w-full bg-white object-contain" />
                <span
                  className={`absolute left-1.5 top-1.5 rounded-full border bg-card px-1.5 text-[10px] font-semibold ${
                    s.source === 'off' ? 'text-emerald-600 dark:text-emerald-400' : 'text-primary'
                  }`}
                >
                  {s.source === 'off' ? 'Open Food Facts' : 'Pexels'}
                </span>
                {picked === i && (
                  <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                    ✓
                  </span>
                )}
                <small className="truncate px-1.5 py-1 text-[10.5px] text-muted-foreground">{s.credit}</small>
              </button>
            ))}
          </div>
          {!trackEdges.end && (
            <CarouselArrow side="right" onClick={() => trackRef.current?.scrollBy({ left: trackRef.current.clientWidth, behavior: 'smooth' })} />
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={picked < 0}
            onClick={() => setPhoto({ kind: 'suggested', suggestion: suggestions[picked] })}
            className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            Usar esta
          </button>
          <button type="button" className="text-xs font-medium text-primary" onClick={() => { setSearchedFor(null); setPicked(-1); }}>
            Ninguna me sirve
          </button>
          <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => fileRef.current?.click()}>
            Subir la mía
          </button>
        </div>
      </div>
    );
  })();

  const sourcesNote =
    searchedFor !== null && !staleSearch && !photo && suggestions.length > 0
      ? describeSources(suggestions)
      : 'Opcional';

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl border bg-card text-card-foreground shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-lg font-semibold">{fixedKind ? 'Nuevo insumo' : 'Nuevo artículo'}</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="text-muted-foreground hover:text-foreground">
            ✕
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-4">
          {savedNames.length > 0 && (
            <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-300">
              ✓ Cargados ahora: {savedNames.join(' · ')}
            </p>
          )}

          {!fixedKind && (
            <Question n={1} title="¿Qué es?">
              <Choices>
                {KINDS.map((k) => (
                  <Choice key={k.id} title={k.title} hint={k.hint} active={draft.kind === k.id} onClick={() => chooseKind(k.id)} />
                ))}
              </Choices>
            </Question>
          )}

          {draft.kind && draft.kind !== 'servicio' && (
            <Question
              n={step(2)}
              title={draft.kind === 'insumo' ? '¿Cómo lo comprás?' : '¿Cómo lo vendés?'}
              hint="Define cómo se cuenta el stock. No se puede cambiar después."
            >
              <Choices>
                {HOWS[draft.kind].map((h) => (
                  <Choice key={h.id} title={h.title} hint={h.hint} active={draft.how === h.id} onClick={() => set('how', h.id)} />
                ))}
                {/* Cada talle/color es una variante con su código y su stock:
                    eso lo arma el formulario completo, que abre ya preparado. */}
                {draft.kind === 'producto' && (
                  <Choice
                    title="En talles o colores"
                    hint="Ropa, calzado. Stock por talle y color."
                    active={false}
                    onClick={() => openFullForm(true)}
                  />
                )}
              </Choices>
            </Question>
          )}

          {needsMoreThanName && (
            <Question n={step(draft.kind === 'servicio' ? 2 : 3)} title="Los datos">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Nombre" wide error={errors.includes('el nombre')}>
                  <input
                    ref={nameRef}
                    value={draft.name}
                    onChange={(e) => set('name', e.target.value)}
                    placeholder="Ej: Harina 000"
                    className={inputClass}
                    autoFocus
                  />
                </Field>

                <div className="flex flex-col gap-2 rounded-lg border bg-muted/40 px-3 py-2.5 sm:col-span-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <b className="font-semibold">Foto</b>
                    <span className="text-xs text-muted-foreground">{sourcesNote}</span>
                  </div>
                  {photoBlock}
                </div>

                {draft.how === 'pack' && (
                  <Field label="Viene en" wide error={errors.some((e) => e.startsWith('el tamaño'))}>
                    <div className="flex flex-wrap items-center gap-2">
                      <Select
                        value={draft.packName}
                        onChange={(v) => set('packName', v)}
                        options={PACK_NAMES.map((p) => ({ value: p, label: p }))}
                        className="w-32"
                      />
                      <span className="text-sm text-muted-foreground">de</span>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        inputMode="decimal"
                        value={draft.packQty}
                        onChange={(e) => set('packQty', e.target.value)}
                        placeholder="25"
                        aria-label="Tamaño"
                        className={`${inputClass} !w-28`}
                      />
                      <Select
                        value={draft.packUnit}
                        onChange={(v) => set('packUnit', v as PackUnit)}
                        options={(Object.keys(PACK_UNITS) as PackUnit[]).map((u) => ({ value: u, label: u }))}
                        className="w-24"
                      />
                    </div>
                    <small className="text-xs text-muted-foreground">Ej: bolsa de 25 kg, bidón de 5 L, paquete de 500 g.</small>
                  </Field>
                )}

                {draft.how === 'bar' && (
                  <Field label="Largo de cada barra" error={errors.includes('el largo de cada barra')}>
                    <NumberInput value={draft.barLength} onChange={(v) => set('barLength', v)} suffix="mm" />
                  </Field>
                )}
                {draft.how === 'sheet' && (
                  <>
                    <Field label="Ancho de la plancha" error={errors.includes('las medidas de la plancha')}>
                      <NumberInput value={draft.sheetWidth} onChange={(v) => set('sheetWidth', v)} suffix="mm" />
                    </Field>
                    <Field label="Largo de la plancha" error={errors.includes('las medidas de la plancha')}>
                      <NumberInput value={draft.sheetLength} onChange={(v) => set('sheetLength', v)} suffix="mm" />
                    </Field>
                  </>
                )}

                {(draft.kind === 'producto' || draft.kind === 'servicio') && (
                  <Field
                    label={draft.kind === 'servicio' ? 'Precio' : draft.how === 'kilo' ? 'Precio por kilo' : 'Precio de venta'}
                    error={errors.includes('el precio de venta')}
                  >
                    <NumberInput value={draft.price} onChange={(v) => set('price', v)} prefix="$" />
                  </Field>
                )}

                {draft.kind !== 'servicio' && (
                  <Field
                    label={
                      purchaseWord
                        ? `¿Cuánto te cuesta cada ${purchaseWord}?`
                        : draft.how === 'kilo'
                          ? 'Costo por kilo'
                          : draft.kind === 'producto'
                            ? 'Costo (opcional)'
                            : 'Costo por unidad'
                    }
                    labelExtra={<CostVatToggle includesVat={costIncludesVat} onChange={setCostIncludesVat} />}
                    error={errors.some((e) => e.startsWith('el costo'))}
                    help={draft.kind === 'producto' && draft.how === 'unit' ? 'Si lo fabricás, sale de la receta.' : undefined}
                  >
                    <NumberInput value={draft.cost} onChange={(v) => set('cost', v)} prefix="$" placeholder={draft.how === 'pack' ? '20000' : ''} />
                  </Field>
                )}

                {draft.kind !== 'servicio' && (
                  <Field
                    label={
                      draft.how === 'pack'
                        ? `¿Cuántas ${plural(draft.packName, 2)} tenés hoy?`
                        : draft.how === 'bar'
                          ? '¿Cuántas barras enteras tenés?'
                          : draft.how === 'sheet'
                            ? '¿Cuántas planchas tenés?'
                            : draft.how === 'kilo'
                              ? '¿Cuántos kilos tenés?'
                              : '¿Cuántas unidades tenés?'
                    }
                    error={errors.includes('las barras, en números enteros')}
                    help={draft.how === 'bar' || draft.how === 'unit' ? undefined : 'Puede ser con decimales: 2,5'}
                  >
                    <NumberInput value={draft.have} onChange={(v) => set('have', v)} placeholder="0" />
                  </Field>
                )}
              </div>

              {lines.length > 0 && (
                <div className="flex flex-col gap-0.5 rounded-lg bg-emerald-500/10 px-3 py-2.5 text-sm">
                  {lines.map((l) => (
                    <span key={l} className="tabular-nums">
                      {l}
                    </span>
                  ))}
                  <small className="text-xs text-muted-foreground">Así lo vas a ver en Inventario y en las recetas.</small>
                </div>
              )}
            </Question>
          )}

          {needsMoreThanName && (
            <details className="group rounded-lg border border-dashed px-3">
              <summary className="flex cursor-pointer list-none justify-between py-2.5 text-sm font-medium text-muted-foreground [&::-webkit-details-marker]:hidden">
                Más datos (opcional)
                <span className="font-mono group-open:hidden">+</span>
                <span className="hidden font-mono group-open:inline">−</span>
              </summary>
              <div className="grid grid-cols-1 gap-3 pb-3 sm:grid-cols-2">
                <Field label="Código" error={errors.includes('el código')} help="Propuesto a partir del nombre. Podés cambiarlo.">
                  <input
                    value={code}
                    onChange={(e) => setDraft((d) => ({ ...d, code: e.target.value, codeTouched: true }))}
                    placeholder="Se completa solo"
                    className={inputClass}
                  />
                </Field>
                {draft.kind !== 'servicio' && (
                  <Field
                    label="Avisame cuando quede menos de"
                    help={purchaseWord ? `En ${plural(purchaseWord, 2)}.` : undefined}
                  >
                    <NumberInput value={draft.min} onChange={(v) => set('min', v)} placeholder={minPlaceholder} />
                  </Field>
                )}
                <Field label="Proveedor habitual">
                  <Select
                    value={draft.supplierId}
                    onChange={(v) => set('supplierId', v)}
                    placeholder="Ninguno"
                    options={[{ value: '', label: 'Ninguno' }, ...(suppliersQuery.data ?? []).map((s) => ({ value: s.id, label: s.name }))]}
                  />
                </Field>
                <Field label="IVA">
                  <Select
                    value={taxDefinitionId}
                    onChange={setTaxDefinitionId}
                    options={taxOptions.map((t) => ({ value: t.id, label: t.name }))}
                  />
                </Field>
                <Field label="Categoría">
                  <Select
                    value={draft.categoryId}
                    onChange={(v) => set('categoryId', v)}
                    placeholder="Sin categoría"
                    options={[{ value: '', label: 'Sin categoría' }, ...(categoriesQuery.data ?? []).map((c) => ({ value: c.id, label: c.name }))]}
                  />
                </Field>
                {draft.kind !== 'servicio' && warehouses.length > 1 && (
                  <Field label="Depósito del stock">
                    <Select value={warehouseId} onChange={setWarehouseId} options={warehouses.map((w) => ({ value: w.id, label: w.name }))} />
                  </Field>
                )}
                <label className="flex items-start gap-2 text-sm sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={draft.catalog}
                    onChange={(e) => set('catalog', e.target.checked)}
                    className="mt-1 accent-primary"
                  />
                  <span>
                    Mostrar en el catálogo y la tienda
                    <small className="block text-xs text-muted-foreground">
                      {draft.kind === 'insumo' ? 'Apagado para insumos: no se venden.' : 'Lo pueden ver tus clientes.'}
                    </small>
                  </span>
                </label>
              </div>
            </details>
          )}

          {errors.length > 0 && (
            <div role="alert" className="rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
              <b>Para guardar falta:</b>
              <ul className="mt-1 list-disc pl-5">
                {errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          )}
          {serverError && (
            <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
              {serverError}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t px-5 py-3.5">
          {/* Con el artículo ya creado en un intento fallido, el formulario
              completo lo duplicaría: se termina acá. */}
          {!fixedKind && !progress.current.articleId && (
            <button
              type="button"
              onClick={() => openFullForm(false)}
              className="mr-auto text-xs text-muted-foreground hover:text-foreground"
              title="Para variantes por talle o color, folleto y adjuntos"
            >
              ¿Talles, colores o adjuntos? Formulario completo
            </button>
          )}
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
            Cancelar
          </button>
          {!onSaved && (
            <button
              type="button"
              disabled={mutation.isPending}
              onClick={() => save(true)}
              className="rounded-lg border px-3 py-2 text-sm font-medium hover:border-primary disabled:opacity-50"
            >
              Guardar y cargar otro
            </button>
          )}
          <button
            type="button"
            disabled={mutation.isPending}
            onClick={() => save(false)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {saveLabel ?? 'Guardar'}
          </button>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) setPendingCropFile(file);
        }}
      />
      {pendingCropFile && (
        <ImageCropper
          file={pendingCropFile}
          onCancel={() => setPendingCropFile(null)}
          onApply={(cropped) => {
            setPhoto({ kind: 'own', file: cropped, previewUrl: URL.createObjectURL(cropped) });
            setPendingCropFile(null);
          }}
        />
      )}
    </div>
  );
}

function describeSources(list: PhotoSuggestion[]): string {
  const off = list.filter((s) => s.source === 'off').length;
  const pexels = list.length - off;
  const parts = [off > 0 ? `${off} de Open Food Facts` : '', pexels > 0 ? `${pexels} de Pexels` : ''].filter(Boolean);
  return parts.join(' y ');
}

function Question({ n, title, hint, children }: { n: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-baseline gap-2 text-[15px] font-semibold">
        <span className="rounded-md bg-primary/10 px-1.5 font-mono text-[11px] text-primary">{n}</span>
        {title}
      </div>
      {hint && <p className="-mt-1.5 text-xs text-muted-foreground">{hint}</p>}
      {children}
    </section>
  );
}

function Choices({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2">{children}</div>;
}

function Choice({ title, hint, active, onClick }: { title: string; hint: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex flex-col gap-0.5 rounded-lg border-[1.5px] px-3 py-2.5 text-left transition hover:border-primary ${
        active ? 'border-primary bg-primary/10' : 'border-border bg-card'
      }`}
    >
      <b className="text-[13.5px] font-semibold">{title}</b>
      <span className="text-xs text-muted-foreground">{hint}</span>
    </button>
  );
}

function Field({
  label,
  labelExtra,
  wide,
  error,
  help,
  children,
}: {
  label: string;
  labelExtra?: React.ReactNode;
  wide?: boolean;
  error?: boolean;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-1 ${wide ? 'sm:col-span-2' : ''}`}>
      <span className={`flex flex-wrap items-center justify-between gap-2 text-xs ${error ? 'text-destructive' : 'text-muted-foreground'}`}>
        {label}
        {labelExtra}
      </span>
      {children}
      {help && <small className="text-xs text-muted-foreground">{help}</small>}
    </div>
  );
}

function NumberInput({
  value,
  onChange,
  prefix,
  suffix,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  prefix?: string;
  suffix?: string;
  placeholder?: string;
}) {
  return (
    <div className="flex h-9 items-center overflow-hidden rounded-lg border border-input focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
      {prefix && <span className="pl-2.5 text-sm text-muted-foreground">{prefix}</span>}
      <input
        type="number"
        min={0}
        step="any"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-full w-full min-w-0 bg-transparent px-2.5 text-sm tabular-nums outline-none"
      />
      {suffix && <span className="pr-2.5 text-sm text-muted-foreground">{suffix}</span>}
    </div>
  );
}

function CarouselArrow({ side, onClick }: { side: 'left' | 'right'; onClick: () => void }) {
  const Icon = side === 'left' ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === 'left' ? 'Fotos anteriores' : 'Más fotos'}
      className={`absolute top-[40%] z-10 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full border bg-card shadow ${
        side === 'left' ? '-left-2.5' : '-right-2.5'
      }`}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
