'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { mercadoPagoApi, type MovementsSummary } from '@/lib/mercadopago';
import { formatMoney } from '@/lib/vatCost';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { PeriodSelect, periodRange, PERIODS, type Period } from './periods';

const ORIGIN_LABEL: Record<MovementsSummary['byOrigin'][number]['kind'], string> = {
  CAJA: 'Caja (QR)',
  DOCS: 'Facturas y cotizaciones (links)',
  FUERA: 'Fuera de Oplex',
};

function releaseDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const day = new Date(y, m - 1, d);
  const today = new Date();
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  const label = day.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
  return day.getTime() === tomorrow.getTime() ? `Mañana, ${label}` : label;
}

/**
 * Resumen (etapa 3 de plan-seccion-mercadopago.md): cobrado, comisiones,
 * neto y lo que falta liberar, sobre la copia local de los pagos (la misma
 * que Movimientos). onShowUnassigned lleva a Movimientos filtrado.
 */
export default function SummaryTab({ onShowUnassigned }: { onShowUnassigned: () => void }) {
  const [period, setPeriod] = useState<Period>('month');
  const range = periodRange(period);
  const { data, isLoading } = useQuery({
    queryKey: ['mercadopago-summary', range],
    queryFn: () => mercadoPagoApi.getSummary(range),
    placeholderData: keepPreviousData,
  });
  const periodLabel = PERIODS.find((p) => p.value === period)?.label.toLowerCase() ?? '';

  if (isLoading || !data) {
    return <p className="text-sm text-muted-foreground">Cargando...</p>;
  }

  const maxOrigin = Math.max(...data.byOrigin.map((o) => Number(o.gross)), 0);

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {data.lastSyncAt
            ? `Con los movimientos traídos el ${new Date(data.lastSyncAt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}.`
            : 'Todavía no se trajeron movimientos: abrí Movimientos para traerlos.'}
        </p>
        <PeriodSelect value={period} onChange={setPeriod} />
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-4">
        <Kpi label={`Cobrado (${periodLabel})`} value={formatMoney(Number(data.gross))} sub={`${data.count} cobros`} />
        <Kpi
          label="Comisiones e impuestos de MP"
          value={Number(data.fee) > 0 ? `− ${formatMoney(Number(data.fee))}` : formatMoney(0)}
          sub={data.feePercent != null ? `${data.feePercent.toLocaleString('es-AR')} % de lo cobrado` : '—'}
          valueClass="text-red-700 dark:text-red-400"
        />
        <Kpi
          label="Neto que te queda"
          value={formatMoney(Number(data.net))}
          sub="cobrado − comisiones"
          valueClass="text-green-700 dark:text-green-400"
        />
        <Kpi
          label="Por liberarse"
          value={formatMoney(Number(data.pendingRelease))}
          sub="cobrado que Mercado Pago todavía no liberó"
          valueClass="text-primary"
        />
      </div>

      {data.unassignedCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
          <span className="text-sm">
            <b>
              {data.unassignedCount === 1
                ? '1 cobro con QR sin asignar a una venta.'
                : `${data.unassignedCount} cobros con QR sin asignar a una venta.`}
            </b>{' '}
            Entraron en Mercado Pago pero en Oplex no están en ninguna venta.
          </span>
          <Button type="button" variant="outline" onClick={onShowUnassigned}>
            Ver y asignar
          </Button>
        </div>
      )}

      {data.otherCurrencies.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Además hubo cobros en otra moneda, que no entran en estos totales:{' '}
          {data.otherCurrencies.map((c) => `${c.currency} ${Number(c.gross).toLocaleString('es-AR')} (${c.count})`).join(', ')}.
        </p>
      )}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-4">
        <Card>
          <CardContent className="flex flex-col gap-3.5">
            <h2 className="text-base font-semibold">De dónde vinieron los cobros</h2>
            {data.byOrigin.map((o) => (
              <div key={o.kind} className="flex flex-col gap-1.5">
                <div className="flex justify-between text-sm">
                  <span>{ORIGIN_LABEL[o.kind]}</span>
                  <b>{formatMoney(Number(o.gross))}</b>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-primary/10">
                  <div
                    className="h-2.5 rounded-full bg-primary"
                    style={{ width: maxOrigin > 0 ? `${(Number(o.gross) / Number(data.gross || 1)) * 100}%` : '0%' }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-2">
            <h2 className="text-base font-semibold">Próximas liberaciones</h2>
            <p className="text-sm text-muted-foreground">Plata cobrada que Mercado Pago todavía no liberó a tu cuenta.</p>
            {data.upcomingReleases.length === 0 ? (
              <p className="border-t border-border/70 pt-2 text-sm text-muted-foreground">No hay nada pendiente de liberar.</p>
            ) : (
              data.upcomingReleases.map((r) => (
                <div key={r.date} className="flex justify-between border-t border-border/70 py-2 text-sm">
                  <span>{releaseDay(r.date)}</span>
                  <b>{formatMoney(Number(r.amount))}</b>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function Kpi({ label, value, sub, valueClass = '' }: { label: string; value: string; sub: string; valueClass?: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1.5">
        <span className="text-sm text-muted-foreground">{label}</span>
        <b className={`text-2xl ${valueClass}`}>{value}</b>
        <span className="text-sm text-muted-foreground">{sub}</span>
      </CardContent>
    </Card>
  );
}
