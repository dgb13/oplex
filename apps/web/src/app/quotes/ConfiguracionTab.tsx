'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PDF_STYLES, quotePreferencesApi, type PdfStyle } from '@/lib/quotes';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useEffect, useState } from 'react';

export default function ConfiguracionTab() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['quote-preferences'],
    queryFn: quotePreferencesApi.get,
  });

  const [quotePrefix, setQuotePrefix] = useState('');
  const [pdfStyle, setPdfStyle] = useState<PdfStyle>('MODERNO');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!data) return;
    setQuotePrefix(data.quotePrefix);
    setPdfStyle(data.quotePdfStyle);
  }, [data]);

  const mutation = useMutation({
    mutationFn: () => quotePreferencesApi.update({ quotePrefix, quotePdfStyle: pdfStyle }),
    onSuccess: () => {
      setError('');
      setMessage('Guardado');
      void queryClient.invalidateQueries({ queryKey: ['quote-preferences'] });
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

  const preview = `${quotePrefix || '···'}-${String(data.quoteNextNumber).padStart(6, '0')}`;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent>
        <h2 className="mb-1 text-sm font-medium text-muted-foreground">Numeración de tus cotizaciones</h2>
        <p className="mb-4 text-xs text-muted-foreground">
          Cada usuario elige cómo identifica sus propias cotizaciones — numeración correlativa por separado.
        </p>
        <div className="max-w-xs">
          <label className="text-sm text-muted-foreground">Prefijo</label>
          <Input
            className="mt-1 w-full"
            value={quotePrefix}
            onChange={(e) => setQuotePrefix(e.target.value.toUpperCase())}
            placeholder="PRE"
            maxLength={12}
          />
          <p className="mt-1 text-xs text-muted-foreground">Así se verá: {preview}</p>
        </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
        <h2 className="mb-1 text-sm font-medium text-muted-foreground">Estilo preferido de PDF</h2>
        <p className="mb-4 text-xs text-muted-foreground">
          Se usa por defecto al generar el PDF de una cotización — se puede cambiar puntualmente al descargar.
        </p>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {PDF_STYLES.map((style) => (
            <button
              key={style.value}
              type="button"
              onClick={() => setPdfStyle(style.value)}
              className={`flex flex-col items-center gap-2 rounded-xl border-2 p-3 text-center transition ${
                pdfStyle === style.value
                  ? 'border-primary bg-primary/10'
                  : 'hover:border-muted-foreground/50'
              }`}
            >
              <span className="text-xs font-medium">{style.label}</span>
              <span className="text-[10px] text-muted-foreground">{style.description}</span>
            </button>
          ))}
        </div>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {message && <p className="text-sm text-emerald-600 dark:text-emerald-400">{message}</p>}
      <Button type="button" className="self-start" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
        {mutation.isPending ? 'Guardando...' : 'Guardar cambios'}
      </Button>
    </div>
  );
}
