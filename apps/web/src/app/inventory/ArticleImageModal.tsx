'use client';

import { Button } from '@/components/ui/button';
import { inventoryApi, resolveUploadUrl } from '@/lib/inventory';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useEffect, useState } from 'react';

interface Props {
  article: { id: string; name: string; imageUrl: string | null };
  onClose: () => void;
}

export default function ArticleImageModal({ article, onClose }: Props) {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(resolveUploadUrl(article.imageUrl));
  const [error, setError] = useState('');

  // Revoke the object URL for a locally-picked file when it's replaced or
  // this modal unmounts - it's only needed for the preview, not the
  // uploaded copy (that gets its own server-side URL back on save).
  useEffect(() => {
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['inventory-articles'] });
  }

  const uploadMutation = useMutation({
    mutationFn: (f: File) => inventoryApi.uploadArticleImage(article.id, f),
    onSuccess: () => {
      invalidate();
      onClose();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo subir la imagen';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  const removeMutation = useMutation({
    mutationFn: () => inventoryApi.removeArticleImage(article.id),
    onSuccess: () => {
      invalidate();
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 text-card-foreground shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Imagen de {article.name}</h2>
          <button onClick={onClose} className="text-muted-foreground transition hover:text-foreground">
            ✕
          </button>
        </div>

        <div className="mb-4 flex h-40 items-center justify-center overflow-hidden rounded-lg border bg-muted">
          {previewUrl ? (
            <img src={previewUrl} alt="" className="h-full w-full object-contain" />
          ) : (
            <span className="text-xs text-muted-foreground">Sin imagen</span>
          )}
        </div>

        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="mb-4 w-full text-sm"
        />

        {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

        <div className="flex justify-between gap-3">
          {article.imageUrl && !file ? (
            <Button
              type="button"
              variant="outline"
              className="border-destructive/40 text-destructive hover:bg-destructive/10"
              onClick={() => removeMutation.mutate()}
              disabled={removeMutation.isPending}
            >
              {removeMutation.isPending ? 'Quitando...' : 'Quitar imagen'}
            </Button>
          ) : (
            <span />
          )}
          <Button type="button" onClick={() => file && uploadMutation.mutate(file)} disabled={!file || uploadMutation.isPending}>
            {uploadMutation.isPending ? 'Subiendo...' : 'Guardar'}
          </Button>
        </div>
      </div>
    </div>
  );
}
