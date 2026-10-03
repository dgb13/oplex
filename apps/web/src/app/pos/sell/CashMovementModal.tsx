'use client';

import { posApi, type CashMovementInput } from '@/lib/pos';
import type { MoneyConcept } from '@/lib/reports';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';
import PosSelect from '../PosSelect';

interface Props {
  sessionId: string;
  registerId: string;
  type: 'CASH_IN' | 'CASH_OUT';
  onClose: () => void;
  onDone: () => void;
}

type Kind = CashMovementInput['kind'];

// Lo que el cajero elige: qué es el movimiento, sin plan de cuentas (ver
// PosService.recordCashMovement).
const OUT_KINDS: { value: Kind; label: string }[] = [
  { value: 'TRANSFER', label: 'Retiro / depósito (la llevo a otra cuenta)' },
  { value: 'EXPENSE', label: 'Pago de un gasto' },
  { value: 'PARTNER', label: 'Retiro de un socio' },
];
const IN_KINDS: { value: Kind; label: string }[] = [
  { value: 'TRANSFER', label: 'Cambio / fondo traído de otra cuenta' },
  { value: 'PARTNER', label: 'Aporte de un socio' },
  { value: 'INCOME', label: 'Otro ingreso' },
];

const inputClass =
  'rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 pos-dark:border-slate-600 pos-dark:bg-slate-800 pos-dark:text-slate-100 pos-dark:focus:border-indigo-400 pos-contrast:border-slate-600 pos-contrast:bg-slate-900 pos-contrast:text-white pos-contrast:focus:border-amber-400 pos-emerald:border-emerald-200 pos-emerald:bg-emerald-50 pos-emerald:text-slate-900 pos-emerald:focus:border-emerald-500';
const labelClass = 'text-sm text-slate-600 pos-dark:text-slate-300 pos-contrast:text-slate-200 pos-emerald:text-slate-600';

export default function CashMovementModal({ sessionId, registerId, type: initialType, onClose, onDone }: Props) {
  const [type, setType] = useState(initialType);
  const [amount, setAmount] = useState('');
  const [kind, setKind] = useState<Kind>('TRANSFER');
  const [financialAccountId, setFinancialAccountId] = useState('');
  const [concept, setConcept] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const isOut = type === 'CASH_OUT';

  const optionsQuery = useQuery({
    queryKey: ['pos-cash-movement-options', registerId],
    queryFn: () => posApi.getCashMovementOptions(registerId),
  });
  const concepts = (isOut ? optionsQuery.data?.expenseConcepts : optionsQuery.data?.incomeConcepts) ?? [];

  const mutation = useMutation({
    mutationFn: () => {
      const dto: CashMovementInput = {
        amount: Number(amount),
        reason,
        kind,
        financialAccountId: kind === 'TRANSFER' ? financialAccountId : undefined,
        concept: kind === 'EXPENSE' || kind === 'INCOME' ? (concept as MoneyConcept) : undefined,
      };
      return isOut ? posApi.cashOut(sessionId, dto) : posApi.cashIn(sessionId, dto);
    },
    onSuccess: onDone,
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo registrar el movimiento';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  function changeType(next: 'CASH_IN' | 'CASH_OUT') {
    setType(next);
    setKind('TRANSFER');
    setConcept('');
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (Number(amount) <= 0) {
      setError('El monto debe ser mayor a cero');
      return;
    }
    if (kind === 'TRANSFER' && !financialAccountId) {
      setError(isOut ? 'Elegí a dónde llevás la plata' : 'Elegí de qué cuenta viene la plata');
      return;
    }
    if ((kind === 'EXPENSE' || kind === 'INCOME') && !concept) {
      setError('Elegí el concepto');
      return;
    }
    if (!reason.trim()) {
      setError('El motivo es obligatorio');
      return;
    }
    mutation.mutate();
  }

  const segment = (value: 'CASH_IN' | 'CASH_OUT', label: string) => (
    <button
      type="button"
      aria-pressed={type === value}
      onClick={() => changeType(value)}
      className={`rounded-md px-3 py-1.5 text-sm transition ${
        type === value
          ? 'bg-white font-semibold text-slate-900 shadow-sm pos-dark:bg-slate-700 pos-dark:text-slate-100 pos-contrast:bg-slate-800 pos-contrast:text-white pos-emerald:bg-white pos-emerald:text-slate-900'
          : 'text-slate-500 hover:text-slate-800 pos-dark:text-slate-400 pos-dark:hover:text-slate-100 pos-contrast:text-slate-300 pos-contrast:hover:text-white pos-emerald:text-slate-500'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-2xl pos-dark:border-slate-700 pos-dark:bg-slate-900 pos-contrast:border-slate-700 pos-contrast:bg-black pos-emerald:border-emerald-100 pos-emerald:bg-white">
        <h2 className="mb-4 text-lg font-semibold text-slate-900 pos-dark:text-slate-100 pos-contrast:text-white pos-emerald:text-slate-900">
          {isOut ? 'Egreso de efectivo' : 'Ingreso de efectivo'}
        </h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div
            className="grid grid-cols-2 rounded-lg bg-slate-100 p-1 pos-dark:bg-slate-800 pos-contrast:bg-slate-900 pos-emerald:bg-emerald-50"
            role="group"
            aria-label="Tipo"
          >
            {segment('CASH_OUT', 'Egreso')}
            {segment('CASH_IN', 'Ingreso')}
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Monto</label>
            <input type="number" step="any" className={inputClass} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>{isOut ? '¿Para qué sale la plata?' : '¿De dónde viene la plata?'}</label>
            <PosSelect value={kind} onChange={(v) => setKind(v as Kind)} options={isOut ? OUT_KINDS : IN_KINDS} />
          </div>
          {kind === 'TRANSFER' && (
            <div className="flex flex-col gap-1">
              <label className={labelClass}>{isOut ? '¿A dónde la llevás?' : '¿De qué cuenta viene?'}</label>
              <PosSelect
                value={financialAccountId}
                onChange={setFinancialAccountId}
                options={(optionsQuery.data?.accounts ?? []).map((a) => ({ value: a.id, label: a.name }))}
                placeholder="Elegir cuenta..."
              />
            </div>
          )}
          {(kind === 'EXPENSE' || kind === 'INCOME') && (
            <div className="flex flex-col gap-1">
              <label className={labelClass}>Concepto</label>
              <PosSelect
                value={concept}
                onChange={setConcept}
                options={concepts.map((c) => ({ value: c.key, label: c.label }))}
                placeholder="Elegir concepto..."
              />
            </div>
          )}
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Motivo</label>
            <input className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          {error && (
            <p className="text-sm text-red-600 pos-dark:text-red-400 pos-contrast:text-red-400 pos-emerald:text-red-600">
              {error}
            </p>
          )}
          <div className="mt-2 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm text-slate-600 transition hover:text-slate-800 pos-dark:text-slate-300 pos-dark:hover:text-slate-100 pos-contrast:text-slate-200 pos-contrast:hover:text-white pos-emerald:text-slate-600 pos-emerald:hover:text-slate-800"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50 pos-dark:bg-indigo-500 pos-dark:hover:bg-indigo-400 pos-contrast:bg-amber-400 pos-contrast:text-black pos-contrast:hover:bg-amber-300 pos-emerald:bg-emerald-600 pos-emerald:hover:bg-emerald-500"
            >
              {mutation.isPending ? 'Registrando...' : 'Registrar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
