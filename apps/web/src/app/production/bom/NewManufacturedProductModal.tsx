'use client';

import type { ArticlePickerOption } from '@/components/ArticlePicker';
import AttachmentSlot from '@/components/AttachmentSlot';
import ImageCropper from '@/components/ImageCropper';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Select from '@/components/ui/Select';
import { inventoryApi } from '@/lib/inventory';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { Check, Image as ImageIcon, X } from 'lucide-react';
import { useEffect, useState } from 'react';

// Un producto fabricado se vende por unidad o por kilo (decisión del
// usuario) - por kilo sigue siendo discreto (cantidades con decimales),
// sólo cambia la unidad que se muestra (ver stockUnitLabel).
const SELL_UNIT_OPTIONS = [
  { value: 'UNIT', label: 'Unidad' },
  { value: 'KG', label: 'Kilo' },
];

/** "Mesa de trabajo 800x1500mm" → "MESA-DE-TRABAJO-800X1500MM" - sólo una
 * sugerencia editable, mismo criterio que el SKU sugerido de
 * ArticleFormModal (sin acentos ni símbolos). */
function suggestSku(name: string): string {
  return name
    .normalize('NFD')
    .replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
}

/**
 * Alta de un producto que se fabrica, desde Recetas - paso 1 de 2 (el paso
 * 2 es la receta en sí, en la misma página). A diferencia del "Nuevo
 * artículo" genérico, pide sólo lo que tiene sentido para algo que se
 * produce: nada de servicio/variantes/stock inicial/costo. Queda marcado
 * como fabricable desde el vamos (así aparece en "Producto a fabricar") y
 * el precio de venta es opcional: se guarda en 0 hasta que se cargue,
 * típicamente después de ver el costo de la receta.
 */
export default function NewManufacturedProductModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (option: ArticlePickerOption, byKilo: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const categoriesQuery = useQuery({ queryKey: ['inventory-categories'], queryFn: inventoryApi.listCategories });

  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [skuTouched, setSkuTouched] = useState(false);
  const [categoryId, setCategoryId] = useState('');
  const [sellUnit, setSellUnit] = useState('UNIT');
  const [price, setPrice] = useState('');
  const [error, setError] = useState('');

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [pendingCropFile, setPendingCropFile] = useState<File | null>(null);
  useEffect(() => {
    return () => {
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    };
  }, [imagePreviewUrl]);

  const effectiveSku = skuTouched ? sku : suggestSku(name);

  const mutation = useMutation({
    mutationFn: async (): Promise<ArticlePickerOption> => {
      const unitPrice = price.trim() === '' ? 0 : Number(price);
      const article = await inventoryApi.createArticle({
        name: name.trim(),
        unitOfMeasure: sellUnit,
        categoryId: categoryId || undefined,
        isService: false,
        isPublished: true,
        hasVariants: false,
        isManufactured: true,
        measurementType: 'DISCRETE',
      });
      const variant = await inventoryApi.createArticleVariant({
        articleId: article.id,
        sku: effectiveSku.trim(),
        unitPrice,
      });
      const withImage = imageFile ? await inventoryApi.uploadArticleImage(article.id, imageFile) : null;
      return {
        id: variant.id,
        articleName: article.name,
        variantLabel: null,
        sku: variant.sku,
        imageUrl: withImage?.imageUrl ?? null,
        categoryName: null,
        unitPrice,
        totalStock: 0,
        minimumStock: null,
        taxRate: 0,
        taxKind: 'GRAVADO',
        isManufactured: true,
        measurementType: 'DISCRETE',
      };
    },
    onSuccess: (option) => {
      void queryClient.invalidateQueries({ queryKey: ['inventory-articles'] });
      onCreated(option, sellUnit === 'KG');
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo crear el producto';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!name.trim()) {
      setError('Ingresá el nombre del producto');
      return;
    }
    if (!effectiveSku.trim()) {
      setError('Ingresá un código (SKU)');
      return;
    }
    if (price.trim() !== '' && !(Number(price) >= 0)) {
      setError('El precio de venta tiene que ser un número (o dejalo vacío)');
      return;
    }
    mutation.mutate();
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
      <form
        onSubmit={handleSubmit}
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border bg-card text-card-foreground shadow-2xl"
      >
        <div className="flex flex-col gap-3 border-b px-5 pt-5 pb-4">
          <div className="flex items-start justify-between gap-3">
            <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold">
              Nuevo producto fabricable
              <Badge className="bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300">con receta</Badge>
            </h2>
            <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Cerrar">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="flex items-center gap-1.5 font-medium">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] text-primary-foreground">
                1
              </span>
              El producto
            </span>
            <span className="h-px flex-1 bg-border" />
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[11px]">2</span>
              Lista de materiales
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-4 overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-[7rem_minmax(0,1fr)] items-start gap-4">
            <AttachmentSlot
              label="Foto"
              hint="Opcional"
              icon={ImageIcon}
              accept="image/jpeg,image/png,image/webp"
              file={imageFile}
              previewUrl={imagePreviewUrl}
              onPick={setPendingCropFile}
              onRemove={() => {
                setImageFile(null);
                setImagePreviewUrl(null);
              }}
            />
            <div className="flex flex-col gap-1">
              <label htmlFor="mp-name" className="text-sm text-muted-foreground">
                Nombre del producto
              </label>
              <Input
                id="mp-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="p. ej. Mesa de trabajo 800x1500mm"
                autoFocus
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label htmlFor="mp-sku" className="text-sm text-muted-foreground">
                Código (SKU)
              </label>
              <Input
                id="mp-sku"
                className="font-mono"
                value={effectiveSku}
                onChange={(e) => {
                  setSkuTouched(true);
                  setSku(e.target.value);
                }}
              />
              {!skuTouched && name.trim() && <p className="text-xs text-muted-foreground">Sugerido a partir del nombre.</p>}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm text-muted-foreground">Categoría</label>
              <Select
                value={categoryId}
                onChange={setCategoryId}
                options={[
                  { value: '', label: '— Sin categoría —' },
                  ...(categoriesQuery.data ?? []).map((c) => ({ value: c.id, label: c.name })),
                ]}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm text-muted-foreground">Se vende por</label>
              <Select value={sellUnit} onChange={setSellUnit} options={SELL_UNIT_OPTIONS} />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="mp-price" className="text-sm text-muted-foreground">
                Precio de venta {sellUnit === 'KG' ? 'por kilo' : ''}
              </label>
              <Input
                id="mp-price"
                type="number"
                min={0}
                step="any"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="Opcional"
              />
              <p className="text-xs text-muted-foreground">Podés cargarlo después de ver el costo de la receta.</p>
            </div>
          </div>

          <div className="flex flex-col gap-1 rounded-lg bg-primary/10 px-3 py-2.5 text-sm">
            <p className="font-medium text-primary">Esto se completa solo</p>
            {[
              'Queda marcado como producto fabricable.',
              'Sin stock inicial: el stock entra al completar cada orden de producción.',
              'El costo sale de la receta, no se carga a mano.',
            ].map((text) => (
              <p key={text} className="flex items-start gap-1.5 text-muted-foreground">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                {text}
              </p>
            ))}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t bg-muted/50 px-5 py-3">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Creando...' : 'Crear y armar receta →'}
          </Button>
        </div>
      </form>

      {pendingCropFile && (
        <ImageCropper
          file={pendingCropFile}
          onCancel={() => setPendingCropFile(null)}
          onApply={(cropped) => {
            setImageFile(cropped);
            setImagePreviewUrl(URL.createObjectURL(cropped));
            setPendingCropFile(null);
          }}
        />
      )}
    </div>
  );
}
