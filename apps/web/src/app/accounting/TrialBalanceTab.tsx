'use client';

import { Card, CardContent } from '@/components/ui/card';
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
            className="text-xs font-medium text-primary transition hover:text-primary/80"
          >
            Ver todo el historial
          </button>
        )}
      </div>

      <Card>
        <CardContent>
        {isLoading ? (
          <div className="flex h-32 items-center justify-center text-muted-foreground">Cargando...</div>
        ) : error ? (
          <div className="flex h-32 items-center justify-center text-destructive">
            Error al cargar el balance
          </div>
        ) : rows?.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin movimientos todavía</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
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
                  <tr key={row.accountId} className="border-b border-border/50">
                    <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">{row.code}</td>
                    <td className="py-2 pr-4">{row.name}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{TYPE_LABELS[row.type]}</td>
                    <td className="py-2 pr-4 text-right">
                      ${Number(row.debitTotal).toFixed(2)}
                    </td>
                    <td className="py-2 pr-4 text-right">
                      ${Number(row.creditTotal).toFixed(2)}
                    </td>
                    <td className="py-2 text-right font-semibold">
                      ${Number(row.balance).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t text-sm font-semibold">
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
        </CardContent>
      </Card>
    </div>
  );
}
