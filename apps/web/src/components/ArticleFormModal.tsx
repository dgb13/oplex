'use client';

import AttachmentSlot from '@/components/AttachmentSlot';
import CompanyFormModal from '@/components/CompanyFormModal';
import ImageCropper from '@/components/ImageCropper';
import Select from '@/components/ui/Select';
import { companiesApi } from '@/lib/companies';
import { inventoryApi, UNIT_OF_MEASURE_OPTIONS } from '@/lib/inventory';
import { tenantSettingsApi } from '@/lib/tenantSettings';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { Archive, FileText, Image as ImageIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

export interface CreatedArticleVariantRef {
  variantId: string;
  articleId: string;
  articleName: string;
  sku: string;
  unitPrice: number;
}

interface Props {
  onClose: () => void;
  // Sólo se usa cuando este modal se abre desde ArticlePicker ("+ nuevo
  // artículo") - el picker arma su propia opción a partir de esto y llama
  // a su propio onChange, en vez de esperar el refetch de la lista.
  onSaved?: (created: CreatedArticleVariantRef) => void;
}

type Tab = 'general' | 'pricing' | 'variant' | 'stock' | 'media';

interface AttributeDraft {
  name: string;
  values: string[];
}

interface MatrixRow {
  key: string;
  values: Record<string, string>;
  sku: string;
  price: string;
  stock: string;
  minStock: string;
  status: 'pending' | 'done' | 'error';
  error?: string;
  variantId?: string;
}

const inputClass =
  'h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

// `inputClass` trae `h-8` (pensado para un input de una línea) y sin
// padding vertical - en un <textarea rows={3}> eso pisa la altura de
// `rows` y deja el texto pegado contra el borde superior (reportado por
// el usuario). Mismo aspecto (borde, focus ring) pero alto libre + `py-2`.
const textareaClass =
  'rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';


const MEASUREMENT_TYPE_OPTIONS: {
  value: 'DISCRETE' | 'CONTINUOUS' | 'LINEAL_1D' | 'SURFACE_2D';
  label: string;
}[] = [
  { value: 'DISCRETE', label: 'Unidad' },
  { value: 'CONTINUOUS', label: 'Continuo (peso/volumen)' },
  { value: 'LINEAL_1D', label: 'Lineal (por metro)' },
  { value: 'SURFACE_2D', label: 'Superficie (por m²)' },
];

function tabClass(active: boolean): string {
  return `rounded-lg px-3 py-1.5 text-xs font-medium transition ${
    active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
  }`;
}

/** "Remera" / "Rojo" -> "REMERA"/"ROJO" para armar un SKU sugerido legible
 * (sin acentos, sin espacios ni símbolos) - sólo una sugerencia editable,
 * nunca se fuerza. */
function slugPart(value: string): string {
  return value
    .normalize('NFD')
    .replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '');
}

// Cada fila de la matriz dispara su propio POST a /inventory/article-variants
// en paralelo (ver mutationFn, Promise.allSettled) - sin este tope, muchos
// atributos con muchos valores generan cientos de requests simultáneos que
// saturan el pool de conexiones de Prisma, además de una grilla inmanejable.
const MAX_VARIANT_COMBOS = 30;

/** Producto cartesiano de los valores de cada atributo usable (nombre no
 * vacío + al menos un valor cargado) - "Color: Rojo,Verde" + "Talle: S,M"
 * da las 4 combinaciones Rojo/S, Rojo/M, Verde/S, Verde/M. Atributos sin
 * nombre o sin ningún valor todavía se ignoran (fila en construcción, no
 * bloquea a los demás atributos ya completos). */
function cartesianCombos(attrs: AttributeDraft[]): { name: string; value: string }[][] {
  const usable = attrs.filter((a) => a.name.trim() !== '' && a.values.length > 0);
  if (usable.length === 0) return [];
  return usable.reduce<{ name: string; value: string }[][]>(
    (acc, attr) => acc.flatMap((combo) => attr.values.map((value) => [...combo, { name: attr.name.trim(), value }])),
    [[]],
  );
}

/** Clave estable de una combinación, sin importar el orden de los
 * atributos - permite reusar SKU/precio/stock ya tipeados en una fila al
 * volver a generar la matriz después de agregar/sacar un valor. */
function comboKey(combo: { name: string; value: string }[]): string {
  return combo
    .map((c) => `${c.name}:${c.value}`)
    .sort()
    .join('|');
}

/** Crear un artículo de punta a punta: Article + su(s) ArticleVariant(s)
 * + (opcional) MinimumStock + movimiento de stock inicial + adjuntos -
 * hasta la sesión anterior sólo se creaba un único SKU por alta. Ahora,
 * si "¿Este artículo tiene variantes?" está activado, un creador de
 * atributos (Color/Talle/etc.) genera la matriz de combinaciones y cada
 * fila se convierte en su propio ArticleVariant con su propio
 * SKU/precio/stock. Vive en components/ (no app/inventory/) porque
 * ArticlePicker (también components/) necesita abrirlo desde cualquier
 * formulario, no sólo desde Inventario - mismo criterio que
 * CompanyFormModal.
 *
 * `preferredSupplierId`/`markupPercent` no existen en el DTO de alta del
 * backend (`CreateArticleDto`) - sólo en el de edición
 * (`UpdateArticleDto`) - así que van en un PATCH aparte después de crear
 * el Article, no en el POST inicial (mandarlos ahí se descartaba en
 * silencio, sin error, en una versión vieja de este modal).
 *
 * Reintentos parciales: `createdArticleId` recuerda si el Article ya se
 * creó en un intento anterior (para no duplicarlo si sólo fallaron
 * algunas variantes - SKU repetido es el caso típico, único por tenant,
 * no por artículo) y cada fila de la matriz guarda su propio
 * `status`/`error`, así que un segundo click en "Crear artículo" sólo
 * reprocesa las filas que no quedaron en `done`.
 */
