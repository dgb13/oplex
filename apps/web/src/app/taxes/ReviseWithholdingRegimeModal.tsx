'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ARGENTINE_JURISDICTION_LABELS, withholdingRegimesApi, type ArgentineJurisdiction, type WithholdingRegime } from '@/lib/taxes';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';

interface Props {
  regime: WithholdingRegime;
  onClose: () => void;
}

const selectClass =
  'h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

const JURISDICTION_OPTIONS = Object.keys(ARGENTINE_JURISDICTION_LABELS) as ArgentineJurisdiction[];

export default function ReviseWithholdingRegimeModal({ regime, onClose }: Props) {
  const queryClient = useQueryClient();
  const [rate, setRate] = useState(regime.rate);
  const [jurisdiction, setJurisdiction] = useState<ArgentineJurisdiction | ''>(regime.jurisdiction ?? '');
  const [minTaxableAmount, setMinTaxableAmount] = useState(regime.minTaxableAmount);
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      withholdingRegimesApi.revise({
        code: regime.code,
        rate: rate ? Number(rate) : undefined,
        jurisdiction: regime.taxType === 'GROSS_INCOME' && jurisdiction ? jurisdiction : undefined,
        minTaxableAmount: minTaxableAmount ? Number(minTaxableAmount) : undefined,
        effectiveFrom: effectiveFrom || undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['withholding-regimes'] });
      onClose();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo revisar el régimen';
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
            Revisar {regime.code} — {regime.name}
          </h2>
          <button onClick={onClose} className="text-muted-foreground transition hover:text-foreground">
            ✕
          </button>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">
          Cierra la vigencia actual en la fecha de efecto y crea una nueva versión — los pagos ya
          registrados mantienen la retención que se calculó en su momento.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm text-muted-foreground">Nueva tasa (%)</label>
            <Input type="number" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} />
          </div>
          {regime.taxType === 'GROSS_INCOME' && (
            <div className="flex flex-col gap-1">
              <label className="text-sm text-muted-foreground">Jurisdicción</label>
              <select
                className={selectClass}
                value={jurisdiction}
                onChange={(e) => setJurisdiction(e.target.value as ArgentineJurisdiction)}
              >
                <option value="">Elegí una provincia...</option>
                {JURISDICTION_OPTIONS.map((j) => (
                  <option key={j} value={j}>
                    {ARGENTINE_JURISDICTION_LABELS[j]}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <label className="text-sm text-muted-foreground">Nuevo mínimo no imponible</label>
            <Input
              type="number"
              step="0.01"
              value={minTaxableAmount}
              onChange={(e) => setMinTaxableAmount(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-muted-foreground">
              Vigente desde (opcional, por defecto ahora)
            </label>
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
