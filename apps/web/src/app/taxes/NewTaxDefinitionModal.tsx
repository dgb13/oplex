'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { taxesApi, type TaxCalculationType } from '@/lib/taxes';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';

interface Props {
  onClose: () => void;
}

const selectClass =
  'h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

const CALC_TYPE_OPTIONS: { value: TaxCalculationType; label: string }[] = [
  { value: 'PERCENTAGE', label: 'Porcentual' },
  { value: 'FIXED_AMOUNT', label: 'Monto fijo' },
  { value: 'FORMULA', label: 'Fórmula' },
  { value: 'EXENTO', label: 'Exento de IVA' },
  { value: 'NO_GRAVADO', label: 'No gravado' },
];

export default function NewTaxDefinitionModal({ onClose }: Props) {
  const queryClient = useQueryClient();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [calculationType, setCalculationType] = useState<TaxCalculationType>('PERCENTAGE');
  const [rate, setRate] = useState('');
  const [fixedAmount, setFixedAmount] = useState('');
  const [formula, setFormula] = useState('');
  const [managedByAccountant, setManagedByAccountant] = useState(false);
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      taxesApi.createTaxDefinition({
        code,
        name,
        calculationType,
        rate: calculationType === 'PERCENTAGE' && rate ? Number(rate) : undefined,
        fixedAmount: calculationType === 'FIXED_AMOUNT' && fixedAmount ? Number(fixedAmount) : undefined,
        formula: calculationType === 'FORMULA' ? formula : undefined,
        managedByAccountant,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tax-definitions'] });
      onClose();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo crear el impuesto';
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
    mutation.mutate();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Nuevo impuesto</h2>
          <button onClick={onClose} className="text-muted-foreground transition hover:text-foreground">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm text-muted-foreground">Código</label>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="IVA_21" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-muted-foreground">Nombre</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="IVA 21%" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-muted-foreground">Tipo de cálculo</label>
            <select
              className={selectClass}
              value={calculationType}
              onChange={(e) => setCalculationType(e.target.value as TaxCalculationType)}
            >
              {CALC_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          {calculationType === 'PERCENTAGE' && (
            <div className="flex flex-col gap-1">
              <label className="text-sm text-muted-foreground">Tasa (%)</label>
              <Input
                type="number"
                step="0.01"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                placeholder="21"
              />
            </div>
          )}
          {calculationType === 'FIXED_AMOUNT' && (
            <div className="flex flex-col gap-1">
              <label className="text-sm text-muted-foreground">Monto fijo</label>
              <Input
                type="number"
                step="0.01"
                value={fixedAmount}
                onChange={(e) => setFixedAmount(e.target.value)}
                placeholder="1500"
              />
            </div>
          )}
          {calculationType === 'FORMULA' && (
            <div className="flex flex-col gap-1">
              <label className="text-sm text-muted-foreground">Fórmula</label>
              <Input
                value={formula}
                onChange={(e) => setFormula(e.target.value)}
                placeholder="ver documentación de fórmulas"
              />
            </div>
          )}
          {(calculationType === 'EXENTO' || calculationType === 'NO_GRAVADO') && (
            <p className="text-xs text-muted-foreground">
              {calculationType === 'EXENTO'
                ? 'Sin tasa: la venta de un artículo con este impuesto no lleva IVA discriminado, por estar exenta según la norma.'
                : 'Sin tasa: la venta de un artículo con este impuesto queda fuera del objeto del IVA (ni gravada ni exenta).'}
            </p>
          )}
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
              {mutation.isPending ? 'Creando...' : 'Crear impuesto'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
