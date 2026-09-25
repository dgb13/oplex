'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Select from '@/components/ui/Select';
import { Textarea } from '@/components/ui/textarea';
import type { Article, Category } from '@/lib/inventory';
import {
  inventoryApi,
  resolveUploadUrl,
  UNIT_OF_MEASURE_OPTIONS,
} from '@/lib/inventory';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { FileArchive, FileText } from 'lucide-react';
import { useState } from 'react';

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

/** "Detalles" de un artículo ya creado - el único lugar para editarlo
 * después del alta (ArticleFormModal es sólo alta, ver su Props). De la
 * "medida comercial" sólo expone commercialLength (y sólo en LINEAL_1D) -
 * cada barra ya recibida guarda su propio largo, así que corregirlo sólo
 * afecta a las que entren después (ver UpdateArticleDto en el backend).
 * measurementType/purchaseSize/etc siguen fuera (ver el comentario de esos
 * campos en schema.prisma - cambiarlos con stock/piezas/BOM ya cargados
 * rompería su interpretación), igual que precio/proveedor/
 * imagen (cada uno ya tiene su propio modal). Sin <form> (mismo criterio
 * que ArticleFormModal tras el bug de forms anidados encontrado esa
 * sesión) - cada acción es su propio botón con su propia mutation. */
