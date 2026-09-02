'use client';

import { accountingApi, type AccountType } from '@/lib/accounting';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import DateRangeFilter from '../reports/DateRangeFilter';

const TYPE_LABELS: Record<AccountType, string> = {
  ASSET: 'Activo',
  LIABILITY: 'Pasivo',
  EQUITY: 'Patrimonio',
  INCOME: 'Ingreso',
  EXPENSE: 'Gasto',
};

export default function TrialBalanceTab() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const { data: rows, isLoading, error } = useQuery({
    queryKey: ['accounting-trial-balance', from, to],
    queryFn: () => accountingApi.getTrialBalance(from || undefined, to || undefined),
  });

  const totalDebit = (rows ?? []).reduce((s, r) => s + Number(r.debitTotal), 0);
  const totalCredit = (rows ?? []).reduce((s, r) => s + Number(r.creditTotal), 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <DateRangeFilter
          from={from}
          to={to}
          onFromChange={setFrom}
          onToChange={setTo}
          onPreset={(range) => {
            setFrom(range.from);
            setTo(range.to);
          }}
        />
        {(from || to) && (
          <button
            type="button"
            onClick={() => {
              setFrom('');
              setTo('');
            }}
            className="text-xs font-medium text-indigo-600 dark:text-indigo-400 transition hover:text-indigo-700 dark:hover:text-indigo-300"
          >
            Ver todo el historial
          </button>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-4">
        {isLoading ? (
          <div className="flex h-32 items-center justify-center text-slate-500">Cargando...</div>
        ) : error ? (
          <div className="flex h-32 items-center justify-center text-red-600 dark:text-red-400">
            Error al cargar el balance
          </div>
        ) : rows?.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-600">Sin movimientos todavía</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-xs text-slate-500">
                  <th className="pb-2 pr-4">Código</th>
                  <th className="pb-2 pr-4">Cuenta</th>
                  <th className="pb-2 pr-4">Tipo</th>
                  <th className="pb-2 pr-4 text-right">Debe</th>
                  <th className="pb-2 pr-4 text-right">Haber</th>
                  <th className="pb-2 text-right">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {rows?.map((row) => (
                  <tr key={row.accountId} className="border-b border-slate-200/50 dark:border-slate-800/50">
                    <td className="py-2 pr-4 font-mono text-xs text-slate-600 dark:text-slate-400">{row.code}</td>
                    <td className="py-2 pr-4 text-slate-800 dark:text-slate-200">{row.name}</td>
                    <td className="py-2 pr-4 text-slate-600 dark:text-slate-400">{TYPE_LABELS[row.type]}</td>
                    <td className="py-2 pr-4 text-right text-slate-700 dark:text-slate-300">
                      ${Number(row.debitTotal).toFixed(2)}
                    </td>
                    <td className="py-2 pr-4 text-right text-slate-700 dark:text-slate-300">
                      ${Number(row.creditTotal).toFixed(2)}
                    </td>
                    <td className="py-2 text-right font-semibold text-slate-900 dark:text-slate-100">
                      ${Number(row.balance).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-300 dark:border-slate-700 text-sm font-semibold text-slate-800 dark:text-slate-200">
                  <td className="pt-2" colSpan={3}>
                    Totales
                  </td>
                  <td className="pt-2 pr-4 text-right">${totalDebit.toFixed(2)}</td>
                  <td className="pt-2 pr-4 text-right">${totalCredit.toFixed(2)}</td>
                  <td className="pt-2" />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