export default function ArticleFormModal({ onClose, onSaved }: Props) {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({ queryKey: ['tenant-settings'], queryFn: tenantSettingsApi.get });
  const categoriesQuery = useQuery({ queryKey: ['inventory-categories'], queryFn: inventoryApi.listCategories });
  const warehousesQuery = useQuery({ queryKey: ['inventory-warehouses'], queryFn: inventoryApi.listWarehouses });
  const suppliersQuery = useQuery({ queryKey: ['companies', 'SUPPLIER'], queryFn: () => companiesApi.list('SUPPLIER') });

  const [tab, setTab] = useState<Tab>('general');

  // Datos generales
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [description, setDescription] = useState('');
  const [isService, setIsService] = useState(false);
  const [isPublished, setIsPublished] = useState(true);
  const [hasVariants, setHasVariants] = useState(false);
  // Sólo hace falta tildarlo a mano para poder elegir este producto como
  // "Producto a fabricar" en Recetas ANTES de cargarle su primera receta -
  // BomService.create() lo termina fijando en true solo apenas exista una
  // (ver ArticlePicker, prop `filter`, usado en production/bom/page.tsx).
  const [isManufactured, setIsManufactured] = useState(false);

  // "Medida comercial" - discriminador de cómo se mide/consume el stock
  // (measurementType) + los campos propios de cada tipo. Fijo una vez
  // creado el artículo, no hay UPDATE para esto (ver UpdateArticleInput) -
  // cambiarlo con stock/piezas/BOM ya cargados rompería su interpretación.
  const [measurementType, setMeasurementType] = useState<'DISCRETE' | 'CONTINUOUS' | 'LINEAL_1D' | 'SURFACE_2D'>(
    'DISCRETE',
  );
  const [purchaseSize, setPurchaseSize] = useState('');
  const [baseUnit, setBaseUnit] = useState('gr');
  const [commercialLength, setCommercialLength] = useState('');
  const [minUsableLength, setMinUsableLength] = useState('');
  const [sheetWidth, setSheetWidth] = useState('');
  const [sheetLength, setSheetLength] = useState('');

  // Precios y proveedor
  const [preferredSupplierId, setPreferredSupplierId] = useState('');
  const [creatingSupplier, setCreatingSupplier] = useState(false);
  const [costInput, setCostInput] = useState('');
  const [markupInput, setMarkupInput] = useState('');
  const [priceInput, setPriceInput] = useState('');

  // Variante / identificación - modo simple (hasVariants=false)
  const [sku, setSku] = useState('');
  const [unitOfMeasure, setUnitOfMeasure] = useState<string>('UNIT');

  // Variantes - modo matriz (hasVariants=true)
  const [variantAttributes, setVariantAttributes] = useState<AttributeDraft[]>([]);
  const [attributeDrafts, setAttributeDrafts] = useState<string[]>([]);
  const [skuBase, setSkuBase] = useState('');
  const [matrixRows, setMatrixRows] = useState<MatrixRow[]>([]);

  // Stock inicial y alertas
  const [warehouseId, setWarehouseId] = useState('');
  const [stockInput, setStockInput] = useState('');
  const [minimumStockInput, setMinimumStockInput] = useState('');

  // Adjuntos - se suben recién después de crear el artículo (necesitan
  // su id), así que hasta entonces sólo quedan guardados acá. `imageFile`
  // es siempre el resultado YA recortado (ver ImageCropper) - el archivo
  // elegido en crudo vive aparte en `pendingCropFile` hasta que se aplica
  // o se cancela el recorte, nunca llega a subirse tal cual.
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [pendingCropFile, setPendingCropFile] = useState<File | null>(null);
  const [brochureFile, setBrochureFile] = useState<File | null>(null);
  const [zipFile, setZipFile] = useState<File | null>(null);

  // Revoca el object URL de la miniatura cuando se reemplaza o se quita la
  // imagen - si no, cada recorte sucesivo deja un blob colgado en memoria.
  useEffect(() => {
    return () => {
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    };
  }, [imagePreviewUrl]);

  function handleImageCropApplied(cropped: File) {
    setImageFile(cropped);
    setImagePreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(cropped);
    });
    setPendingCropFile(null);
  }

  function handleRemoveImage() {
    setImageFile(null);
    setImagePreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }

  const [error, setError] = useState('');

  // Recordado entre intentos - si sólo fallaron algunas variantes de la
  // matriz, reintentar no vuelve a crear el Article (ver mutationFn).
  const [createdArticleId, setCreatedArticleId] = useState<string | null>(null);

  // Precarga el único depósito si hay uno solo - el caso más común, evita
  // un click extra sin forzar nada cuando hay más de uno.
  useEffect(() => {
    const warehouses = warehousesQuery.data;
    if (warehouseId === '' && warehouses?.length === 1) {
      setWarehouseId(warehouses[0].id);
    }
  }, [warehousesQuery.data, warehouseId]);

  // Si se activa "Es servicio" mientras se estaba mirando la pestaña de
  // stock (que deja de existir), no se queda en una pestaña fantasma.
  useEffect(() => {
    if (isService && tab === 'stock') setTab('general');
  }, [isService, tab]);

  const defaultMarkup = settingsQuery.data?.defaultMarkupPercent;
  const effectiveMarkup = markupInput.trim() !== '' ? Number(markupInput) : defaultMarkup;
  const suggestedPrice =
    costInput.trim() !== '' && effectiveMarkup != null && !Number.isNaN(effectiveMarkup)
      ? Number(costInput) * (1 + effectiveMarkup / 100)
      : null;

  const categories = categoriesQuery.data ?? [];
  const warehouses = warehousesQuery.data ?? [];
  const suppliers = suppliersQuery.data ?? [];

  const stockQuantity = stockInput.trim() === '' ? 0 : Number(stockInput);
  const minimumQuantity = minimumStockInput.trim() === '' ? 0 : Number(minimumStockInput);
  const pendingCombos = cartesianCombos(variantAttributes);

  const createCategoryMutation = useMutation({
    mutationFn: () => inventoryApi.createCategory({ name: newCategoryName.trim() }),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ['inventory-categories'] });
      setCategoryId(created.id);
      setNewCategoryName('');
      setCreatingCategory(false);
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo crear la categoría';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  function addAttribute() {
    setVariantAttributes((prev) => [...prev, { name: '', values: [] }]);
    setAttributeDrafts((prev) => [...prev, '']);
  }

  function removeAttribute(index: number) {
    setVariantAttributes((prev) => prev.filter((_, i) => i !== index));
    setAttributeDrafts((prev) => prev.filter((_, i) => i !== index));
  }

  function renameAttribute(index: number, newName: string) {
    setVariantAttributes((prev) => prev.map((a, i) => (i === index ? { ...a, name: newName } : a)));
  }

  function commitAttributeValue(index: number) {
    const raw = (attributeDrafts[index] ?? '').trim();
    if (!raw) return;
    setVariantAttributes((prev) =>
      prev.map((a, i) => (i === index && !a.values.includes(raw) ? { ...a, values: [...a.values, raw] } : a)),
    );
    setAttributeDrafts((prev) => prev.map((d, i) => (i === index ? '' : d)));
  }

  function removeAttributeValue(index: number, value: string) {
    setVariantAttributes((prev) =>
      prev.map((a, i) => (i === index ? { ...a, values: a.values.filter((v) => v !== value) } : a)),
    );
  }

  // Reusa SKU/precio/stock ya tipeados en filas que sigan representando la
  // misma combinación (por `comboKey`) - agregar un tercer color no
  // reinicia lo que ya se cargó para los primeros dos.
  function handleGenerateMatrix() {
    const combos = cartesianCombos(variantAttributes);
    const existingByKey = new Map(matrixRows.map((r) => [r.key, r]));
    const nextRows: MatrixRow[] = combos.map((combo) => {
      const key = comboKey(combo);
      const existing = existingByKey.get(key);
      if (existing) return existing;
      const values = Object.fromEntries(combo.map((c) => [c.name, c.value]));
      const suggestedSku = [slugPart(skuBase) || 'ART', ...combo.map((c) => slugPart(c.value))].join('-');
      return {
        key,
        values,
        sku: suggestedSku,
        price: suggestedPrice !== null ? suggestedPrice.toFixed(2) : '',
        stock: '',
        minStock: '',
        status: 'pending',
      };
    });
    setMatrixRows(nextRows);
  }

  function updateMatrixRow(key: string, patch: Partial<MatrixRow>) {
    setMatrixRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch, status: 'pending', error: undefined } : r)));
  }

  function applySuggestedPriceToAll() {
    if (suggestedPrice === null) return;
    setMatrixRows((prev) => prev.map((r) => (r.status === 'done' ? r : { ...r, price: suggestedPrice.toFixed(2) })));
  }

  const mutation = useMutation({
    mutationFn: async () => {
      let articleId = createdArticleId;

      if (!articleId) {
        const article = await inventoryApi.createArticle({
          name: name.trim(),
          unitOfMeasure,
          description: description.trim() || undefined,
          categoryId: categoryId || undefined,
          isService,
          isPublished,
          hasVariants,
          isManufactured,
          measurementType,
          // Sólo se mandan los campos del tipo elegido - el resto queda
          // undefined (el backend los deja en null, no hay ambigüedad con
          // "0" o "vacío" para un tipo que no los usa).
          purchaseSize:
            measurementType === 'CONTINUOUS' && purchaseSize.trim() !== '' ? Number(purchaseSize) : undefined,
          baseUnit: measurementType === 'CONTINUOUS' ? baseUnit : undefined,
          commercialLength:
            measurementType === 'LINEAL_1D' && commercialLength.trim() !== '' ? Number(commercialLength) : undefined,
          minUsableLength:
            measurementType === 'LINEAL_1D' && minUsableLength.trim() !== '' ? Number(minUsableLength) : undefined,
          sheetWidth: measurementType === 'SURFACE_2D' && sheetWidth.trim() !== '' ? Number(sheetWidth) : undefined,
          sheetLength:
            measurementType === 'SURFACE_2D' && sheetLength.trim() !== '' ? Number(sheetLength) : undefined,
        });
        articleId = article.id;
        setCreatedArticleId(article.id);

        if (preferredSupplierId || markupInput.trim() !== '') {
          await inventoryApi.updateArticle(article.id, {
            preferredSupplierId: preferredSupplierId || null,
            markupPercent: markupInput.trim() === '' ? null : Number(markupInput),
          });
        }
      }

      if (!hasVariants) {
        const variant = await inventoryApi.createArticleVariant({
          articleId,
          sku: sku.trim(),
          unitPrice: Number(priceInput),
          costPrice: costInput.trim() === '' ? undefined : Number(costInput),
        });

        if (!isService && warehouseId) {
          if (minimumQuantity > 0) {
            await inventoryApi.setMinimumStock({ warehouseId, articleVariantId: variant.id, minimumQuantity });
          }
          // measurementType === 'LINEAL_1D' nunca llega hasta acá con
          // stockQuantity > 0 en un uso normal (el tab "Stock inicial" está
          // oculto para ese tipo, ver `tabs` más abajo) - el guard es sólo
          // por si quedó un valor viejo tipeado antes de cambiar el tipo de
          // medición. El backend lo rechazaría igual (InventoryController.
          // recordMovement), pero mejor no ni intentarlo.
          if (stockQuantity > 0 && measurementType !== 'LINEAL_1D') {
            await inventoryApi.recordMovement({
              warehouseId,
              articleVariantId: variant.id,
              type: 'PURCHASE_IN',
              quantity: stockQuantity,
              unitCost: Number(costInput),
            });
          }
        }

        await Promise.all([
          imageFile ? inventoryApi.uploadArticleImage(articleId, imageFile) : null,
          brochureFile ? inventoryApi.uploadArticleBrochure(articleId, brochureFile) : null,
          zipFile ? inventoryApi.uploadArticleAttachmentZip(articleId, zipFile) : null,
        ]);

        return {
          variantId: variant.id,
          articleId,
          articleName: name.trim(),
          sku: variant.sku,
          unitPrice: Number(variant.unitPrice),
        };
      }

      // Matriz de variantes - sólo reprocesa lo que no quedó "done" en un
      // intento anterior.
      const articleIdForRows = articleId;
      const pendingRows = matrixRows.filter((r) => r.status !== 'done');
      const outcomes = await Promise.allSettled(
        pendingRows.map(async (row) => {
          const variant = await inventoryApi.createArticleVariant({
            articleId: articleIdForRows,
            sku: row.sku.trim(),
            unitPrice: Number(row.price),
            costPrice: costInput.trim() === '' ? undefined : Number(costInput),
            attributes: row.values,
          });

          if (!isService && warehouseId) {
            const minQ = row.minStock.trim() === '' ? 0 : Number(row.minStock);
            const stockQ = row.stock.trim() === '' ? 0 : Number(row.stock);
            if (minQ > 0) {
              await inventoryApi.setMinimumStock({ warehouseId, articleVariantId: variant.id, minimumQuantity: minQ });
            }
            if (stockQ > 0 && measurementType !== 'LINEAL_1D') {
              await inventoryApi.recordMovement({
                warehouseId,
                articleVariantId: variant.id,
                type: 'PURCHASE_IN',
                quantity: stockQ,
                unitCost: Number(costInput),
              });
            }
          }
          return variant;
        }),
      );

      const nextRows = matrixRows.map((row) => {
        const i = pendingRows.findIndex((r) => r.key === row.key);
        if (i === -1) return row;
        const outcome = outcomes[i];
        if (outcome.status === 'fulfilled') {
          return { ...row, status: 'done' as const, error: undefined, variantId: outcome.value.id };
        }
        const err = outcome.reason as AxiosError<{ message?: string | string[] }>;
        const msg = err.response?.data?.message ?? 'No se pudo crear';
        return { ...row, status: 'error' as const, error: Array.isArray(msg) ? msg.join(', ') : msg };
      });
      setMatrixRows(nextRows);

      if (nextRows.some((r) => r.status === 'error')) {
        throw new Error('PARTIAL_FAILURE');
      }

      await Promise.all([
        imageFile ? inventoryApi.uploadArticleImage(articleId, imageFile) : null,
        brochureFile ? inventoryApi.uploadArticleBrochure(articleId, brochureFile) : null,
        zipFile ? inventoryApi.uploadArticleAttachmentZip(articleId, zipFile) : null,
      ]);

      const first = nextRows.find((r) => r.status === 'done' && r.variantId);
      if (!first || !first.variantId) {
        throw new Error('No se creó ninguna variante');
      }
      return {
        variantId: first.variantId,
        articleId,
        articleName: name.trim(),
        sku: first.sku,
        unitPrice: Number(first.price),
      };
    },
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ['inventory-articles'] });
      onSaved?.(created);
      onClose();
    },
    onError: (err: Error) => {
      if (err.message === 'PARTIAL_FAILURE') {
        setError(
          'Algunas variantes no se pudieron crear - mirá el detalle marcado en cada fila de la grilla, corregilas y volvé a tocar "Crear artículo" (las que ya se crearon no se duplican).',
        );
        setTab('variant');
        return;
      }
      const axiosErr = err as AxiosError<{ message?: string | string[] }>;
      const message = axiosErr.response?.data?.message ?? 'No se pudo crear el artículo';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  // Sin <form>/onSubmit a propósito: este modal se abre desde ArticlePicker,
  // que a su vez vive DENTRO del <form> de cada uno de los formularios que
  // lo usan - un <form> anidado adentro de otro no es válido en HTML, y el
  // submit del interno terminaba burbujeando hasta el <form> externo Y
  // disparando encima el submit nativo del navegador (recarga de página,
  // perdiendo lo cargado) en vez de sólo correr el handler de React.
  // Encontrado probando en Chrome, no en build/test. Un botón type="button"
  // con onClick evita depender de semántica de formulario nativa por
  // completo, sin importar dónde se monte este modal.
  function handleSubmit() {
    setError('');
    if (!name.trim()) {
      setError('Ingresá un nombre');
      setTab('general');
      return;
    }

    if (!hasVariants) {
      if (!sku.trim()) {
        setError('Ingresá un SKU');
        setTab('variant');
        return;
      }
      if (priceInput.trim() === '' || Number(priceInput) <= 0) {
        setError('Ingresá un precio de venta válido');
        setTab('pricing');
        return;
      }
      if (!isService) {
        if ((stockQuantity > 0 || minimumQuantity > 0) && !warehouseId) {
          setError('Elegí un depósito para el stock inicial o el mínimo');
          setTab('stock');
          return;
        }
        if (stockQuantity > 0 && costInput.trim() === '') {
          setError('Ingresá el costo inicial para poder registrar el stock inicial');
          setTab('pricing');
          return;
        }
      }
    } else {
      if (matrixRows.length === 0) {
        setError('Generá al menos una combinación de variantes');
        setTab('variant');
        return;
      }
      const pending = matrixRows.filter((r) => r.status !== 'done');
      const incomplete = pending.find((r) => !r.sku.trim() || r.price.trim() === '' || Number(r.price) <= 0);
      if (incomplete) {
        setError('Completá SKU y precio de venta en todas las variantes de la grilla');
        setTab('variant');
        return;
      }
      if (!isService) {
        const needsWarehouse = pending.some(
          (r) => (r.stock.trim() !== '' && Number(r.stock) > 0) || (r.minStock.trim() !== '' && Number(r.minStock) > 0),
        );
        if (needsWarehouse && !warehouseId) {
          setError('Elegí un depósito para el stock inicial o el mínimo');
          setTab('stock');
          return;
        }
        const needsCost = pending.some((r) => r.stock.trim() !== '' && Number(r.stock) > 0);
        if (needsCost && costInput.trim() === '') {
          setError('Ingresá el costo inicial para poder registrar stock');
          setTab('pricing');
          return;
        }
      }
    }
    mutation.mutate();
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'general', label: 'Datos generales' },
    { key: 'pricing', label: 'Precios y proveedor' },
    { key: 'variant', label: hasVariants ? 'Variantes' : 'Variante' },
    ...(isService || measurementType === 'LINEAL_1D' ? [] : [{ key: 'stock' as const, label: 'Stock inicial' }]),
    { key: 'media', label: 'Adjuntos' },
  ];

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
      <div className="flex h-[85vh] w-full max-w-3xl flex-col rounded-xl border bg-card p-6 text-card-foreground shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold  ">Nuevo artículo</h2>
          <button onClick={onClose} className="text-muted-foreground transition hover:  dark:hover: ">
            ✕
          </button>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {tabs.map((t) => (
            <button key={t.key} type="button" onClick={() => setTab(t.key)} className={tabClass(tab === t.key)}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto pr-1">
          {tab === 'general' && (
            <div className="flex flex-col gap-4">
              <label className="flex flex-col gap-1">
                <span className="text-sm text-muted-foreground">Nombre</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputClass}
                  placeholder="p. ej. Agua mineral 500ml"
                  autoFocus
                />
              </label>

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Categoría</span>
                  {!creatingCategory && (
                    <button
                      type="button"
                      onClick={() => setCreatingCategory(true)}
                      className="text-xs text-primary hover:text-primary"
                    >
                      + nueva categoría
                    </button>
                  )}
                </div>
                {creatingCategory ? (
                  <div className="flex items-center gap-2">
                    <input
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      className={`${inputClass} flex-1`}
                      placeholder="Nombre de la categoría"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => createCategoryMutation.mutate()}
                      disabled={!newCategoryName.trim() || createCategoryMutation.isPending}
                      className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:opacity-50"
                    >
                      {createCategoryMutation.isPending ? 'Creando...' : 'Crear'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCreatingCategory(false);
                        setNewCategoryName('');
                      }}
                      className="text-sm text-muted-foreground hover:  dark:hover: "
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <Select
                    value={categoryId}
                    onChange={setCategoryId}
                    options={[
                      { value: '', label: '— Sin categoría —' },
                      ...categories.map((c) => ({ value: c.id, label: c.name })),
                    ]}
                  />
                )}
              </div>

              <label className="flex flex-col gap-1">
                <span className="text-sm text-muted-foreground">Descripción</span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className={`${textareaClass} resize-none`}
                  placeholder="Opcional - detalle visible al editar el artículo"
                />
              </label>

              <label className="flex items-center justify-between rounded-lg border border p-3">
                <span className="text-sm  ">
                  Es servicio
                  <span className="block text-xs text-muted-foreground">No lleva stock ni depósito</span>
                </span>
                <input
                  type="checkbox"
                  checked={isService}
                  onChange={(e) => setIsService(e.target.checked)}
                  className="h-5 w-5 accent-primary"
                />
              </label>

              <label className="flex items-center justify-between rounded-lg border border p-3">
                <span className="text-sm  ">
                  Publicado
                  <span className="block text-xs text-muted-foreground">Visible en el catálogo</span>
                </span>
                <input
                  type="checkbox"
                  checked={isPublished}
                  onChange={(e) => setIsPublished(e.target.checked)}
                  className="h-5 w-5 accent-primary"
                />
              </label>

              <label className="flex items-center justify-between rounded-lg border border p-3">
                <span className="text-sm  ">
                  ¿Este artículo tiene variantes?
                  <span className="block text-xs text-muted-foreground">Ej: Talles, Colores - carga varios SKU a la vez</span>
                </span>
                <input
                  type="checkbox"
                  checked={hasVariants}
                  onChange={(e) => setHasVariants(e.target.checked)}
                  className="h-5 w-5 accent-primary"
                />
              </label>

              <label className="flex items-center justify-between rounded-lg border border p-3">
                <span className="text-sm  ">
                  Se fabrica (tiene receta)
                  <span className="block text-xs text-muted-foreground">
                    Aparece como &quot;Producto a fabricar&quot; en Recetas del módulo Producción
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={isManufactured}
                  onChange={(e) => setIsManufactured(e.target.checked)}
                  className="h-5 w-5 accent-primary"
                />
              </label>

              <div className="flex flex-col gap-2 rounded-lg border border p-3">
                <span className="text-sm  ">
                  Tipo de medición
                  <span className="block text-xs text-muted-foreground">
                    Cómo se mide/consume el stock - fijo una vez creado el artículo
                  </span>
                </span>
                <div className="flex flex-wrap gap-2">
                  {MEASUREMENT_TYPE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setMeasurementType(opt.value)}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                        measurementType === opt.value
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                {measurementType === 'CONTINUOUS' && (
                  <div className="mt-1 grid grid-cols-2 gap-3">
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-muted-foreground">Tamaño de la presentación de compra</span>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={purchaseSize}
                        onChange={(e) => setPurchaseSize(e.target.value)}
                        className={inputClass}
                        placeholder="p. ej. 35000"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-muted-foreground">Unidad base de stock</span>
                      <Select
                        value={baseUnit}
                        onChange={setBaseUnit}
                        options={[
                          { value: 'gr', label: 'gr' },
                          { value: 'ml', label: 'ml' },
                        ]}
                      />
                    </label>
                  </div>
                )}

                {measurementType === 'LINEAL_1D' && (
                  <div className="mt-1 grid grid-cols-2 gap-3">
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-muted-foreground">Largo comercial (mm)</span>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={commercialLength}
                        onChange={(e) => setCommercialLength(e.target.value)}
                        className={inputClass}
                        placeholder="p. ej. 6000"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-muted-foreground">Merma mínima aprovechable (mm)</span>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={minUsableLength}
                        onChange={(e) => setMinUsableLength(e.target.value)}
                        className={inputClass}
                        placeholder="Opcional"
                      />
                    </label>
                  </div>
                )}

                {measurementType === 'LINEAL_1D' && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Sin "Stock inicial" acá - un artículo por pieza necesita saber el largo de cada barra, así
                    que su stock se carga desde Compras &gt; Recibir mercadería (o Producción, si es un
                    recorte). Podés crear el artículo ahora y cargarle stock después.
                  </p>
                )}

                {measurementType === 'SURFACE_2D' && (
                  <div className="mt-1 grid grid-cols-2 gap-3">
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-muted-foreground">Ancho de plancha estándar (mm)</span>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={sheetWidth}
                        onChange={(e) => setSheetWidth(e.target.value)}
                        className={inputClass}
                        placeholder="p. ej. 1200"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-muted-foreground">Largo de plancha estándar (mm)</span>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={sheetLength}
                        onChange={(e) => setSheetLength(e.target.value)}
                        className={inputClass}
                        placeholder="p. ej. 2400"
                      />
                    </label>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'pricing' && (
            <div className="flex flex-col gap-4">
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Proveedor preferido</span>
                  <button
                    type="button"
                    onClick={() => setCreatingSupplier(true)}
                    className="text-xs text-primary hover:text-primary"
                  >
                    + nuevo proveedor
                  </button>
                </div>
                <Select
                  value={preferredSupplierId}
                  onChange={setPreferredSupplierId}
                  options={[
                    { value: '', label: '— Ninguno —' },
                    ...suppliers.map((s) => ({ value: s.id, label: s.name })),
                  ]}
                />
              </div>

              <div className={`grid ${hasVariants ? 'grid-cols-2' : 'grid-cols-3'} gap-3`}>
                <label className="flex flex-col gap-1">
                  <span className="text-sm text-muted-foreground">Costo inicial</span>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={costInput}
                    onChange={(e) => setCostInput(e.target.value)}
                    className={inputClass}
                    placeholder="Opcional"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-sm text-muted-foreground">% remarca</span>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={markupInput}
                    onChange={(e) => setMarkupInput(e.target.value)}
                    className={inputClass}
                    placeholder={defaultMarkup != null ? `Default: ${defaultMarkup}` : 'Opcional'}
                  />
                </label>
                {!hasVariants && (
                  <label className="flex flex-col gap-1">
                    <span className="text-sm text-muted-foreground">Precio de venta</span>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={priceInput}
                      onChange={(e) => setPriceInput(e.target.value)}
                      className={inputClass}
                    />
                  </label>
                )}
              </div>

              {hasVariants ? (
                <p className="text-xs text-muted-foreground">
                  El precio de venta se carga por variante en la pestaña &quot;Variantes&quot; - costo y % remarca de
                  acá sólo alimentan el precio sugerido de cada fila.
                </p>
              ) : (
                suggestedPrice !== null && (
                  <p className="text-xs text-muted-foreground">
                    Sugerido según costo × remarca: <span className="font-medium">${suggestedPrice.toFixed(2)}</span>{' '}
                    <button
                      type="button"
                      onClick={() => setPriceInput(suggestedPrice.toFixed(2))}
                      className="text-primary hover:underline"
                    >
                      Usar sugerido
                    </button>
                  </p>
                )
              )}
            </div>
          )}

          {tab === 'variant' && !hasVariants && (
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-sm text-muted-foreground">SKU</span>
                <input
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  className={inputClass}
                  placeholder="p. ej. AGUA-500 - podés escanear el código de barras acá"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm text-muted-foreground">Unidad de medida</span>
                <Select value={unitOfMeasure} onChange={setUnitOfMeasure} options={UNIT_OF_MEASURE_OPTIONS} />
              </label>
            </div>
          )}

          {tab === 'variant' && hasVariants && (
            <div className="flex flex-col gap-4">
              <label className="flex flex-col gap-1">
                <span className="text-sm text-muted-foreground">Unidad de medida</span>
                <Select value={unitOfMeasure} onChange={setUnitOfMeasure} options={UNIT_OF_MEASURE_OPTIONS} />
              </label>

              <div className="flex flex-col gap-2">
                <span className="text-sm text-muted-foreground">Atributos (ej: Color, Talle)</span>
                {variantAttributes.map((attr, i) => (
                  <div key={i} className="rounded-lg border border p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <input
                        value={attr.name}
                        onChange={(e) => renameAttribute(i, e.target.value)}
                        className={`${inputClass} flex-1`}
                        placeholder="Nombre del atributo (ej: Color)"
                      />
                      <button
                        type="button"
                        onClick={() => removeAttribute(i)}
                        className="text-xs text-destructive hover:underline"
                      >
                        Quitar atributo
                      </button>
                    </div>
                    {attr.values.length > 0 && (
                      <div className="mb-2 flex flex-wrap gap-1.5">
                        {attr.values.map((v) => (
                          <span
                            key={v}
                            className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                          >
                            {v}
                            <button
                              type="button"
                              onClick={() => removeAttributeValue(i, v)}
                              className="text-primary hover:text-primary"
                            >
                              ✕
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    <input
                      value={attributeDrafts[i] ?? ''}
                      onChange={(e) => setAttributeDrafts((prev) => prev.map((d, idx) => (idx === i ? e.target.value : d)))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ',') {
                          e.preventDefault();
                          commitAttributeValue(i);
                        }
                      }}
                      className={`${inputClass} w-full`}
                      placeholder="Escribí un valor y Enter (ej: Rojo)"
                    />
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addAttribute}
                  className="self-start text-xs text-primary hover:text-primary"
                >
                  + agregar atributo
                </button>
              </div>

              <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-sm text-muted-foreground">SKU base</span>
                  <input
                    value={skuBase}
                    onChange={(e) => setSkuBase(e.target.value)}
                    className={inputClass}
                    placeholder="p. ej. REMERA"
                  />
                </label>
                <button
                  type="button"
                  onClick={handleGenerateMatrix}
                  disabled={pendingCombos.length === 0 || pendingCombos.length > MAX_VARIANT_COMBOS}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:opacity-50"
                >
                  Generar combinaciones {pendingCombos.length > 0 ? `(${pendingCombos.length})` : ''}
                </button>
                {pendingCombos.length > MAX_VARIANT_COMBOS && (
                  <p className="text-xs text-destructive">
                    Máximo {MAX_VARIANT_COMBOS} variantes por artículo - sacá algún atributo o valor.
                  </p>
                )}
                {matrixRows.length > 0 && suggestedPrice !== null && (
                  <button
                    type="button"
                    onClick={applySuggestedPriceToAll}
                    className="text-xs text-primary hover:underline"
                  >
                    Aplicar precio sugerido (${suggestedPrice.toFixed(2)}) a todas
                  </button>
                )}
              </div>

              {matrixRows.length > 0 && (
                <div className="overflow-x-auto rounded-lg border border">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-muted text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2">Combinación</th>
                        <th className="px-3 py-2">SKU</th>
                        <th className="px-3 py-2">Precio</th>
                        {!isService && (
                          <>
                            <th className="px-3 py-2">Stock inicial</th>
                            <th className="px-3 py-2">Mínimo</th>
                          </>
                        )}
                        <th className="px-3 py-2">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {matrixRows.map((row) => {
                        const done = row.status === 'done';
                        return (
                          <tr key={row.key} className="border-t border">
                            <td className="px-3 py-2 whitespace-nowrap  ">
                              {Object.values(row.values).join(' / ')}
                            </td>
                            <td className="px-3 py-2">
                              <input
                                value={row.sku}
                                disabled={done}
                                onChange={(e) => updateMatrixRow(row.key, { sku: e.target.value })}
                                className={`${inputClass} w-32 disabled:opacity-60`}
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                min={0}
                                step="any"
                                value={row.price}
                                disabled={done}
                                onChange={(e) => updateMatrixRow(row.key, { price: e.target.value })}
                                className={`${inputClass} w-24 disabled:opacity-60`}
                              />
                            </td>
                            {!isService && (
                              <>
                                <td className="px-3 py-2">
                                  <input
                                    type="number"
                                    min={0}
                                    step="any"
                                    value={row.stock}
                                    disabled={done}
                                    onChange={(e) => updateMatrixRow(row.key, { stock: e.target.value })}
                                    className={`${inputClass} w-20 disabled:opacity-60`}
                                    placeholder="0"
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <input
                                    type="number"
                                    min={0}
                                    step="any"
                                    value={row.minStock}
                                    disabled={done}
                                    onChange={(e) => updateMatrixRow(row.key, { minStock: e.target.value })}
                                    className={`${inputClass} w-20 disabled:opacity-60`}
                                    placeholder="—"
                                  />
                                </td>
                              </>
                            )}
                            <td className="px-3 py-2">
                              {row.status === 'done' && <span className="text-green-600 dark:text-green-400">✓ creada</span>}
                              {row.status === 'error' && (
                                <span className="text-destructive" title={row.error}>
                                  ⚠ {row.error}
                                </span>
                              )}
                              {row.status === 'pending' && <span className="text-muted-foreground">—</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {tab === 'stock' && !isService && !hasVariants && (
            <div className="flex flex-col gap-4">
              <label className="flex flex-col gap-1">
                <span className="text-sm text-muted-foreground">Depósito inicial</span>
                <Select
                  value={warehouseId}
                  onChange={setWarehouseId}
                  placeholder="— Elegir depósito —"
                  options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-sm text-muted-foreground">Stock inicial</span>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={stockInput}
                    onChange={(e) => setStockInput(e.target.value)}
                    className={inputClass}
                    placeholder="0"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-sm text-muted-foreground">Stock mínimo para alertas</span>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={minimumStockInput}
                    onChange={(e) => setMinimumStockInput(e.target.value)}
                    className={inputClass}
                    placeholder="Opcional"
                  />
                </label>
              </div>
              {stockQuantity > 0 && (
                <p className="text-xs text-muted-foreground">
                  Se registra como un movimiento de compra (entrada) - por eso necesita el costo inicial cargado
                  en &quot;Precios y proveedor&quot;.
                </p>
              )}
            </div>
          )}

          {tab === 'stock' && !isService && hasVariants && (
            <div className="flex flex-col gap-4">
              <label className="flex flex-col gap-1">
                <span className="text-sm text-muted-foreground">Depósito inicial</span>
                <Select
                  value={warehouseId}
                  onChange={setWarehouseId}
                  placeholder="— Elegir depósito —"
                  options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
                />
              </label>
              <p className="text-xs text-muted-foreground">
                La cantidad y el mínimo de cada variante se cargan por fila en la pestaña &quot;Variantes&quot; - este
                depósito se usa para todas.
              </p>
            </div>
          )}

          {tab === 'media' && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <AttachmentSlot
                label="Imagen principal"
                hint="JPG, PNG o WebP"
                icon={ImageIcon}
                accept="image/jpeg,image/png,image/webp"
                file={imageFile}
                previewUrl={imagePreviewUrl}
                onPick={setPendingCropFile}
                onRemove={handleRemoveImage}
              />
              <AttachmentSlot
                label="Folleto"
                hint="PDF"
                icon={FileText}
                accept="application/pdf"
                file={brochureFile}
                onPick={setBrochureFile}
                onRemove={() => setBrochureFile(null)}
              />
              <AttachmentSlot
                label="Adjunto"
                hint="Archivo ZIP"
                icon={Archive}
                accept=".zip,application/zip,application/x-zip-compressed"
                file={zipFile}
                onPick={setZipFile}
                onRemove={() => setZipFile(null)}
              />
            </div>
          )}
        </div>

        {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

        <div className="mt-4 flex justify-end gap-3 border-t border pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-muted-foreground transition hover:  dark:hover: "
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={mutation.isPending}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:opacity-50"
          >
            {mutation.isPending ? 'Creando...' : 'Crear artículo'}
          </button>
        </div>
      </div>

      {creatingSupplier && (
        <CompanyFormModal
          lockedRole="SUPPLIER"
          onClose={() => setCreatingSupplier(false)}
          onSaved={(c) => setPreferredSupplierId(c.id)}
        />
      )}

      {pendingCropFile && (
        <ImageCropper
          file={pendingCropFile}
          onCancel={() => setPendingCropFile(null)}
          onApply={handleImageCropApplied}
        />
      )}
    </div>
  );
}
