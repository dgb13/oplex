'use client';

import { Card, CardContent } from '@/components/ui/card';
import { payablesApi } from '@/lib/payables';
import { useDensity } from '@/providers/DensityProvider';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import SupplierStatementModal from './SupplierStatementModal';

export default function GestionTab() {
  const { density } = useDensity();
  const cellY = density === 'compact' ? 'py-1' : 'py-2';
  const headY = density === 'compact' ? 'pb-1' : 'pb-2';
  const [statementFor, setStatementFor] = useState<string | null>(null);

  const balancesQuery = useQuery({
    queryKey: ['payables-balances'],
    queryFn: payablesApi.listSupplierBalances,
  });
  const balances = balancesQuery.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <p className="text-xs text-muted-foreground">
        {balances.length} proveedor{balances.length !== 1 ? 'es' : ''} con saldo pendiente
      </p>

      <Card>
        <CardContent>
        <h2 className="mb-4 text-sm font-medium text-muted-foreground">Saldos por proveedor</h2>
        {balancesQuery.isLoading ? (
          <div className="flex h-32 items-center justify-center text-muted-foreground">Cargando...</div>
        ) : balances.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin saldos pendientes</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className={`${headY} pr-4`}>Proveedor</th>
                  <th className={`${headY} pr-4 text-right`}>Saldo</th>
                </tr>
              </thead>
              <tbody>
                {balances.map((row) => (
                  <tr
                    key={row.supplierId}
                    onClick={() => setStatementFor(row.supplierId)}
                    className="cursor-pointer border-b border-border/50 hover:bg-muted/40 dark:hover:bg-muted/40"
                  >
                    <td className={`${cellY} pr-4`}>{row.supplierName}</td>
                    <td className={`${cellY} pr-4 text-right font-semibold`}>
                      ${Number(row.outstanding).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        </CardContent>
      </Card>

      {statementFor && <SupplierStatementModal supplierId={statementFor} onClose={() => setStatementFor(null)} />}
    </div>
  );
}
