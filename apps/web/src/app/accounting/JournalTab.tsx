'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
        <p className="text-xs text-muted-foreground">{entries.length} asiento{entries.length !== 1 ? 's' : ''}</p>
        <Button onClick={() => setNewOpen(true)}>+ Nuevo asiento</Button>
      </div>

      <Card>
        <CardContent>
        {entriesQuery.isLoading ? (
          <div className="flex h-32 items-center justify-center text-muted-foreground">Cargando...</div>
        ) : entriesQuery.error ? (
          <div className="flex h-32 items-center justify-center text-destructive">
            Error al cargar el libro diario
          </div>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin asientos registrados</p>
        ) : (
          <div className="flex flex-col gap-2">
            {entries.map((entry) => {
              const isOpen = expanded === entry.id;
              const total = entry.lines
                .filter((l) => l.direction === 'DEBIT')
                .reduce((s, l) => s + Number(l.amount), 0);
              return (
                <div key={entry.id} className="rounded-lg border">
                  <button
                    onClick={() => setExpanded(isOpen ? null : entry.id)}
                    className={`flex w-full items-center justify-between px-4 ${headerY} text-left text-sm hover:bg-muted/40`}
                  >
                    <div>
                      <p className="">{entry.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {/* timeZone: 'UTC' - entry.date is a business day, not a moment; local
                           display shifted day-only dates (RECPAM, bank lines) back by one day. */}
                        {new Date(entry.date).toLocaleDateString('es-AR', { timeZone: 'UTC' })}
                        {entry.reversalOfId && ' · reversión'}
                      </p>
                    </div>
                    <span className="text-muted-foreground">${total.toFixed(2)}</span>
                  </button>
                  {isOpen && (
                    <table className="w-full border-t text-xs">
                      <thead>
                        <tr className="text-left text-muted-foreground">
                          <th className={`px-4 ${cellY}`}>Cuenta</th>
                          <th className={`px-4 ${cellY}`}>Dirección</th>
                          <th className={`px-4 ${cellY} text-right`}>Importe</th>
                        </tr>
                      </thead>
                      <tbody>
                        {entry.lines.map((line) => (
                          <tr key={line.id} className="border-t border-border/50">
                            <td className={`px-4 ${cellY}`}>
                              {accountsById.get(line.accountId)?.code ?? '—'} —{' '}
                              {accountsById.get(line.accountId)?.name ?? line.accountId}
                            </td>
                            <td className={`px-4 ${cellY} text-muted-foreground`}>
                              {line.direction === 'DEBIT' ? 'Debe' : 'Haber'}
                            </td>
                            <td className={`px-4 ${cellY} text-right`}>
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
        </CardContent>
      </Card>

      {newOpen && <NewJournalEntryModal onClose={() => setNewOpen(false)} />}
    </div>
  );
}
