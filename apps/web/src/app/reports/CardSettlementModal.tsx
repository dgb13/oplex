'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Select from '@/components/ui/Select';
import { reportsApi, type CardSettlementDiscountType, type FinancialAccount } from '@/lib/reports';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';

interface Props {
  accounts: FinancialAccount[];
  onClose: () => void;
}

const DISCOUNT_LABELS: Record<CardSettlementDiscountType, string> = {
  FEE: 'Arancel / comisión',
  FEE_VAT: 'IVA sobre el arancel',
  FINANCIAL_COST: 'Costo financiero (cuotas)',
  WITHHOLDING_IIBB: 'Retención IIBB',
  WITHHOLDING_VAT: 'Retención IVA',
  WITHHOLDING_INCOME_TAX: 'Retención Ganancias',
  OTHER: 'Otro gasto',
};
const DISCOUNT_OPTIONS = (Object.keys(DISCOUNT_LABELS) as CardSettlementDiscountType[]).map((value) => ({
  value,
  label: DISCOUNT_LABELS[value],
}));

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const money = (n: number) => `$ ${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Liquidación de la procesadora de tarjetas: sale el total de "Cobranzas a
 * depositar", entra el neto al banco y cada descuento se asienta donde va
 * (ver TreasuryService.recordCardSettlement). */
export default function CardSettlementModal({ accounts, onClose }: Props) {
  const queryClient = useQueryClient();
  // Las liquidaciones de tarjeta son en pesos.
  const pesoAccounts = accounts.filter((a) => !a.currencyId);
  const accountOptions = pesoAccounts.map((a) => ({ value: a.id, label: a.name }));
  const [fromId, setFromId] = useState(
    pesoAccounts.find((a) => a.provider === 'PENDING_DEPOSIT')?.id ?? pesoAccounts[0]?.id ?? '',
  );
  const [toId, setToId] = useState(pesoAccounts.find((a) => a.provider === 'BANK')?.id ?? '');
  const [occurredAt, setOccurredAt] = useState(today);
  const [reference, setReference] = useState('');
  const [gross, setGross] = useState('');
  const [discounts, setDiscounts] = useState<{ type: CardSettlementDiscountType; amount: string }[]>([
    { type: 'FEE', amount: '' },
    { type: 'FEE_VAT', amount: '' },
    { type: 'WITHHOLDING_IIBB', amount: '' },
    { type: 'FINANCIAL_COST', amount: '' },
  ]);
  const [error, setError] = useState('');

  const totalDiscounts = discounts.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
  const net = (Number(gross) || 0) - totalDiscounts;

  const mutation = useMutation({
    mutationFn: () =>
      reportsApi.recordCardSettlement({
        fromFinancialAccountId: fromId,
        toFinancialAccountId: toId,
        grossAmount: Number(gross),
        discounts: discounts
          .filter((d) => Number(d.amount) > 0)
          .map((d) => ({ type: d.type, amount: Number(d.amount) })),
        // Hoy = ahora; otro día = mediodía de ese día en la hora local.
        occurredAt: occurredAt && occurredAt !== today() ? new Date(`${occurredAt}T12:00:00`).toISOString() : undefined,
        reference: reference || undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['financial-accounts'] });
      void queryClient.invalidateQueries({ queryKey: ['financial-unreconciled'] });
      void queryClient.invalidateQueries({ queryKey: ['financial-reconciliation'] });
      onClose();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo registrar la liquidación';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  function updateDiscount(index: number, patch: Partial<{ type: CardSettlementDiscountType; amount: string }>) {
    setDiscounts((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!fromId || !toId) {
      setError('Elegí de qué cuenta sale y en cuál se acredita');
      return;
    }
    if (fromId === toId) {
      setError('La cuenta de origen y la de acreditación no pueden ser la misma');
      return;
    }
    if (!(Number(gross) > 0)) {
      setError('El total de ventas liquidadas tiene que ser mayor a cero');
      return;
    }
    if (discounts.some((d) => Number(d.amount) < 0)) {
      setError('Los descuentos no pueden ser negativos');
      return;
    }
    if (net <= 0) {
      setError('Los descuentos no pueden ser iguales o mayores al total liquidado');
      return;
    }
    mutation.mutate();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-full w-full max-w-md overflow-y-auto rounded-xl border bg-card p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Liquidación de tarjeta</h2>
          <button onClick={onClose} className="text-muted-foreground transition hover:text-foreground">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <label className="text-sm text-muted-foreground">Sale de</label>
              <Select value={fromId} onChange={setFromId} options={accountOptions} />
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <label className="text-sm text-muted-foreground">Se acredita en</label>
              <Select value={toId} onChange={setToId} options={accountOptions} placeholder="Elegir cuenta..." />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <label className="text-sm text-muted-foreground">Fecha de acreditación</label>
              <Input type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <label className="text-sm text-muted-foreground">N° de liquidación (opcional)</label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-muted-foreground">Total de ventas liquidadas</label>
            <Input
              type="number"
              min={0}
              step="0.01"
              className="text-right"
              value={gross}
              onChange={(e) => setGross(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Descuentos de la liquidación</p>
            {discounts.map((discount, i) => (
              <div key={i} className="grid grid-cols-[1fr_120px_28px] items-center gap-2">
                <Select
                  value={discount.type}
                  onChange={(v) => updateDiscount(i, { type: v as CardSettlementDiscountType })}
                  options={DISCOUNT_OPTIONS}
                />
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  className="text-right"
                  aria-label="Importe"
                  value={discount.amount}
                  onChange={(e) => updateDiscount(i, { amount: e.target.value })}
                />
                <button
                  type="button"
                  aria-label="Quitar"
                  onClick={() => setDiscounts((rows) => rows.filter((_, j) => j !== i))}
                  className="text-muted-foreground transition hover:text-foreground"
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setDiscounts((rows) => [...rows, { type: 'OTHER', amount: '' }])}
              className="self-start rounded-lg border border-dashed px-3 py-1.5 text-sm text-primary transition hover:bg-muted"
            >
              + Agregar descuento
            </button>
          </div>

          <div className="flex items-baseline justify-between border-t pt-3">
            <span className="text-sm">Neto que entra al banco</span>
            <span className="font-mono text-xl font-semibold tabular-nums">{money(net)}</span>
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">Tiene que coincidir con lo que ves acreditado en el banco.</p>

          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="mt-2 flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Guardando...' : 'Registrar liquidación'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
