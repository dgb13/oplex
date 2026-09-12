'use client';

import { PDF_STYLES, purchasePreferencesApi, type PdfStyle } from '@/lib/purchases';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useEffect, useState } from 'react';

const inputClass =
  'h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

export default function ConfiguracionTab() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['purchase-preferences'],
    queryFn: purchasePreferencesApi.get,
  });

  const [quoteRequestPrefix, setQuoteRequestPrefix] = useState('');
  const [purchaseOrderPrefix, setPurchaseOrderPrefix] = useState('');
  const [pdfStyle, setPdfStyle] = useState<PdfStyle>('MODERNO');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!data) return;
    setQuoteRequestPrefix(data.quoteRequestPrefix);
    setPurchaseOrderPrefix(data.purchaseOrderPrefix);
    setPdfStyle(data.purchaseDocumentPdfStyle);
  }, [data]);

  const mutation = useMutation({
    mutationFn: () =>
      purchasePreferencesApi.update({
        quoteRequestPrefix,
        purchaseOrderPrefix,
        purchaseDocumentPdfStyle: pdfStyle,
      }),
    onSuccess: () => {
      setError('');
      setMessage('Guardado');
      void queryClient.invalidateQueries({ queryKey: ['purchase-preferences'] });
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      setMessage('');
      const msg = err.response?.data?.message ?? 'No se pudo guardar';
      setError(Array.isArray(msg) ? msg.join(', ') : msg);
    },
  });

  if (isLoading || !data) {
    return <p className="text-sm text-muted-foreground">Cargando...</p>;
  }

  function preview(prefix: string, nextNumber: number): string {
    return `${prefix || '···'}-${String(nextNumber).padStart(6, '0')}`;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border bg-card p-6">
        <h2 className="mb-1 text-sm font-medium text-muted-foreground">
          Numeración de tus documentos
        </h2>
        <p className="mb-4 text-xs text-muted-foreground">
          Cada usuario elige cómo identifica sus propios pedidos y órdenes — cada uno lleva su
          numeración correlativa por separado.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label className="text-sm text-muted-foreground">
              Prefijo de Pedidos de Cotización
            </label>
            <input
              className={inputClass}
              value={quoteRequestPrefix}
              onChange={(e) => setQuoteRequestPrefix(e.target.value.toUpperCase())}
              placeholder="PED"
              maxLength={12}
            />
            <p className="text-xs text-muted-foreground">
              Así se verá: {preview(quoteRequestPrefix, data.quoteRequestNextNumber)}
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-muted-foreground">
              Prefijo de Órdenes de Compra
            </label>
            <input
              className={inputClass}
              value={purchaseOrderPrefix}
              onChange={(e) => setPurchaseOrderPrefix(e.target.value.toUpperCase())}
              placeholder="OC"
              maxLength={12}
            />
            <p className="text-xs text-muted-foreground">
              Así se verá: {preview(purchaseOrderPrefix, data.purchaseOrderNextNumber)}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-6">
        <h2 className="mb-1 text-sm font-medium text-muted-foreground">
          Estilo preferido de PDF
        </h2>
        <p className="mb-4 text-xs text-muted-foreground">
          Se usa por defecto al generar el PDF de un pedido u orden — se puede cambiar puntualmente
          al descargar.
        </p>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {PDF_STYLES.map((style) => (
            <button
              key={style.value}
              type="button"
              onClick={() => setPdfStyle(style.value)}
              className={`flex flex-col items-center gap-2 rounded-xl border-2 p-3 text-center transition ${
                pdfStyle === style.value ? 'border-primary bg-primary/5' : 'hover:border-ring'
              }`}
            >
              <PdfStyleMockup style={style.value} />
              <span className="text-xs font-medium">{style.label}</span>
              <span className="text-[10px] text-muted-foreground">{style.description}</span>
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {message && <p className="text-sm text-green-600 dark:text-green-400">{message}</p>}
      <button
        type="button"
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending}
        className="self-start rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
      >
        {mutation.isPending ? 'Guardando...' : 'Guardar cambios'}
      </button>
    </div>
  );
}

/** Cheap CSS-only mini mockup, not an actual PDF render - just enough to
 * tell the 5 styles apart visually when picking one. */
function PdfStyleMockup({ style }: { style: PdfStyle }) {
  switch (style) {
    case 'MODERNO':
      return (
        <div className="h-16 w-12 rounded border border-slate-300 bg-white p-1">
          <div className="mb-1 h-2 rounded-sm bg-primary" />
          <div className="h-0.5 w-2/3 rounded-sm bg-slate-300" />
          <div className="mt-1 h-0.5 w-full rounded-sm bg-slate-300" />
          <div className="mt-0.5 h-0.5 w-full rounded-sm bg-slate-300" />
        </div>
      );
    case 'COMPACTO':
      return (
        <div className="h-16 w-12 border border-slate-400 bg-white p-1">
          <div className="mb-0.5 h-0.5 w-full bg-slate-800" />
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="mt-0.5 h-0.5 w-full bg-slate-300" />
          ))}
        </div>
      );
    case 'TRADICIONAL':
      return (
        <div className="flex h-16 w-12 flex-col items-center border-2 border-slate-900 bg-white p-1">
          <div className="mb-1 h-1.5 w-8 bg-slate-900" />
          <div className="mt-auto h-4 w-full border border-slate-900" />
        </div>
      );
    case 'NATURAL':
      return (
        <div className="h-16 w-12 rounded-lg border border-amber-200 bg-amber-50 p-1">
          <div className="mb-1 h-2 rounded-md bg-amber-300" />
          <div className="h-3 w-full rounded-md bg-amber-100" />
        </div>
      );
    case 'LETRAS_GRANDES':
      return (
        <div className="flex h-16 w-12 flex-col justify-center gap-1 border border-slate-300 bg-white p-1">
          <div className="h-2 w-full rounded-sm bg-slate-800" />
          <div className="h-2 w-full rounded-sm bg-slate-800" />
        </div>
      );
  }
}
