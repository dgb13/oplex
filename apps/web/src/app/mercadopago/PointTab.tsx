'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  describePointPayment,
  pointChargesApi,
  type PointChargeRow,
  type PointChargeStatus,
  type PointChargesList,
  type PointPayment,
} from '@/lib/pos';
import { formatMoney } from '@/lib/vatCost';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import Link from 'next/link';
import { useState } from 'react';

// Control de cobros con Point (mockup aprobado 2026-10-28): cada venta de la
// Caja cobrada con Point contra cada pago de Point que llegó a la cuenta.
// Lo que coincide se confirma solo (PosPointChargesService); lo que no,
// queda acá para revisar.

type Selected = { kind: 'charge'; id: string } | { kind: 'payment'; id: string } | null;

const STATUS: Record<PointChargeStatus, { label: string; tone: 'ok' | 'warn' | 'wait' }> = {
  CONFIRMED: { label: '✓ Confirmado', tone: 'ok' },
  RESOLVED: { label: '✓ Resuelto', tone: 'ok' },
  MISSING: { label: 'Sin pago en MP', tone: 'warn' },
  AMBIGUOUS: { label: 'Para elegir', tone: 'warn' },
  WAITING: { label: '⏳ Esperando', tone: 'wait' },
};
const TONES = {
  ok: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400',
  warn: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  wait: 'bg-muted text-muted-foreground',
};

function errorMessage(err: unknown, fallback: string): string {
  const message = (err as AxiosError<{ message?: string | string[] }>)?.response?.data?.message;
  if (Array.isArray(message)) return message.join(', ');
  return message ?? fallback;
}

