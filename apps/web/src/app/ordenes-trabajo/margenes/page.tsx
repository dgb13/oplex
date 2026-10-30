'use client';

import { Input } from '@/components/ui/input';
import { businessProfileApi, isModuleEnabled } from '@/lib/businessModules';
import { profileApi } from '@/lib/profile';
import { formatMoney } from '@/lib/vatCost';
import { formatDate, workOrderCostsApi } from '@/lib/workOrders';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { hasAnyRole } from '@/lib/team';

function firstOfMonth(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toLocaleDateString('en-CA');
}

/** Reporte "Margen por trabajo": cada orden del período con lo cobrado, lo
 * que costó y lo que dejó. */
export default function MarginReportPage() {
  const router = useRouter();
  const { data: profile } = useQuery({ queryKey: ['profile-me'], queryFn: profileApi.getMe });
  const { data: business } = useQuery({ queryKey: ['business-profile'], queryFn: businessProfileApi.get });
  const enabled = Boolean(business) && isModuleEnabled(business, 'costo-trabajo');
  const allowed = hasAnyRole(profile?.roles, ['OWNER', 'ADMIN', 'ACCOUNTANT']);
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(new Date().toLocaleDateString('en-CA'));
  const reportQuery = useQuery({
    queryKey: ['work-order-margins', from, to],
    queryFn: () => workOrderCostsApi.marginReport(from || undefined, to || undefined),
    enabled: enabled && allowed,
  });
  const rows = reportQuery.data ?? [];
  const withIncome = rows.filter((r) => r.income !== null);
  const totalIncome = withIncome.reduce((s, r) => s + (r.income ?? 0), 0);
  const totalCost = withIncome.reduce((s, r) => s + r.totalCost, 0);
  const totalMargin = totalIncome - totalCost;

  if (profile && !allowed) {
    return <p className="text-sm text-muted-foreground">Sólo el dueño, un administrador o el contador ven los márgenes.</p>;
  }
  if (business && !enabled) {
    return (
      <p className="text-sm text-muted-foreground">
        Prendé &quot;Costo por trabajo&quot; en{' '}
        <Link href="/settings/modules" className="underline">
          Rubro y módulos
        </Link>
        .
      </p>
    );
  }

  return (
    <div className="flex max-w-6xl flex-col gap-5">
      <Link href="/ordenes-trabajo" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Órdenes
      </Link>
      <div>
        <h1 className="text-xl font-semibold">Margen por trabajo</h1>
        <p className="text-sm text-muted-foreground">
          Lo cobrado sin IVA menos repuestos, compras para el trabajo y horas. Las órdenes sin facturar usan lo presupuestado.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="m-from" className="text-sm text-muted-foreground">
            Desde
          </label>
          <Input id="m-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="m-to" className="text-sm text-muted-foreground">
            Hasta
          </label>
          <Input id="m-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Ingreso (sin IVA)</p>
          <p className="text-xl font-bold">{formatMoney(totalIncome)}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Costo</p>
          <p className="text-xl font-bold">{formatMoney(totalCost)}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Margen</p>
          <p className={`text-xl font-bold ${totalMargin < 0 ? 'text-destructive' : 'text-green-700 dark:text-green-400'}`}>
            {formatMoney(totalMargin)}
            {totalIncome > 0 ? ` · ${((totalMargin / totalIncome) * 100).toLocaleString('es-AR', { maximumFractionDigits: 1 })}%` : ''}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-xs text-muted-foreground">
              <th className="p-3">Orden</th>
              <th className="p-3">Fecha</th>
              <th className="p-3">Cliente</th>
              <th className="p-3">Estado</th>
              <th className="p-3 text-right">Ingreso</th>
              <th className="p-3 text-right">Costo</th>
              <th className="p-3 text-right">Horas</th>
              <th className="p-3 text-right">Margen</th>
            </tr>
          </thead>
          <tbody>
            {reportQuery.isLoading ? (
              <tr>
                <td colSpan={8} className="p-4 text-muted-foreground">
                  Calculando…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-4 text-muted-foreground">
                  No hay órdenes en ese período.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} onClick={() => router.push(`/ordenes-trabajo/${r.id}`)} className="cursor-pointer border-b last:border-0 hover:bg-muted/40">
                  <td className="p-3 font-mono font-semibold">
                    {r.number}
                    {r.asset ? <span className="ml-2 font-normal text-muted-foreground">{r.asset}</span> : null}
                  </td>
                  <td className="p-3 text-muted-foreground">{formatDate(r.createdAt)}</td>
                  <td className="p-3">{r.customer}</td>
                  <td className="p-3 text-muted-foreground">{r.status}</td>
                  <td className="p-3 text-right">
                    {r.income !== null ? formatMoney(r.income) : '—'}
                    {r.incomeSource === 'quote' ? <span className="ml-1 text-xs text-muted-foreground">(presup.)</span> : null}
                  </td>
                  <td className="p-3 text-right">{formatMoney(r.totalCost)}</td>
                  <td className="p-3 text-right">{r.laborHours.toLocaleString('es-AR')}</td>
                  <td className={`p-3 text-right font-semibold ${r.margin !== null && r.margin < 0 ? 'text-destructive' : ''}`}>
                    {r.margin !== null ? formatMoney(r.margin) : '—'}
                    {r.marginPercent !== null ? <span className="ml-1 text-xs font-normal text-muted-foreground">{r.marginPercent.toLocaleString('es-AR')}%</span> : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
