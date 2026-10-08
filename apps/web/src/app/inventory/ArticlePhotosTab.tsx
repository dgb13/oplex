'use client';

import { inventoryApi, resolveUploadUrl, type ArticleImage } from '@/lib/inventory';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { Star, X } from 'lucide-react';
import { shrinkImage } from '@/lib/shrinkImage';
import { useRef, useState } from 'react';

const MAX_PHOTOS = 8;
function apiMessage(err: unknown, fallback: string): string {
  const message = (err as AxiosError<{ message?: string | string[] }>).response?.data?.message ?? fallback;
  return Array.isArray(message) ? message.join(', ') : message;
}

/** Pestaña "Fotos" de la ficha del artículo (boceto aprobado, pantalla 3).
 * Todo se guarda al instante, como los adjuntos. */
export default function ArticlePhotosTab({ articleId }: { articleId: string }) {
  const queryClient = useQueryClient();
  const queryKey = ['article-images', articleId];
  const imagesQuery = useQuery({ queryKey, queryFn: () => inventoryApi.listArticleImages(articleId) });
  const images = imagesQuery.data ?? [];
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(0);
  const [preview, setPreview] = useState(0);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  function applied(next: ArticleImage[]) {
    queryClient.setQueryData(queryKey, next);
    // La principal se ve en el listado de Inventario, el POS y la tienda.
    void queryClient.invalidateQueries({ queryKey: ['articles'] });
    void queryClient.invalidateQueries({ queryKey: ['inventory-articles'] });
  }

  const reorder = useMutation({
    mutationFn: (ids: string[]) => inventoryApi.reorderArticleImages(articleId, ids),
    onSuccess: applied,
    onError: (err) => {
      setError(apiMessage(err, 'No se pudo cambiar el orden'));
      void queryClient.invalidateQueries({ queryKey });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => inventoryApi.removeArticleImageById(id),
    onSuccess: (next) => {
      applied(next);
      setPreview(0);
    },
    onError: (err) => setError(apiMessage(err, 'No se pudo quitar la foto')),
  });

  async function addFiles(files: FileList | File[]) {
    setError('');
    const list = [...files].filter((f) => /^image\/(jpeg|png|webp)$/.test(f.type));
    if (list.length === 0) {
      setError('Elegí fotos JPG, PNG o WEBP');
      return;
    }
    const free = MAX_PHOTOS - images.length;
    if (list.length > free) setError(`Entran ${MAX_PHOTOS} fotos por artículo: se suben las primeras ${free}.`);
    for (const file of list.slice(0, Math.max(0, free))) {
      setUploading((n) => n + 1);
      try {
        const { blob, name } = await shrinkImage(file);
        applied(await inventoryApi.addArticleImage(articleId, blob, name));
      } catch (err) {
        setError(apiMessage(err, `No se pudo subir ${file.name}`));
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  function move(from: number, to: number) {
    if (from === to) return;
    const ids = images.map((i) => i.id);
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved);
    queryClient.setQueryData(
      queryKey,
      ids.map((id) => images.find((i) => i.id === id)).filter((i): i is ArticleImage => !!i),
    );
    setPreview(0);
    reorder.mutate(ids);
  }

  const current = images[Math.min(preview, images.length - 1)];

  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_220px]">
      <div className="flex flex-col gap-4">
        <div
          className="grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-3"
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes('Files')) e.preventDefault();
          }}
          onDrop={(e) => {
            if (e.dataTransfer.files.length > 0) {
              e.preventDefault();
              void addFiles(e.dataTransfer.files);
            }
          }}
        >
          {images.map((img, i) => (
            <div
              key={img.id}
              draggable
              onDragStart={(e) => {
                setDragFrom(i);
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragEnd={() => {
                setDragFrom(null);
                setDragOver(null);
              }}
              onDragOver={(e) => {
                if (dragFrom === null) return;
                e.preventDefault();
                setDragOver(i);
              }}
              onDrop={(e) => {
                if (dragFrom === null) return;
                e.preventDefault();
                e.stopPropagation();
                move(dragFrom, i);
                setDragFrom(null);
                setDragOver(null);
              }}
              className={`group relative cursor-grab overflow-hidden rounded-xl border bg-muted transition ${dragFrom === i ? 'opacity-40' : ''} ${dragOver === i && dragFrom !== i ? 'ring-3 ring-primary' : ''}`}
            >
              <img src={resolveUploadUrl(img.url) ?? ''} alt={`Foto ${i + 1}`} className="aspect-[4/5] w-full object-cover" draggable={false} />
              {i === 0 ? (
                <span className="absolute left-2 top-2 rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground">Principal</span>
              ) : (
                <span className="absolute left-2 top-2 grid h-5 w-5 place-items-center rounded-full bg-black/55 text-[11px] font-bold text-white">{i + 1}</span>
              )}
              <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
                {i > 0 && (
                  <button
                    type="button"
                    onClick={() => move(i, 0)}
                    title="Usar como principal"
                    aria-label="Usar como principal"
                    className="grid h-7 w-7 place-items-center rounded-lg bg-white/95 text-neutral-800 shadow"
                  >
                    <Star className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => remove.mutate(img.id)}
                  disabled={remove.isPending}
                  title="Quitar"
                  aria-label="Quitar foto"
                  className="grid h-7 w-7 place-items-center rounded-lg bg-white/95 text-neutral-800 shadow"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 to-transparent px-2 py-1.5 text-[11px] text-white opacity-0 transition group-hover:opacity-100">
                Arrastrá para ordenar
              </span>
            </div>
          ))}
          {images.length + uploading < MAX_PHOTOS && (
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="flex aspect-[4/5] flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed p-3 text-center text-xs text-muted-foreground transition hover:border-primary"
            >
              <b className="text-sm text-primary">{uploading > 0 ? 'Subiendo...' : '+ Agregar fotos'}</b>
              Arrastralas acá o tocá para elegir
              <span>
                {MAX_PHOTOS - images.length} lugar{MAX_PHOTOS - images.length === 1 ? '' : 'es'} libre{MAX_PHOTOS - images.length === 1 ? '' : 's'}
              </span>
            </button>
          )}
          <input
            ref={fileInput}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              if (e.target.files) void addFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <ul className="flex flex-col gap-1.5 text-xs leading-relaxed text-muted-foreground">
          <li>• Hasta 8 fotos por artículo. JPG, PNG o WEBP; se achican solas para que la tienda cargue rápido.</li>
          <li>
            • La <b className="text-foreground">principal</b> es la que se ve en el catálogo, en el POS y en la tienda. Las demás aparecen en la galería al abrir el artículo.
          </li>
          <li>• Arrastrá para cambiar el orden. Con la estrella elegís otra como principal.</li>
          <li>• Las fotos se guardan al subirlas, ordenarlas o quitarlas.</li>
        </ul>
      </div>

      <div className="flex flex-col gap-2 rounded-xl border p-3">
        <span className="text-xs font-semibold text-muted-foreground">Así se ve en la tienda</span>
        <div className="relative aspect-[4/5] overflow-hidden rounded-lg bg-muted">
          {current ? (
            <img src={resolveUploadUrl(current.url) ?? ''} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="absolute inset-0 grid place-items-center text-xs text-muted-foreground">Sin fotos</span>
          )}
        </div>
        {images.length > 1 && (
          <div className="flex gap-1.5">
            {images.map((img, i) => (
              <button
                key={img.id}
                type="button"
                onClick={() => setPreview(i)}
                aria-current={i === preview}
                aria-label={`Foto ${i + 1}`}
                className={`aspect-[4/5] flex-1 overflow-hidden rounded-md border-2 ${i === preview ? 'border-primary' : 'border-transparent opacity-60'}`}
              >
                <img src={resolveUploadUrl(img.url) ?? ''} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
