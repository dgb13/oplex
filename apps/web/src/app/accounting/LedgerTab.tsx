'use client';

import { Card, CardContent } from '@/components/ui/card';
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
        className="h-8 w-full max-w-sm rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <option value="">Elegí una cuenta...</option>
        {accounts.map((acc) => (
          <option key={acc.id} value={acc.id}>
            {acc.code} — {acc.name}
          </option>
        ))}
      </select>

      <Card>
        <CardContent>
        {!accountId ? (
          <div className="flex h-32 items-center justify-center text-muted-foreground">
            Elegí una cuenta para ver su mayor
          </div>
        ) : ledgerQuery.isLoading ? (
          <div className="flex h-32 items-center justify-center text-muted-foreground">Cargando...</div>
        ) : ledger?.lines.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin movimientos para esta cuenta</p>
        ) : (
          <table className={`w-full ${bodyText}`}>
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
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
                  <tr key={line.id} className="border-b border-border/50">
                    <td className={`${cellY} pr-4 text-muted-foreground`}>
                      {/* timeZone: 'UTC' - see JournalTab.tsx, same date-only display fix. */}
                      {new Date(line.journalEntry.date).toLocaleDateString('es-AR', { timeZone: 'UTC' })}
                    </td>
                    <td className={`${cellY} pr-4`}>{line.journalEntry.description}</td>
                    <td className={`${cellY} pr-4 text-right`}>
                      {line.direction === 'DEBIT' ? `$${amount.toFixed(2)}` : ''}
                    </td>
                    <td className={`${cellY} pr-4 text-right`}>
                      {line.direction === 'CREDIT' ? `$${amount.toFixed(2)}` : ''}
                    </td>
                    <td className={`${cellY} text-right font-medium`}>
                      ${running.toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        </CardContent>
      </Card>
    </div>
  );
}