export default function ArticleDetailsModal({
  article,
  categories,
  onClose,
}: Props) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(article.name);
  const [categoryId, setCategoryId] = useState(article.categoryId ?? '');
  const [unitOfMeasure, setUnitOfMeasure] = useState(article.unitOfMeasure);
  // Unidad bloqueada si algo ya guarda cantidades del artículo (stock,
  // recetas, comprobantes...) - el backend lo rechaza igual, esto es para
  // deshabilitar el selector y explicar por qué. Mientras carga, también
  // deshabilitado (no ofrecer un cambio que después se rechace).
  const unitLockQuery = useQuery({
    queryKey: ['article-unit-of-measure-lock', article.id],
    queryFn: () => inventoryApi.getUnitOfMeasureLock(article.id),
    // Siempre fresco al abrir el modal, sin caché: con el staleTime global
    // (30s), agregar el artículo al carrito o registrarle un movimiento y
    // reabrir el modal enseguida mostraba la unidad habilitada con el dato
    // viejo (el backend igual lo rechazaba, pero con un error inesperado).
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
    isLineal &&
    commercialLength.trim() !== '' &&
    commercialLengthValue !== article.commercialLength;
  const [isService, setIsService] = useState(article.isService);
  const [isPublished, setIsPublished] = useState(article.isPublished);
  const [isManufactured, setIsManufactured] = useState(article.isManufactured);
  const [fieldsSaved, setFieldsSaved] = useState(false);
  const [fieldsError, setFieldsError] = useState('');

  const [description, setDescription] = useState(article.description ?? '');
  const [descriptionSaved, setDescriptionSaved] = useState(false);
  const [brochureFile, setBrochureFile] = useState<File | null>(null);
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [activeError, setActiveError] = useState('');

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['inventory-articles'] });
  }

  const fieldsMutation = useMutation({
    mutationFn: () =>
      inventoryApi.updateArticle(article.id, {
        name: name.trim(),
        categoryId: categoryId === '' ? null : categoryId,
        unitOfMeasure,
        isService,
        isPublished,
        isManufactured,
        commercialLength: commercialLengthChanged
          ? commercialLengthValue
          : undefined,
      }),
    onSuccess: () => {
      invalidate();
      setFieldsSaved(true);
      setFieldsError('');
      setTimeout(() => setFieldsSaved(false), 1500);
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message =
        err.response?.data?.message ?? 'No se pudieron guardar los cambios';
      setFieldsError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: () =>
      inventoryApi.updateArticle(article.id, { active: !article.active }),
    onSuccess: () => {
      invalidate();
      setActiveError('');
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message =
        err.response?.data?.message ??
        'No se pudo cambiar el estado del artículo';
      setActiveError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  const descriptionMutation = useMutation({
    mutationFn: () =>
      inventoryApi.updateArticle(article.id, {
        description: description.trim() === '' ? null : description,
      }),
    onSuccess: () => {
      invalidate();
      setDescriptionSaved(true);
      setTimeout(() => setDescriptionSaved(false), 1500);
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message =
        err.response?.data?.message ?? 'No se pudo guardar la descripción';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  const brochureUploadMutation = useMutation({
    mutationFn: (f: File) => inventoryApi.uploadArticleBrochure(article.id, f),
    onSuccess: () => {
      invalidate();
      setBrochureFile(null);
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message =
        err.response?.data?.message ?? 'No se pudo subir el folleto';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  const brochureRemoveMutation = useMutation({
    mutationFn: () => inventoryApi.removeArticleBrochure(article.id),
    onSuccess: invalidate,
  });

  const zipUploadMutation = useMutation({
    mutationFn: (f: File) =>
      inventoryApi.uploadArticleAttachmentZip(article.id, f),
    onSuccess: () => {
      invalidate();
      setZipFile(null);
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message =
        err.response?.data?.message ?? 'No se pudo subir el archivo ZIP';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  const zipRemoveMutation = useMutation({
    mutationFn: () => inventoryApi.removeArticleAttachmentZip(article.id),
    onSuccess: invalidate,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border bg-card p-6 text-card-foreground shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">
              Detalles de {article.name}
            </h2>
            {!article.active && (
              <Badge className="bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300">
                Inactivo
              </Badge>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground transition hover:text-foreground"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-3 rounded-lg border p-3">
            <div className="flex flex-col gap-2">
              <label className="text-sm text-muted-foreground">Nombre</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm text-muted-foreground">Categoría</label>
              <Select
                value={categoryId}
                onChange={setCategoryId}
                options={[
                  { value: '', label: 'Sin categoría' },
                  ...categories.map((c) => ({ value: c.id, label: c.name })),
                ]}
              />
            </div>
            <div
              className={
                isLineal ? 'grid grid-cols-2 gap-3' : 'flex flex-col gap-2'
              }
            >
              <div className="flex flex-col gap-2">
                <label className="text-sm text-muted-foreground">
                  Unidad de medida
                </label>
                <Select
                  value={unitOfMeasure}
                  onChange={setUnitOfMeasure}
                  options={UNIT_OF_MEASURE_OPTIONS}
                  disabled={unitLocked}
                />
              </div>
              {isLineal && (
                <div className="flex flex-col gap-2">
                  <label className="text-sm text-muted-foreground">
                    Largo comercial (mm)
                  </label>
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
              <p className="-mt-1 text-xs text-muted-foreground">
                La unidad no se puede cambiar: {unitLockReasons.join('; ')}. Si
                está mal cargada, desactivá este artículo y creá uno nuevo con
                la unidad correcta.
              </p>
            )}
            {isLineal && (
              <p className="-mt-1 text-xs text-muted-foreground">
                {commercialLengthInvalid
                  ? 'Ingresá un largo mayor a 0.'
                  : 'Se aplica a las barras que se reciban de ahora en más. Las que ya están en stock conservan su largo.'}
              </p>
            )}
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={isService}
                  onChange={(e) => setIsService(e.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
                Es servicio
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={isPublished}
                  onChange={(e) => setIsPublished(e.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
                Publicado
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={isManufactured}
                  onChange={(e) => setIsManufactured(e.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
                Se fabrica
              </label>
            </div>
            <div className="flex items-center gap-3">
              <Button
                size="sm"
                onClick={() => fieldsMutation.mutate()}
                disabled={
                  fieldsMutation.isPending ||
                  name.trim() === '' ||
                  commercialLengthInvalid
                }
              >
                {fieldsMutation.isPending ? 'Guardando...' : 'Guardar cambios'}
              </Button>
              {fieldsSaved && (
                <span className="text-xs text-green-600 dark:text-green-400">
                  Guardado
                </span>
              )}
            </div>
            {fieldsError && (
              <p className="text-sm text-destructive">{fieldsError}</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm text-muted-foreground">Descripción</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="Notas, detalles técnicos, especificaciones... (opcional, no se muestra en el catálogo)"
            />
            <div className="flex items-center gap-3">
              <Button
                size="sm"
                onClick={() => descriptionMutation.mutate()}
                disabled={descriptionMutation.isPending}
              >
                {descriptionMutation.isPending
                  ? 'Guardando...'
                  : 'Guardar descripción'}
              </Button>
              {descriptionSaved && (
                <span className="text-xs text-green-600 dark:text-green-400">
                  Guardado
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2 rounded-lg border p-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileText className="h-4 w-4" />
              Folleto (PDF)
            </div>
            {article.brochureUrl && (
              <a
                href={resolveUploadUrl(article.brochureUrl) ?? undefined}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-primary hover:underline"
              >
                Ver folleto actual
              </a>
            )}
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => setBrochureFile(e.target.files?.[0] ?? null)}
              className="text-sm"
            />
            <div className="flex justify-between gap-3">
              {article.brochureUrl && !brochureFile ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-destructive/40 text-destructive hover:bg-destructive/10"
                  onClick={() => brochureRemoveMutation.mutate()}
                  disabled={brochureRemoveMutation.isPending}
                >
                  {brochureRemoveMutation.isPending
                    ? 'Quitando...'
                    : 'Quitar folleto'}
                </Button>
              ) : (
                <span />
              )}
              <Button
                size="sm"
                onClick={() =>
                  brochureFile && brochureUploadMutation.mutate(brochureFile)
                }
                disabled={!brochureFile || brochureUploadMutation.isPending}
              >
                {brochureUploadMutation.isPending
                  ? 'Subiendo...'
                  : 'Subir folleto'}
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-2 rounded-lg border p-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileArchive className="h-4 w-4" />
              Adjunto (ZIP)
            </div>
            {article.attachmentZipUrl && (
              <a
                href={resolveUploadUrl(article.attachmentZipUrl) ?? undefined}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-primary hover:underline"
              >
                Descargar ZIP actual
              </a>
            )}
            <input
              type="file"
              accept=".zip,application/zip,application/x-zip-compressed"
              onChange={(e) => setZipFile(e.target.files?.[0] ?? null)}
              className="text-sm"
            />
            <div className="flex justify-between gap-3">
              {article.attachmentZipUrl && !zipFile ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-destructive/40 text-destructive hover:bg-destructive/10"
                  onClick={() => zipRemoveMutation.mutate()}
                  disabled={zipRemoveMutation.isPending}
                >
                  {zipRemoveMutation.isPending ? 'Quitando...' : 'Quitar ZIP'}
                </Button>
              ) : (
                <span />
              )}
              <Button
                size="sm"
                onClick={() => zipFile && zipUploadMutation.mutate(zipFile)}
                disabled={!zipFile || zipUploadMutation.isPending}
              >
                {zipUploadMutation.isPending ? 'Subiendo...' : 'Subir ZIP'}
              </Button>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <div className="mt-4 flex items-center justify-between">
          <button
            onClick={() => toggleActiveMutation.mutate()}
            disabled={toggleActiveMutation.isPending}
            className={
              article.active
                ? 'rounded-lg border border-destructive/30 px-3 py-1.5 text-xs text-destructive transition hover:bg-destructive/10 disabled:opacity-50'
                : 'rounded-lg border border-green-300 px-3 py-1.5 text-xs text-green-600 transition hover:bg-green-50 disabled:opacity-50 dark:border-green-800 dark:text-green-400 dark:hover:bg-green-950'
            }
          >
            {toggleActiveMutation.isPending
              ? 'Guardando...'
              : article.active
                ? 'Desactivar artículo'
                : 'Activar artículo'}
          </button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cerrar
          </Button>
        </div>
        {activeError && (
          <p className="mt-2 text-right text-xs text-destructive">
            {activeError}
          </p>
        )}
      </div>
    </div>
  );
}