function time(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function dayAndTime(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  return date.toDateString() === today.toDateString()
    ? time(iso)
    : `${date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })} ${time(iso)}`;
}

function Pill({ tone, children }: { tone: keyof typeof TONES; children: React.ReactNode }) {
  return <span className={`rounded-full px-2 py-px text-[11px] font-bold whitespace-nowrap ${TONES[tone]}`}>{children}</span>;
}

export default function PointTab({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<'review' | 'all'>('review');
  const [selected, setSelected] = useState<Selected>(null);
  const [notice, setNotice] = useState('');
  const [syncError, setSyncError] = useState('');

  const query = useQuery({
    queryKey: ['pos-point-charges-list'],
    // "Hoy" en la hora local (el servidor está en UTC).
    queryFn: () => {
      const from = new Date();
      from.setHours(0, 0, 0, 0);
      return pointChargesApi.list({ from: from.toISOString() });
    },
    refetchInterval: 60_000,
  });
  const refresh = useMutation({
    mutationFn: pointChargesApi.refresh,
    onSuccess: (result) => {
      setSyncError(result.syncError ?? '');
      void queryClient.invalidateQueries({ queryKey: ['pos-point-charges-list'] });
    },
    onError: (err) => setSyncError(errorMessage(err, 'No se pudo consultar a Mercado Pago')),
  });

  const data = query.data;
  if (!data) {
    return <p className="text-sm text-muted-foreground">{query.isError ? 'No se pudo cargar el control de cobros con Point.' : 'Cargando...'}</p>;
  }

  const toReview = (r: PointChargeRow) => r.status === 'MISSING' || r.status === 'AMBIGUOUS';
  const rows = filter === 'review' ? data.rows.filter(toReview) : data.rows;
  const unmatched = filter === 'review' ? data.unmatched.filter((p) => !p.reviewed) : data.unmatched;
  const reviewCount = data.rows.filter(toReview).length + data.unmatched.filter((p) => !p.reviewed).length;
  const empty = rows.length === 0 && unmatched.length === 0;

  // Ventas y pagos sueltos en una sola lista, por hora.
  const items = [
    ...rows.map((r) => ({ key: `c-${r.id}`, at: r.soldAt, kind: 'charge' as const, row: r })),
    ...unmatched.map((p) => ({ key: `p-${p.mpPaymentId}`, at: p.dateCreated, kind: 'payment' as const, payment: p })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  const selectedCharge = selected?.kind === 'charge' ? data.rows.find((r) => r.id === selected.id) : undefined;
  const selectedPayment = selected?.kind === 'payment' ? data.unmatched.find((p) => p.mpPaymentId === selected.id) : undefined;

  const done = (message: string) => {
    setNotice(message);
    void queryClient.invalidateQueries({ queryKey: ['pos-point-charges-list'] });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-[70ch]">
          <h2 className="text-lg font-semibold">Control de cobros con Point</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Cada venta cobrada con Point en la Caja contra cada pago de Point que llegó a la cuenta de Mercado Pago. Lo que
            coincide se confirma solo; lo que no, queda acá para revisar. Hoy, en todas las cajas.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => refresh.mutate()} disabled={refresh.isPending}>
          {refresh.isPending ? 'Consultando a Mercado Pago…' : 'Actualizar ahora'}
        </Button>
      </div>

      {syncError && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          {syncError}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <Kpi value={data.totals.confirmedCount} label={`Confirmados · ${formatMoney(Number(data.totals.confirmedAmount))}`} />
        <Kpi value={data.totals.missing} label="Sin pago en Mercado Pago" attention={data.totals.missing > 0} />
        <Kpi value={data.totals.ambiguous} label="Para elegir (varios pagos posibles)" attention={data.totals.ambiguous > 0} />
        <Kpi value={data.totals.unmatched} label="Pago sin venta en Oplex" attention={data.totals.unmatched > 0} />
      </div>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtro">
        {(
          [
            ['review', `A revisar (${reviewCount})`],
            ['all', `Todos (${data.rows.length + data.unmatched.length})`],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
            className={`rounded-lg border px-2.5 py-1 text-[12.5px] ${
              filter === value ? 'border-primary bg-primary/10 font-semibold text-primary' : 'bg-card'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {notice && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
          {notice}
        </p>
      )}

      <Card className="gap-0 overflow-x-auto py-0">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b text-left text-[11px] tracking-wide text-muted-foreground uppercase">
              <th className="px-3 py-2 font-semibold">Hora</th>
              <th className="px-3 py-2 font-semibold">Venta en Oplex</th>
              <th className="px-3 py-2 font-semibold">Pago en Mercado Pago</th>
              <th className="px-3 py-2 font-semibold">Estado</th>
            </tr>
          </thead>
          <tbody>
            {empty && (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-muted-foreground">
                  {filter === 'review'
                    ? 'Nada para revisar. Todos los cobros con Point de hoy coinciden con Mercado Pago.'
                    : 'Todavía no hubo ventas ni pagos con Point hoy.'}
                </td>
              </tr>
            )}
            {items.map((item) => {
              const isSelected =
                item.kind === 'charge'
                  ? selected?.kind === 'charge' && selected.id === item.row.id
                  : selected?.kind === 'payment' && selected.id === item.payment.mpPaymentId;
              return (
                <tr
                  key={item.key}
                  onClick={() => {
                    setNotice('');
                    setSelected(item.kind === 'charge' ? { kind: 'charge', id: item.row.id } : { kind: 'payment', id: item.payment.mpPaymentId });
                  }}
                  className={`cursor-pointer border-b last:border-b-0 ${isSelected ? 'bg-primary/10' : 'hover:bg-muted/50'}`}
                >
                  <td className="px-3 py-2.5 align-top font-mono tabular-nums">{dayAndTime(item.at)}</td>
                  {item.kind === 'charge' ? (
                    <>
                      <td className="px-3 py-2.5 align-top">
                        <b>{item.row.invoiceLabel ?? 'Venta'}</b>
                        <div className="text-xs text-muted-foreground">
                          {item.row.registerName ?? 'Caja'} · <span className="tabular-nums">{formatMoney(Number(item.row.amount))}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        {item.row.payment ? (
                          <>
                            <span className="tabular-nums">{formatMoney(Number(item.row.payment.amount))}</span>
                            <div className="text-xs text-muted-foreground">{describePointPayment(item.row.payment)}</div>
                          </>
                        ) : item.row.status === 'AMBIGUOUS' ? (
                          <span className="text-muted-foreground">{item.row.candidates.length} posibles</span>
                        ) : item.row.status === 'RESOLVED' ? (
                          <span className="text-muted-foreground">{item.row.resolution}</span>
                        ) : (
                          <span className="text-muted-foreground">{item.row.status === 'WAITING' ? 'Todavía no llegó' : 'No apareció'}</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <Pill tone={STATUS[item.row.status].tone}>{STATUS[item.row.status].label}</Pill>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-3 py-2.5 align-top text-muted-foreground">—</td>
                      <td className="px-3 py-2.5 align-top">
                        <span className="tabular-nums">{formatMoney(Number(item.payment.amount))}</span>
                        <div className="text-xs text-muted-foreground">{describePointPayment(item.payment)}</div>
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <Pill tone={item.payment.reviewed ? 'ok' : 'warn'}>{item.payment.reviewed ? '✓ Revisado' : 'Pago sin venta'}</Pill>
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {selectedCharge && (
        <ChargeDetail key={selectedCharge.id} row={selectedCharge} data={data} canManage={canManage} onDone={done} />
      )}
      {selectedPayment && (
        <PaymentDetail key={selectedPayment.mpPaymentId} payment={selectedPayment} canManage={canManage} onDone={done} />
      )}

      <Card className="gap-3 px-5 py-4">
        <h3 className="text-sm font-semibold">Cómo empareja Oplex</h3>
        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
          <RuleBox title="Mismo monto">Exacto al centavo, contra el monto de la venta.</RuleBox>
          <RuleBox title="Misma ventana de tiempo">
            El pago entre {data.rule.windowBeforeMinutes} minutos antes y {data.rule.windowAfterMinutes} minutos después de
            confirmar la venta.
          </RuleBox>
          <RuleBox title="Uno y sólo uno">
            Si hay dos pagos que encajan, Oplex no adivina: lo deja &quot;Para elegir&quot; y lo decide una persona.
          </RuleBox>
        </div>
        <p className="text-xs text-muted-foreground">
          Oplex consulta a Mercado Pago cada 2 minutos mientras haya ventas con Point sin pago. Si a los{' '}
          {data.rule.missingAfterMinutes} minutos no apareció, la venta pasa a &quot;Sin pago en Mercado Pago&quot; y avisa en
          la campana.
        </p>
      </Card>
    </div>
  );
}

function Kpi({ value, label, attention }: { value: number; label: string; attention?: boolean }) {
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${attention ? 'border-orange-400 bg-amber-50 dark:bg-amber-950/30' : 'bg-muted/40'}`}>
      <b className="block text-xl tabular-nums">{value}</b>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function RuleBox({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border px-3 py-2.5 text-[13px]">
      <b className="mb-0.5 block">{title}</b>
      <span className="text-muted-foreground">{children}</span>
    </div>
  );
}

function ChargeDetail({
  row,
  data,
  canManage,
  onDone,
}: {
  row: PointChargeRow;
  data: PointChargesList;
  canManage: boolean;
  onDone: (message: string) => void;
}) {
  const [error, setError] = useState('');
  const changeMethod = useMutation({
    mutationFn: (method: 'CASH' | 'CARD') => pointChargesApi.changeMethod(row.id, method),
    onSuccess: (_r, method) =>
      onDone(method === 'CASH' ? 'Forma de pago cambiada a Efectivo. El arqueo de la caja se corrigió.' : 'Forma de pago cambiada a Tarjeta.'),
    onError: (err) => setError(errorMessage(err, 'No se pudo cambiar la forma de pago')),
  });
  const confirm = useMutation({
    mutationFn: (payment: PointPayment) => pointChargesApi.confirm(row.id, payment.mpPaymentId),
    onSuccess: (_r, payment) => onDone(`Venta emparejada con el pago de las ${time(payment.dateCreated)}.`),
    onError: (err) => setError(errorMessage(err, 'No se pudo emparejar')),
  });

  const title = `${row.invoiceLabel ? `Venta ${row.invoiceLabel}` : 'Venta'} · ${formatMoney(Number(row.amount))} · ${row.registerName ?? 'Caja'}`;
  const sold = new Date(row.soldAt).getTime();
  const windowText = `entre las ${time(new Date(sold - data.rule.windowBeforeMinutes * 60_000).toISOString())} y las ${time(
    new Date(sold + data.rule.windowAfterMinutes * 60_000).toISOString(),
  )}`;

  return (
    <div className="flex flex-col gap-2.5 rounded-xl border bg-muted/40 p-4">
      <b className="text-sm">{title}</b>
      {row.status === 'CONFIRMED' && (
        <span className="text-[13px]">
          {row.resolution ? `${row.resolution}.` : 'Confirmado automáticamente: mismo monto y dentro de la ventana de tiempo.'}
          {row.payment && ` Pago de Mercado Pago #${row.payment.mpPaymentId} · ${describePointPayment(row.payment)} · ${time(row.payment.dateCreated)}.`}
        </span>
      )}
      {row.status === 'RESOLVED' && <span className="text-[13px]">{row.resolution}.</span>}
      {row.status === 'WAITING' && (
        <span className="text-[13px]">
          Todavía no llegó el pago. Oplex lo sigue buscando {windowText}; si a los {data.rule.missingAfterMinutes} minutos no
          aparece, queda para revisar.
        </span>
      )}
      {row.status === 'MISSING' && (
        <>
          <span className="text-[13px]">
            Se cargó como Point, pero en Mercado Pago no hay ningún pago de {formatMoney(Number(row.amount))} {windowText}.
            Puede que el cliente haya pagado de otra forma, que el cobro haya sido rechazado en el posnet, o que se haya cobrado
            en un Point de otra cuenta.
          </span>
          {canManage && (
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={() => changeMethod.mutate('CASH')} disabled={changeMethod.isPending}>
                Fue en efectivo
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => changeMethod.mutate('CARD')} disabled={changeMethod.isPending}>
                Fue con tarjeta de otro posnet
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onDone('Queda esperando. Se confirma sola si el pago aparece.')}
              >
                Esperar (se confirma solo si aparece)
              </Button>
            </div>
          )}
          <span className="text-xs text-muted-foreground">Cambiar la forma de pago corrige el arqueo de la caja; la factura no cambia.</span>
        </>
      )}
      {row.status === 'AMBIGUOUS' && (
        <>
          <span className="text-[13px]">
            Hay {row.candidates.length > 1 ? `${row.candidates.length} pagos` : 'un pago'} de Point de{' '}
            {formatMoney(Number(row.amount))} en la ventana de tiempo
            {row.candidates.length === 1 ? ', y otra venta igual también podría ser la suya' : ''}. Oplex no elige por vos:
            decí cuál es el de esta venta. El otro queda para la venta que corresponda.
          </span>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-2.5">
            {row.candidates.map((p, i) => {
              const minutes = Math.round((new Date(p.dateCreated).getTime() - sold) / 60_000);
              return (
                <div key={p.mpPaymentId} className={`flex flex-col gap-1 rounded-lg border-[1.5px] bg-card px-3 py-2.5 text-[13px] ${i === 0 ? 'border-sky-500' : ''}`}>
                  <b className="tabular-nums">
                    {formatMoney(Number(p.amount))} · {time(p.dateCreated)}
                  </b>
                  <span className="text-xs text-muted-foreground">
                    {describePointPayment(p)} · #{p.mpPaymentId} ·{' '}
                    {minutes === 0 ? 'a la misma hora' : minutes > 0 ? `${minutes} min después` : `${-minutes} min antes`}
                  </span>
                  {canManage && (
                    <Button
                      type="button"
                      size="sm"
                      variant={i === 0 ? 'default' : 'outline'}
                      className="self-start"
                      onClick={() => confirm.mutate(p)}
                      disabled={confirm.isPending}
                    >
                      Es este
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
      {!canManage && (row.status === 'MISSING' || row.status === 'AMBIGUOUS') && (
        <span className="text-xs text-muted-foreground">Lo resuelve el dueño o un administrador.</span>
      )}
      {error && <span className="text-sm text-destructive">{error}</span>}
    </div>
  );
}

function PaymentDetail({
  payment,
  canManage,
  onDone,
}: {
  payment: PointPayment & { reviewed: boolean };
  canManage: boolean;
  onDone: (message: string) => void;
}) {
  const [error, setError] = useState('');
  const [picking, setPicking] = useState(false);
  const sales = useQuery({
    queryKey: ['pos-point-payment-sales', payment.mpPaymentId],
    queryFn: () => pointChargesApi.salesForPayment(payment.mpPaymentId),
    enabled: picking,
  });
  const dismiss = useMutation({
    mutationFn: () => pointChargesApi.dismiss(payment.mpPaymentId),
    onSuccess: () => onDone('Marcado como revisado: no era una venta.'),
    onError: (err) => setError(errorMessage(err, 'No se pudo marcar')),
  });
  const link = useMutation({
    mutationFn: (chargeId: string) => pointChargesApi.confirm(chargeId, payment.mpPaymentId),
    onSuccess: () => onDone('Pago emparejado con la venta elegida.'),
    onError: (err) => setError(errorMessage(err, 'No se pudo emparejar')),
  });

  return (
    <div className="flex flex-col gap-2.5 rounded-xl border bg-muted/40 p-4">
      <b className="text-sm">
        Pago #{payment.mpPaymentId} · {formatMoney(Number(payment.amount))} · {describePointPayment(payment)} · {time(payment.dateCreated)}
      </b>
      {payment.reviewed ? (
        <span className="text-[13px]">Marcado como revisado: no era una venta.</span>
      ) : (
        <>
          <span className="text-[13px]">
            Entró a la cuenta un pago de Point que no coincide con ninguna venta de Oplex. Pasa cuando se cobra en el posnet sin
            cargar la venta, o con un cobro que no es de venta (una seña, un arreglo).
          </span>
          {canManage ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={() => setPicking((v) => !v)}>
                Es de una venta ya hecha…
              </Button>
              <Link
                href={`/pos?pointPayment=${encodeURIComponent(payment.mpPaymentId)}`}
                className="inline-flex h-7 items-center rounded-lg border bg-background px-2.5 text-[0.8rem] font-medium hover:bg-muted"
              >
                Cargar la venta ahora
              </Link>
              <Button type="button" size="sm" variant="outline" onClick={() => dismiss.mutate()} disabled={dismiss.isPending}>
                No es una venta (marcar como revisado)
              </Button>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">Lo resuelve el dueño o un administrador.</span>
          )}
          {picking && (
            <div className="flex flex-col gap-1.5 rounded-lg border bg-card p-3 text-[13px]">
              <span className="text-xs text-muted-foreground">Ventas con Point sin pago, del mismo monto:</span>
              {sales.isLoading && <span className="text-muted-foreground">Buscando…</span>}
              {sales.data?.length === 0 && (
                <span className="text-muted-foreground">
                  No hay ventas con Point de {formatMoney(Number(payment.amount))} esperando pago. Si la venta no se cargó, usá
                  &quot;Cargar la venta ahora&quot;.
                </span>
              )}
              {sales.data?.map((sale) => (
                <div key={sale.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <b>{sale.invoiceLabel ?? 'Venta'}</b> · {dayAndTime(sale.soldAt)} · {formatMoney(Number(sale.amount))}
                  </span>
                  <Button type="button" size="sm" onClick={() => link.mutate(sale.id)} disabled={link.isPending}>
                    Es esta
                  </Button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {error && <span className="text-sm text-destructive">{error}</span>}
    </div>
  );
}
