'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { taxesApi, type TaxDefinition } from '@/lib/taxes';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';

interface Props {
  definition: TaxDefinition;
  onClose: () => void;
}

export default function ReviseTaxDefinitionModal({ definition, onClose }: Props) {
  const queryClient = useQueryClient();
  const [rate, setRate] = useState(definition.rate ?? '');
  const [fixedAmount, setFixedAmount] = useState(definition.fixedAmount ?? '');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      taxesApi.reviseTaxDefinition({
        code: definition.code,
        rate: definition.calculationType === 'PERCENTAGE' && rate ? Number(rate) : undefined,
        fixedAmount:
          definition.calculationType === 'FIXED_AMOUNT' && fixedAmount ? Number(fixedAmount) : undefined,
        effectiveFrom: effectiveFrom || undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tax-definitions'] });
      onClose();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo revisar el impuesto';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    mutation.mutate();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            Revisar {definition.code} — {definition.name}
          </h2>
          <button onClick={onClose} className="text-muted-foreground transition hover:text-foreground">
            ✕
          </button>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">
          Cierra la vigencia actual en la fecha de efecto y crea una nueva versión — las facturas ya
          emitidas mantienen el valor que tenían cuando se calcularon.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {definition.calculationType === 'PERCENTAGE' && (
            <div className="flex flex-col gap-1">
              <label className="text-sm text-muted-foreground">Nueva tasa (%)</label>
              <Input type="number" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} />
            </div>
          )}
          {definition.calculationType === 'FIXED_AMOUNT' && (
            <div className="flex flex-col gap-1">
              <label className="text-sm text-muted-foreground">Nuevo monto fijo</label>
              <Input
                type="number"
                step="0.01"
                value={fixedAmount}
                onChange={(e) => setFixedAmount(e.target.value)}
              />
            </div>
          )}
          <div className="flex flex-col gap-1">
            <label className="text-sm text-muted-foreground">Vigente desde (opcional, por defecto ahora)</label>
            <Input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="mt-2 flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Guardando...' : 'Guardar revisión'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
