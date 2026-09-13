'use client';

import { Card, CardContent } from '@/components/ui/card';
import { reportsApi, type AccountType } from '@/lib/reports';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import DateRangeFilter from './DateRangeFilter';
import { currentMonthRange } from './dateRange';

const TYPE_LABELS: Record<AccountType, string> = {
  ASSET: 'Activo',
  LIABILITY: 'Pasivo',
  EQUITY: 'Patrimonio',
  INCOME: 'Ingreso',
  EXPENSE: 'Gasto',
};

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-lg font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}

export default function ResultsTab() {
  const [{ from, to }, setRange] = useState(currentMonthRange());

  const revenueQuery = useQuery({
    queryKey: ['reports-revenue-summary', from, to],
    queryFn: () => reportsApi.getRevenueSummary({ from, to }),
  });
  const incomeStatementQuery = useQuery({
    queryKey: ['reports-income-statement', from, to],
    queryFn: () => reportsApi.getIncomeStatement({ from, to }),
  });

  const summary = revenueQuery.data;
  const statement = incomeStatementQuery.data;

  return (
    <div className="flex flex-col gap-6">
      <DateRangeFilter
        from={from}
        to={to}
        onFromChange={(value) => setRange((r) => ({ ...r, from: value }))}
        onToChange={(value) => setRange((r) => ({ ...r, to: value }))}
        onPreset={setRange}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <KpiCard label="Facturas emitidas" value={summary?.invoiceCount != null ? String(summary.invoiceCount) : '—'} />
        <KpiCard label="Subtotal" value={summary ? `$${Number(summary.subtotal).toFixed(2)}` : '—'} />
        <KpiCard label="IVA" value={summary ? `$${Number(summary.taxTotal).toFixed(2)}` : '—'} />
        <KpiCard label="Total facturado" value={summary ? `$${Number(summary.total).toFixed(2)}` : '—'} />
      </div>

      <Card>
        <CardContent>
          <h2 className="mb-3 text-sm font-semibold">Estado de resultados (libro mayor)</h2>
          {incomeStatementQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Cargando...</p>
          ) : incomeStatementQuery.error ? (
            <p className="text-sm text-destructive">Error al cargar el estado de resultados</p>
          ) : statement?.lines.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Sin asientos de ingresos/gastos en el período — este informe se llena a medida que se
              postean asientos contables (automático al facturar).
            </p>
          ) : (
            <>
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-left text-muted-foreground">
                      <th className="p-3">Código</th>
                      <th className="p-3">Cuenta</th>
                      <th className="p-3">Tipo</th>
                      <th className="p-3 text-right">Importe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statement?.lines.map((line) => (
                      <tr key={line.accountId} className="border-b border-border/50">
                        <td className="p-3 font-mono text-xs">{line.code}</td>
                        <td className="p-3">{line.name}</td>
                        <td className="p-3 text-muted-foreground">{TYPE_LABELS[line.type]}</td>
                        <td className="p-3 text-right">${Number(line.amount).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex flex-col gap-1 border-t pt-3 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Ingresos totales</span>
                  <span>${statement ? Number(statement.totalRevenue).toFixed(2) : '0.00'}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Gastos totales</span>
                  <span>${statement ? Number(statement.totalExpenses).toFixed(2) : '0.00'}</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span>Resultado neto</span>
                  <span>${statement ? Number(statement.netIncome).toFixed(2) : '0.00'}</span>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
