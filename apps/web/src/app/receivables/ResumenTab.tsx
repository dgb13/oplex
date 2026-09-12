'use client';

import { Card, CardContent } from '@/components/ui/card';
import { receivablesApi } from '@/lib/receivables';
import { useDensity } from '@/providers/DensityProvider';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import StatementModal from './StatementModal';

export default function ResumenTab() {
  const { density } = useDensity();
  const cellY = density === 'compact' ? 'py-1' : 'py-2';
  const headY = density === 'compact' ? 'pb-1' : 'pb-2';
  const [statementFor, setStatementFor] = useState<string | null>(null);

  const agingQuery = useQuery({
    queryKey: ['receivables-aging'],
    queryFn: receivablesApi.getAgingReport,
  });
  const aging = agingQuery.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent>
        <h2 className="mb-4 text-sm font-medium text-muted-foreground">Antigüedad de saldos</h2>
        {agingQuery.isLoading ? (
          <div className="flex h-32 items-center justify-center text-muted-foreground">Cargando...</div>
        ) : aging.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin saldos pendientes</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className={`${headY} pr-4`}>Cliente</th>
                  <th className={`${headY} pr-4 text-right`}>Al día</th>
                  <th className={`${headY} pr-4 text-right`}>1-30</th>
                  <th className={`${headY} pr-4 text-right`}>31-60</th>
                  <th className={`${headY} pr-4 text-right`}>61-90</th>
                  <th className={`${headY} pr-4 text-right`}>90+</th>
                  <th className={`${headY} pr-4 text-right`}>Total</th>
                </tr>
              </thead>
              <tbody>
                {aging.map((row) => (
                  <tr
                    key={row.customerId}
                    onClick={() => setStatementFor(row.customerId)}
                    className="cursor-pointer border-b border-border/50 hover:bg-muted/40 dark:hover:bg-muted/40"
                  >
                    <td className={`${cellY} pr-4`}>{row.customerName}</td>
                    <td className={`${cellY} pr-4 text-right`}>${Number(row.current).toFixed(2)}</td>
                    <td className={`${cellY} pr-4 text-right`}>${Number(row.days1to30).toFixed(2)}</td>
                    <td className={`${cellY} pr-4 text-right text-amber-600 dark:text-amber-400`}>
                      ${Number(row.days31to60).toFixed(2)}
                    </td>
                    <td className={`${cellY} pr-4 text-right text-orange-400`}>
                      ${Number(row.days61to90).toFixed(2)}
                    </td>
                    <td className={`${cellY} pr-4 text-right text-destructive`}>
                      ${Number(row.days90Plus).toFixed(2)}
                    </td>
                    <td className={`${cellY} pr-4 text-right font-semibold`}>
                      ${Number(row.totalOutstanding).toFixed(2)}
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
