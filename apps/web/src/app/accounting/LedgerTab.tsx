'use client';

import { accountingApi } from '@/lib/accounting';
import { useDensity } from '@/providers/DensityProvider';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

export default function LedgerTab() {
  const [accountId, setAccountId] = useState('');
  const { density } = useDensity();
  const cellY = density === 'compact' ? 'py-1' : 'py-2';
  const headY = density === 'compact' ? 'pb-1' : 'pb-2';
  const bodyText = density === 'compact' ? 'text-xs' : 'text-sm';

  const accountsQuery = useQuery({
    queryKey: ['accounting-accounts'],
    queryFn: accountingApi.listAccounts,
  });
  const accounts = accountsQuery.data ?? [];

  const ledgerQuery = useQuery({
    queryKey: ['accounting-ledger', accountId],
    queryFn: () => accountingApi.getAccountLedger(accountId),
    enabled: Boolean(accountId),
  });

  const ledger = ledgerQuery.data;
  let running = 0;

  return (
    <div className="flex flex-col gap-4">
      <select
        value={accountId}
        onChange={(e) => setAccountId(e.target.value)}
        className="w-full max-w-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500"
      >
        <option value="">Elegí una cuenta...</option>
        {accounts.map((acc) => (
          <option key={acc.id} value={acc.id}>
            {acc.code} — {acc.name}
          </option>
        ))}
      </select>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-4">
        {!accountId ? (
          <div className="flex h-32 items-center justify-center text-slate-400 dark:text-slate-600">
            Elegí una cuenta para ver su mayor
          </div>
        ) : ledgerQuery.isLoading ? (
          <div className="flex h-32 items-center justify-center text-slate-500">Cargando...</div>
        ) : ledger?.lines.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-600">Sin movimientos para esta cuenta</p>
        ) : (
          <table className={`w-full ${bodyText}`}>
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-xs text-slate-500">
                <th className={`${headY} pr-4`}>Fecha</th>
                <th className={`${headY} pr-4`}>Descripción</th>
                <th className={`${headY} pr-4 text-right`}>Debe</th>
                <th className={`${headY} pr-4 text-right`}>Haber</th>
                <th className={`${headY} text-right`}>Saldo</th>
              </tr>
            </thead>
            <tbody>
              {ledger?.lines.map((line) => {
                const amount = Number(line.amount);
                running += line.direction === 'DEBIT' ? amount : -amount;
                return (
                  <tr key={line.id} className="border-b border-slate-200/50 dark:border-slate-800/50">
                    <td className={`${cellY} pr-4 text-slate-600 dark:text-slate-400`}>
                      {/* timeZone: 'UTC' - see JournalTab.tsx, same date-only display fix. */}
                      {new Date(line.journalEntry.date).toLocaleDateString('es-AR', { timeZone: 'UTC' })}
                    </td>
                    <td className={`${cellY} pr-4 text-slate-700 dark:text-slate-300`}>{line.journalEntry.description}</td>
                    <td className={`${cellY} pr-4 text-right text-slate-700 dark:text-slate-300`}>
                      {line.direction === 'DEBIT' ? `$${amount.toFixed(2)}` : ''}
                    </td>
                    <td className={`${cellY} pr-4 text-right text-slate-700 dark:text-slate-300`}>
                      {line.direction === 'CREDIT' ? `$${amount.toFixed(2)}` : ''}
                    </td>
                    <td className={`${cellY} text-right font-medium text-slate-900 dark:text-slate-100`}>
                      ${running.toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
