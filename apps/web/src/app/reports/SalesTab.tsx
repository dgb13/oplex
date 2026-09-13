'use client';

import { Card, CardContent } from '@/components/ui/card';
import { reportsApi } from '@/lib/reports';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import DateRangeFilter from './DateRangeFilter';
import { currentMonthRange } from './dateRange';

export default function SalesTab() {
  const [{ from, to }, setRange] = useState(currentMonthRange());

  const byCustomerQuery = useQuery({
    queryKey: ['reports-sales-by-customer', from, to],
    queryFn: () => reportsApi.getSalesByCustomer({ from, to }),
  });
  const byProductQuery = useQuery({
    queryKey: ['reports-sales-by-product', from, to],
    queryFn: () => reportsApi.getSalesByProduct({ from, to }),
  });

  const byCustomer = byCustomerQuery.data ?? [];
  const byProduct = byProductQuery.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <DateRangeFilter
        from={from}
        to={to}
        onFromChange={(value) => setRange((r) => ({ ...r, from: value }))}
        onToChange={(value) => setRange((r) => ({ ...r, to: value }))}
        onPreset={setRange}
      />

      <Card>
        <CardContent>
          <h2 className="mb-3 text-sm font-semibold">Ventas por cliente</h2>
          {byCustomerQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Cargando...</p>
          ) : byCustomer.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin ventas en el período</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left text-muted-foreground">
                    <th className="p-3">Cliente</th>
                    <th className="p-3 text-right">Facturas</th>
                    <th className="p-3 text-right">Total vendido</th>
                  </tr>
                </thead>
                <tbody>
                  {byCustomer.map((row) => (
                    <tr key={row.customerId} className="border-b border-border/50">
                      <td className="p-3">{row.customerName}</td>
                      <td className="p-3 text-right text-muted-foreground">{row.invoiceCount}</td>
                      <td className="p-3 text-right font-medium">${Number(row.totalSales).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <h2 className="mb-3 text-sm font-semibold">Ventas por producto</h2>
          {byProductQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Cargando...</p>
          ) : byProduct.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin ventas en el período</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left text-muted-foreground">
                    <th className="p-3">SKU</th>
                    <th className="p-3">Artículo</th>
                    <th className="p-3 text-right">Cantidad</th>
                    <th className="p-3 text-right">Ingresos</th>
                  </tr>
                </thead>
                <tbody>
                  {byProduct.map((row) => (
                    <tr key={row.articleVariantId} className="border-b border-border/50">
                      <td className="p-3 font-mono text-xs">{row.sku}</td>
                      <td className="p-3">{row.articleName}</td>
                      <td className="p-3 text-right text-muted-foreground">{row.quantitySold}</td>
                      <td className="p-3 text-right font-medium">${Number(row.revenue).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
