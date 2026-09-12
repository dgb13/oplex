'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { receivablesApi } from '@/lib/receivables';
import { useDensity } from '@/providers/DensityProvider';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import StatementModal from './StatementModal';

export default function GestionTab() {
  const queryClient = useQueryClient();
  const { density } = useDensity();
  const cellY = density === 'compact' ? 'py-1' : 'py-2';
  const headY = density === 'compact' ? 'pb-1' : 'pb-2';
  const [statementFor, setStatementFor] = useState<string | null>(null);
  const [refreshMessage, setRefreshMessage] = useState('');

  const balancesQuery = useQuery({
    queryKey: ['receivables-balances'],
    queryFn: receivablesApi.listCustomerBalances,
  });
  const balances = balancesQuery.data ?? [];

  const refreshMutation = useMutation({
    mutationFn: receivablesApi.refreshOverdueStatuses,
    onSuccess: (result) => {
      setRefreshMessage(`${result.updated} factura(s) marcada(s) como vencidas`);
      void queryClient.invalidateQueries({ queryKey: ['receivables-aging'] });
      void queryClient.invalidateQueries({ queryKey: ['receivables-balances'] });
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {balances.length} cliente{balances.length !== 1 ? 's' : ''} con saldo pendiente
        </p>
        <div className="flex items-center gap-3">
          {refreshMessage && <span className="text-xs text-muted-foreground">{refreshMessage}</span>}
          <Button variant="outline" onClick={() => refreshMutation.mutate()} disabled={refreshMutation.isPending}>
            {refreshMutation.isPending ? 'Actualizando...' : 'Actualizar vencidos'}
          </Button>
        </div>
      </div>

      <Card>
        <CardContent>
        <h2 className="mb-4 text-sm font-medium text-muted-foreground">Saldos y límite de crédito</h2>
        {balancesQuery.isLoading ? (
          <div className="flex h-32 items-center justify-center text-muted-foreground">Cargando...</div>
        ) : balances.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin saldos pendientes</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className={`${headY} pr-4`}>Cliente</th>
                  <th className={`${headY} pr-4 text-right`}>Límite de crédito</th>
                  <th className={`${headY} pr-4 text-right`}>Saldo</th>
                  <th className={`${headY} pr-4 text-right`}>Disponible</th>
                </tr>
              </thead>
              <tbody>
                {balances.map((row) => (
                  <tr
                    key={row.customerId}
                    onClick={() => setStatementFor(row.customerId)}
                    className="cursor-pointer border-b border-border/50 hover:bg-muted/40 dark:hover:bg-muted/40"
                  >
                    <td className={`${cellY} pr-4`}>{row.customerName}</td>
                    <td className={`${cellY} pr-4 text-right`}>
                      ${Number(row.creditLimit).toFixed(2)}
                    </td>
                    <td className={`${cellY} pr-4 text-right`}>
                      ${Number(row.outstanding).toFixed(2)}
                    </td>
                    <td
                      className={`${cellY} pr-4 text-right font-semibold ${Number(row.availableCredit) < 0 ? 'text-destructive' : 'text-green-600 dark:text-green-400'}`}
                    >
                      ${Number(row.availableCredit).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        </CardContent>
      </Card>

      {statementFor && (
        <StatementModal customerId={statementFor} onClose={() => setStatementFor(null)} />
      )}
    </div>
  );
}
