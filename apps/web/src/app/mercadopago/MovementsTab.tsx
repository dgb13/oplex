'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  mercadoPagoApi,
  type MovementOriginFilter,
  type MovementRow,
  type MovementsQuery,
  type OplexState,
} from '@/lib/mercadopago';
import { formatMoney } from '@/lib/vatCost';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import Link from 'next/link';
import { Fragment, useEffect, useRef, useState } from 'react';
import { PeriodSelect, periodRange, type Period } from './periods';

const STATE_PILL: Record<OplexState, string> = {
  ASSIGNED: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  QUOTE_PAID: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300',
  UNASSIGNED: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  PENDING: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  REFUNDED: 'bg-muted text-muted-foreground',
  OUTSIDE: 'bg-muted text-muted-foreground',
};

function errorMessage(err: AxiosError<{ message?: string | string[] }>, fallback: string): string {
  const message = err.response?.data?.message ?? fallback;
  return Array.isArray(message) ? message.join(', ') : message;
}

function dateTime(iso: string): string {
  return new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function releaseText(row: MovementRow): string {
  if (!row.releaseDate) return '—';
  return row.released ? 'Disponible' : new Date(row.releaseDate).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
}

/**
 * Movimientos (etapa 2 de plan-seccion-mercadopago.md): los pagos de la
 * cuenta de Mercado Pago con comisión, neto y fecha de liberación, cruzados
 * con nuestros cobros. canAssign: Dueño/Admin pueden ir a asignar un cobro
 * con QR a una venta (el Contador sólo mira).
 */
export default function MovementsTab({
  canAssign,
  connected,
  initialOrigin = 'all',
}: {
  canAssign: boolean;
  connected: boolean;
  initialOrigin?: MovementOriginFilter;
}) {
  const queryClient = useQueryClient();
  const [origin, setOrigin] = useState<MovementOriginFilter>(initialOrigin);
  const [period, setPeriod] = useState<Period>('month');
  const [page, setPage] = useState(1);
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; isError: boolean } | null>(null);

  const query: MovementsQuery = { ...periodRange(period), origin, page };
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['mercadopago-movements', query],
    queryFn: () => mercadoPagoApi.listMovements(query),
    placeholderData: keepPreviousData,
  });

  const syncMutation = useMutation({
    mutationFn: mercadoPagoApi.syncMovements,
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['mercadopago-movements'] });
      setNotice({
        text: result.partial
          ? `Se trajeron ${result.synced} movimientos. Hay más: tocá "Actualizar movimientos" otra vez para seguir.`
          : `Movimientos al día (${result.synced} revisados).`,
        isError: false,
      });
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) =>
      setNotice({ text: errorMessage(err, 'No se pudieron traer los movimientos de Mercado Pago'), isError: true }),
  });

  // Primera vez: todavía no se trajo nada de Mercado Pago, se trae solo.
  const autoSynced = useRef(false);
  useEffect(() => {
    if (connected && data && data.lastSyncAt === null && !autoSynced.current) {
      autoSynced.current = true;
      syncMutation.mutate();
    }
  }, [connected, data, syncMutation]);

  const exportMutation = useMutation({
    mutationFn: () => mercadoPagoApi.exportMovements(query),
    onError: () => setNotice({ text: 'No se pudo generar el Excel', isError: true }),
  });

  const filters: { value: MovementOriginFilter; label: string }[] = [
    { value: 'all', label: 'Todos' },
    { value: 'caja', label: 'Caja (QR)' },
    { value: 'docs', label: 'Facturas y cotizaciones' },
    { value: 'outside', label: 'Fuera de Oplex' },
    { value: 'unassigned', label: `Sin asignar${data ? ` (${data.unassignedCount})` : ''}` },
  ];
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {filters.map((f) => (
          <button
            key={f.value}
            type="button"
            aria-pressed={origin === f.value}
            onClick={() => {
              setOrigin(f.value);
              setPage(1);
            }}
            className={`h-9 rounded-full border px-3.5 text-sm transition ${
              origin === f.value
                ? 'border-primary bg-primary font-semibold text-primary-foreground'
                : 'border-border bg-card font-medium text-foreground hover:bg-muted'
            }`}
          >
            {f.label}
          </button>
        ))}
        <span className="flex-1" />
        <PeriodSelect
          value={period}
          onChange={(p) => {
            setPeriod(p);
            setPage(1);
          }}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {data?.lastSyncAt
            ? `Actualizado el ${new Date(data.lastSyncAt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}`
            : 'Todavía no se trajeron movimientos de Mercado Pago.'}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => exportMutation.mutate()}
            disabled={exportMutation.isPending || !data || data.total === 0}
          >
            {exportMutation.isPending ? 'Generando...' : 'Exportar a Excel'}
          </Button>
          <Button type="button" onClick={() => syncMutation.mutate()} disabled={!connected || syncMutation.isPending}>
            {syncMutation.isPending ? 'Trayendo movimientos...' : 'Actualizar movimientos'}
          </Button>
        </div>
      </div>
      {notice && (
        <p className={`text-sm ${notice.isError ? 'text-destructive' : 'text-green-700 dark:text-green-400'}`}>{notice.text}</p>
      )}

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-left text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3.5 py-3 font-semibold">Fecha</th>
                <th className="px-3.5 py-3 font-semibold">Origen</th>
                <th className="px-3.5 py-3 font-semibold">Medio</th>
                <th className="px-3.5 py-3 text-right font-semibold">Cobrado</th>
                <th className="px-3.5 py-3 text-right font-semibold">Comisión</th>
                <th className="px-3.5 py-3 text-right font-semibold">Neto</th>
                <th className="px-3.5 py-3 font-semibold">Se libera</th>
                <th className="px-3.5 py-3 font-semibold">En Oplex</th>
              </tr>
            </thead>
            <tbody className={isFetching && !isLoading ? 'opacity-60' : ''}>
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-3.5 py-6 text-muted-foreground">
                    Cargando...
                  </td>
                </tr>
              ) : !data || data.rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3.5 py-6 text-muted-foreground">
                    {syncMutation.isPending
                      ? 'Trayendo los movimientos de Mercado Pago...'
                      : 'No hay movimientos con estos filtros.'}
                  </td>
                </tr>
              ) : (
                data.rows.map((row) => (
                  <Fragment key={row.id}>
                    <tr
                      className="cursor-pointer border-b border-border/70 hover:bg-muted/40"
                      onClick={() => setOpenRow(openRow === row.id ? null : row.id)}
                    >
                      <td className="whitespace-nowrap px-3.5 py-3 text-muted-foreground">{dateTime(row.date)}</td>
                      <td className="px-3.5 py-3">
                        <div className="font-semibold">{row.originLabel}</div>
                        <div className="text-xs text-muted-foreground">{row.originDetail}</div>
                      </td>
                      <td className="px-3.5 py-3 text-muted-foreground">{row.method}</td>
                      <td className="whitespace-nowrap px-3.5 py-3 text-right">{formatMoney(Number(row.gross))}</td>
                      <td className="whitespace-nowrap px-3.5 py-3 text-right text-red-700 dark:text-red-400">
                        {Number(row.fee) > 0 ? `− ${formatMoney(Number(row.fee))}` : '—'}
                      </td>
                      <td className="whitespace-nowrap px-3.5 py-3 text-right font-semibold">
                        {row.net != null ? formatMoney(Number(row.net)) : '—'}
                      </td>
                      <td className="whitespace-nowrap px-3.5 py-3">{releaseText(row)}</td>
                      <td className="px-3.5 py-3">
                        {row.oplexState === 'UNASSIGNED' && canAssign && row.registerId ? (
                          <Link
                            href={`/pos/sell?registerId=${row.registerId}&cobrosQr=1`}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex h-8 items-center rounded-lg border border-primary bg-primary/10 px-3 text-xs font-semibold text-primary hover:bg-primary/15"
                          >
                            Asignar a venta
                          </Link>
                        ) : (
                          <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATE_PILL[row.oplexState]}`}>
                            {row.oplexLabel}
                          </span>
                        )}
                      </td>
                    </tr>
                    {openRow === row.id && (
                      <tr className="border-b border-border/70 bg-muted/30">
                        <td colSpan={8} className="px-3.5 py-3">
                          <dl className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-x-6 gap-y-2 text-sm">
                            <Detail label="N.º de operación" value={row.mpPaymentId} />
                            <Detail label="Estado en Mercado Pago" value={row.mpStatusLabel} />
                            <Detail label="Pagó" value={row.payerEmail ?? 'Sin datos'} />
                            <Detail label="En Oplex" value={row.oplexLabel} />
                            {Number(row.refunded) > 0 && <Detail label="Devuelto" value={formatMoney(Number(row.refunded))} />}
                            {row.currency !== 'ARS' && <Detail label="Moneda" value={row.currency} />}
                          </dl>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {pages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Anterior
          </Button>
          <span className="text-muted-foreground">
            Página {page} de {pages}
          </span>
          <Button type="button" variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>
            Siguiente
          </Button>
        </div>
      )}

      <p className="text-sm text-muted-foreground">
        La comisión es todo lo que descuenta Mercado Pago (comisión, costo de las cuotas e impuestos): cobrado menos neto.
        Tocá un movimiento para ver el detalle.
      </p>
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium [overflow-wrap:anywhere]">{value}</dd>
    </div>
  );
}
