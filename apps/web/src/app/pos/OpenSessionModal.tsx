'use client';

import { posApi } from '@/lib/pos';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useMemo, useState } from 'react';
import DenominationBreakdownEditor, { breakdownTotal, buildDenominationBreakdown } from './DenominationBreakdownEditor';
import NumericKeypad from './NumericKeypad';

interface Props {
  registerId: string;
  onClose: () => void;
  onOpened: () => void;
}

type Mode = 'simple' | 'breakdown';

const DENOMINATION_LABEL: Record<'BILL' | 'COIN', string> = { BILL: 'Billete', COIN: 'Moneda' };

export default function OpenSessionModal({ registerId, onClose, onOpened }: Props) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode>('simple');
  const [amount, setAmount] = useState('');
  const [counts, setCounts] = useState<Record<number, string>>({});
  const [error, setError] = useState('');

  const lastClosedQuery = useQuery({
    queryKey: ['pos-last-closed-session', registerId],
    queryFn: () => posApi.getLastClosedSession(registerId),
  });
  const previousSession = lastClosedQuery.data ?? null;
  const previousCountedAmount = previousSession ? Number(previousSession.countedAmount ?? 0) : null;

  const breakdownAmount = useMemo(() => breakdownTotal(counts), [counts]);
  const openingAmount = mode === 'simple' ? Number(amount.replace(',', '.')) || 0 : breakdownAmount;
  const difference = previousCountedAmount != null ? openingAmount - previousCountedAmount : null;

  const mutation = useMutation({
    mutationFn: () => {
      const denominationBreakdown = mode === 'breakdown' ? buildDenominationBreakdown(counts) : undefined;
      return posApi.openSession({ registerId, openingAmount, denominationBreakdown });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['pos-open-sessions'] });
      onOpened();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo abrir el turno';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  const diffColor =
    difference === null || difference === 0
      ? 'text-slate-500 pos-dark:text-slate-400 pos-contrast:text-slate-300 pos-emerald:text-slate-500'
      : difference > 0
        ? 'text-blue-600 pos-dark:text-blue-400 pos-contrast:text-blue-400 pos-emerald:text-blue-600'
        : 'text-red-600 pos-dark:text-red-400 pos-contrast:text-red-400 pos-emerald:text-red-600';
  const diffLabel =
    difference === null
      ? ''
      : difference === 0
        ? 'Coincide con el cierre anterior'
        : difference > 0
          ? `+$${difference.toFixed(2)} respecto al cierre anterior`
          : `-$${Math.abs(difference).toFixed(2)} respecto al cierre anterior`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-xs rounded-xl border border-slate-200 bg-white p-6 shadow-2xl pos-dark:border-slate-700 pos-dark:bg-slate-900 pos-contrast:border-slate-700 pos-contrast:bg-black pos-emerald:border-emerald-100 pos-emerald:bg-white">
        <h2 className="mb-1 text-lg font-semibold text-slate-900 pos-dark:text-slate-100 pos-contrast:text-white pos-emerald:text-slate-900">
          Abrir turno
        </h2>
        <p className="mb-4 text-xs text-slate-500 pos-dark:text-slate-400 pos-contrast:text-slate-300 pos-emerald:text-slate-500">
          Declará el efectivo inicial en el cajón
        </p>

        {previousSession && (
          <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 pos-dark:border-slate-700 pos-dark:bg-slate-800/60 pos-dark:text-slate-300 pos-contrast:border-slate-700 pos-contrast:bg-slate-900 pos-contrast:text-slate-200 pos-emerald:border-emerald-100 pos-emerald:bg-emerald-50 pos-emerald:text-slate-600">
            <p>
              Turno anterior cerró con{' '}
              <span className="font-semibold text-slate-800 pos-dark:text-slate-100 pos-contrast:text-white pos-emerald:text-slate-800">
                ${Number(previousSession.countedAmount ?? 0).toFixed(2)}
              </span>{' '}
              el {previousSession.closedAt ? new Date(previousSession.closedAt).toLocaleString('es-AR') : '-'}
              {previousSession.closedBy && (
                <> (cerró: {previousSession.closedBy.name ?? previousSession.closedBy.email})</>
              )}
              .
            </p>
            {previousSession.denominationBreakdown && previousSession.denominationBreakdown.length > 0 && (
              <details className="mt-1.5">
                <summary className="cursor-pointer text-slate-500 pos-dark:text-slate-400 pos-contrast:text-slate-300 pos-emerald:text-slate-500">
                  Ver desglose del cierre anterior
                </summary>
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                  {previousSession.denominationBreakdown.map((item, i) => (
                    <span key={i} className="text-slate-600 pos-dark:text-slate-300 pos-contrast:text-slate-200 pos-emerald:text-slate-600">
                      {DENOMINATION_LABEL[item.kind]} ${item.denomination} × {item.count}
                    </span>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}

        <div className="mb-4 flex rounded-lg bg-slate-100 p-1 text-xs font-medium pos-dark:bg-slate-800 pos-contrast:bg-slate-900 pos-emerald:bg-emerald-50">
          <button
            type="button"
            onClick={() => setMode('simple')}
            className={`flex-1 rounded-md py-1.5 transition ${
              mode === 'simple'
                ? 'bg-white text-slate-900 shadow-sm pos-dark:bg-slate-700 pos-dark:text-slate-100 pos-contrast:bg-black pos-contrast:text-white pos-emerald:bg-white pos-emerald:text-slate-900'
                : 'text-slate-500 pos-dark:text-slate-400 pos-contrast:text-slate-300 pos-emerald:text-slate-500'
            }`}
          >
            Monto simple
          </button>
          <button
            type="button"
            onClick={() => setMode('breakdown')}
            className={`flex-1 rounded-md py-1.5 transition ${
              mode === 'breakdown'
                ? 'bg-white text-slate-900 shadow-sm pos-dark:bg-slate-700 pos-dark:text-slate-100 pos-contrast:bg-black pos-contrast:text-white pos-emerald:bg-white pos-emerald:text-slate-900'
                : 'text-slate-500 pos-dark:text-slate-400 pos-contrast:text-slate-300 pos-emerald:text-slate-500'
            }`}
          >
            Desglose
          </button>
        </div>

        <div className="mb-2 rounded-lg bg-slate-100 px-4 py-3 text-right text-2xl font-semibold text-slate-900 pos-dark:bg-slate-800 pos-dark:text-slate-100 pos-contrast:bg-slate-900 pos-contrast:text-white pos-emerald:bg-emerald-50 pos-emerald:text-slate-900">
          ${mode === 'simple' ? amount || '0' : openingAmount.toFixed(2)}
        </div>
        {difference !== null && (
          <p className={`mb-3 text-right text-sm font-medium ${diffColor}`}>{diffLabel}</p>
        )}

        {mode === 'simple' ? (
          <NumericKeypad value={amount} onChange={setAmount} />
        ) : (
          <DenominationBreakdownEditor
            counts={counts}
            onChange={(i, value) => setCounts((prev) => ({ ...prev, [i]: value }))}
          />
        )}

        {error && (
          <p className="mt-3 text-sm text-red-600 pos-dark:text-red-400 pos-contrast:text-red-400 pos-emerald:text-red-600">
            {error}
          </p>
        )}

        <div className="mt-4 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-slate-600 transition hover:text-slate-800 pos-dark:text-slate-300 pos-dark:hover:text-slate-100 pos-contrast:text-slate-200 pos-contrast:hover:text-white pos-emerald:text-slate-600 pos-emerald:hover:text-slate-800"
          >
            Cancelar
          </button>
          <button
            onClick={() => {
              setError('');
              mutation.mutate();
            }}
            disabled={mutation.isPending}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50 pos-dark:bg-indigo-500 pos-dark:hover:bg-indigo-400 pos-contrast:bg-amber-400 pos-contrast:text-black pos-contrast:hover:bg-amber-300 pos-emerald:bg-emerald-600 pos-emerald:hover:bg-emerald-500"
          >
            {mutation.isPending ? 'Abriendo...' : 'Abrir turno'}
          </button>
        </div>
      </div>
    </div>
  );
}
