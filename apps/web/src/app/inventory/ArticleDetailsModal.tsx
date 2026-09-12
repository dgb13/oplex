'use client';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { inventoryApi, resolveUploadUrl } from '@/lib/inventory';
import { useMutation, useQueryClient } from '@tanstack/react-query';
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
  };
  onClose: () => void;
}

/** "Dato extra" del artículo (descripción larga + folleto PDF + adjunto
 * ZIP) - a propósito en su propio modal, no en el panel principal de
 * Inventario, ni en el alta rápida de ArticleFormModal. Sin <form> (mismo
 * criterio que ArticleFormModal tras el bug de forms anidados encontrado
 * esa sesión) - cada acción es su propio botón con su propia mutation. */
export default function ArticleDetailsModal({ article, onClose }: Props) {
  const queryClient = useQueryClient();
  const [description, setDescription] = useState(article.description ?? '');
  const [descriptionSaved, setDescriptionSaved] = useState(false);
  const [brochureFile, setBrochureFile] = useState<File | null>(null);
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [error, setError] = useState('');

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['inventory-articles'] });
  }

  const descriptionMutation = useMutation({
    mutationFn: () =>
      inventoryApi.updateArticle(article.id, { description: description.trim() === '' ? null : description }),
    onSuccess: () => {
      invalidate();
      setDescriptionSaved(true);
      setTimeout(() => setDescriptionSaved(false), 1500);
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo guardar la descripción';
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
      const message = err.response?.data?.message ?? 'No se pudo subir el folleto';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
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
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo subir el archivo ZIP';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  const zipRemoveMutation = useMutation({
    mutationFn: () => inventoryApi.removeArticleAttachmentZip(article.id),
    onSuccess: invalidate,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-xl border bg-card p-6 text-card-foreground shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Detalles de {article.name}</h2>
          <button onClick={onClose} className="text-muted-foreground transition hover:text-foreground">
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <label className="text-sm text-muted-foreground">Descripción</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="Notas, detalles técnicos, especificaciones... (opcional, no se muestra en el catálogo)"
            />
            <div className="flex items-center gap-3">
              <Button size="sm" onClick={() => descriptionMutation.mutate()} disabled={descriptionMutation.isPending}>
                {descriptionMutation.isPending ? 'Guardando...' : 'Guardar descripción'}
              </Button>
              {descriptionSaved && <span className="text-xs text-green-600 dark:text-green-400">Guardado</span>}
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
                  {brochureRemoveMutation.isPending ? 'Quitando...' : 'Quitar folleto'}
                </Button>
              ) : (
                <span />
              )}
              <Button
                size="sm"
                onClick={() => brochureFile && brochureUploadMutation.mutate(brochureFile)}
                disabled={!brochureFile || brochureUploadMutation.isPending}
              >
                {brochureUploadMutation.isPending ? 'Subiendo...' : 'Subir folleto'}
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

        <div className="mt-4 flex justify-end">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </div>
    </div>
  );
}
