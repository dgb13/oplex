'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Select from '@/components/ui/Select';
import {
  ARGENTINE_JURISDICTION_LABELS,
  WITHHOLDING_TAX_TYPE_LABELS,
  withholdingRegimesApi,
  type ArgentineJurisdiction,
  type WithholdingTaxType,
} from '@/lib/taxes';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';

interface Props {
  onClose: () => void;
}

const TAX_TYPE_OPTIONS: WithholdingTaxType[] = ['INCOME_TAX', 'VAT', 'GROSS_INCOME'];
const JURISDICTION_OPTIONS = Object.keys(ARGENTINE_JURISDICTION_LABELS) as ArgentineJurisdiction[];

export default function NewWithholdingRegimeModal({ onClose }: Props) {
  const queryClient = useQueryClient();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [taxType, setTaxType] = useState<WithholdingTaxType>('INCOME_TAX');
  const [jurisdiction, setJurisdiction] = useState<ArgentineJurisdiction | ''>('');
  const [rate, setRate] = useState('');
  const [minTaxableAmount, setMinTaxableAmount] = useState('');
  const [managedByAccountant, setManagedByAccountant] = useState(false);
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      withholdingRegimesApi.create({
        code,
        name,
        taxType,
        jurisdiction: taxType === 'GROSS_INCOME' && jurisdiction ? jurisdiction : undefined,
        rate: Number(rate),
        minTaxableAmount: minTaxableAmount ? Number(minTaxableAmount) : undefined,
        managedByAccountant,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['withholding-regimes'] });
      onClose();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo crear el régimen';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!code.trim() || !name.trim()) {
      setError('Código y nombre son obligatorios');
      return;
    }
    if (!rate.trim()) {
      setError('La tasa es obligatoria');
      return;
    }
    mutation.mutate();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Nuevo régimen de retención</h2>
          <button onClick={onClose} className="text-muted-foreground transition hover:text-foreground">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm text-muted-foreground">Código</label>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="GANANCIAS_RG830" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-muted-foreground">Nombre</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Retención Ganancias RG 830"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-muted-foreground">Impuesto</label>
            <Select
              value={taxType}
              onChange={(value) => setTaxType(value as WithholdingTaxType)}
              options={TAX_TYPE_OPTIONS.map((t) => ({ value: t, label: WITHHOLDING_TAX_TYPE_LABELS[t] }))}
            />
          </div>
          {taxType === 'GROSS_INCOME' && (
            <div className="flex flex-col gap-1">
              <label className="text-sm text-muted-foreground">Jurisdicción</label>
              <Select
                value={jurisdiction}
                onChange={(value) => setJurisdiction(value as ArgentineJurisdiction)}
                placeholder="Elegí una provincia..."
                options={JURISDICTION_OPTIONS.map((j) => ({ value: j, label: ARGENTINE_JURISDICTION_LABELS[j] }))}
              />
            </div>
          )}
          <div className="flex flex-col gap-1">
            <label className="text-sm text-muted-foreground">Tasa (%)</label>
            <Input
              type="number"
              step="0.01"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              placeholder="2"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-muted-foreground">
              Mínimo no imponible (opcional, 0 = siempre retiene)
            </label>
            <Input
              type="number"
              step="0.01"
              value={minTaxableAmount}
              onChange={(e) => setMinTaxableAmount(e.target.value)}
              placeholder="0"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={managedByAccountant}
              onChange={(e) => setManagedByAccountant(e.target.checked)}
              className="h-4 w-4 rounded border-input bg-transparent"
            />
            Delegado al contador (puede revisar la tasa sin ser OWNER/ADMIN)
          </label>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="mt-2 flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Creando...' : 'Crear régimen'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
