'use client';

import { accountingApi, type AccountingAccount } from '@/lib/accounting';
import { useDensity } from '@/providers/DensityProvider';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import NewJournalEntryModal from './NewJournalEntryModal';

export default function JournalTab() {
  const [newOpen, setNewOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const { density } = useDensity();
  const headerY = density === 'compact' ? 'py-1.5' : 'py-3';
  const cellY = density === 'compact' ? 'py-1' : 'py-2';

  const entriesQuery = useQuery({
    queryKey: ['accounting-journal-entries'],
    queryFn: accountingApi.listJournalEntries,
  });
  const accountsQuery = useQuery({
    queryKey: ['accounting-accounts'],
    queryFn: accountingApi.listAccounts,
  });

  const entries = entriesQuery.data ?? [];
  const accountsById = new Map((accountsQuery.data ?? []).map((a: AccountingAccount) => [a.id, a]));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">{entries.length} asiento{entries.length !== 1 ? 's' : ''}</p>
        <button
          onClick={() => setNewOpen(true)}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
        >
          + Nuevo asiento
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-4">
        {entriesQuery.isLoading ? (
          <div className="flex h-32 items-center justify-center text-slate-500">Cargando...</div>
        ) : entriesQuery.error ? (
          <div className="flex h-32 items-center justify-center text-red-600 dark:text-red-400">
            Error al cargar el libro diario
          </div>
        ) : entries.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-600">Sin asientos registrados</p>
        ) : (
          <div className="flex flex-col gap-2">
            {entries.map((entry) => {
              const isOpen = expanded === entry.id;
              const total = entry.lines
                .filter((l) => l.direction === 'DEBIT')
                .reduce((s, l) => s + Number(l.amount), 0);
              return (
                <div key={entry.id} className="rounded-lg border border-slate-200 dark:border-slate-800">
                  <button
                    onClick={() => setExpanded(isOpen ? null : entry.id)}
                    className={`flex w-full items-center justify-between px-4 ${headerY} text-left text-sm hover:bg-slate-200/40 dark:hover:bg-slate-800/40`}
                  >
                    <div>
                      <p className="text-slate-800 dark:text-slate-200">{entry.description}</p>
                      <p className="text-xs text-slate-500">
                        {/* timeZone: 'UTC' - entry.date is a business day, not a moment; local
                           display shifted day-only dates (RECPAM, bank lines) back by one day. */}
                        {new Date(entry.date).toLocaleDateString('es-AR', { timeZone: 'UTC' })}
                        {entry.reversalOfId && ' · reversión'}
                      </p>
                    </div>
                    <span className="text-slate-600 dark:text-slate-400">${total.toFixed(2)}</span>
                  </button>
                  {isOpen && (
                    <table className="w-full border-t border-slate-200 dark:border-slate-800 text-xs">
                      <thead>
                        <tr className="text-left text-slate-500">
                          <th className={`px-4 ${cellY}`}>Cuenta</th>
                          <th className={`px-4 ${cellY}`}>Dirección</th>
                          <th className={`px-4 ${cellY} text-right`}>Importe</th>
                        </tr>
                      </thead>
                      <tbody>
                        {entry.lines.map((line) => (
                          <tr key={line.id} className="border-t border-slate-200/50 dark:border-slate-800/50">
                            <td className={`px-4 ${cellY} text-slate-700 dark:text-slate-300`}>
                              {accountsById.get(line.accountId)?.code ?? '—'} —{' '}
                              {accountsById.get(line.accountId)?.name ?? line.accountId}
                            </td>
                            <td className={`px-4 ${cellY} text-slate-600 dark:text-slate-400`}>
                              {line.direction === 'DEBIT' ? 'Debe' : 'Haber'}
                            </td>
                            <td className={`px-4 ${cellY} text-right text-slate-700 dark:text-slate-300`}>
                              ${Number(line.amount).toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {newOpen && <NewJournalEntryModal onClose={() => setNewOpen(false)} />}
    </div>
  );
}
