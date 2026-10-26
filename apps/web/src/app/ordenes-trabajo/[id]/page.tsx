'use client';

import QuoteDetailPanel from '@/app/quotes/QuoteDetailPanel';
import QuoteFormModal from '@/app/quotes/QuoteFormModal';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Select from '@/components/ui/Select';
import WorkOrderCostsPanel from '@/components/work-orders/WorkOrderCostsPanel';
import { businessProfileApi, isModuleEnabled } from '@/lib/businessModules';
import { calendarApi } from '@/lib/calendar';
import { customerAssetsApi, formatAssetValue } from '@/lib/customerAssets';
import { profileApi } from '@/lib/profile';
import { describeQuoteStatus, type QuoteDetail } from '@/lib/quotes';
import { formatMoney } from '@/lib/vatCost';
import { formatDate, workOrdersApi } from '@/lib/workOrders';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { ArrowLeft, Printer } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';

function errorMessage(err: unknown, fallback: string): string {
  const message = (err as AxiosError<{ message?: string | string[] }> | undefined)?.response?.data?.message;
  if (!message) return fallback;
  return Array.isArray(message) ? message.join(', ') : message;
}

/** Una orden de trabajo: estado, aviso al cliente, presupuesto y factura,
 * turno en la Agenda y comprobante de ingreso. */
export default function WorkOrderPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { data: profile } = useQuery({ queryKey: ['profile-me'], queryFn: profileApi.getMe });
  const orderQuery = useQuery({ queryKey: ['work-order', id], queryFn: () => workOrdersApi.get(id) });
  const { data: business } = useQuery({ queryKey: ['business-profile'], queryFn: businessProfileApi.get });
  const costsOn = Boolean(business) && isModuleEnabled(business, 'costo-trabajo');
  const configQuery = useQuery({ queryKey: ['work-order-config'], queryFn: workOrdersApi.config });
  const assigneesQuery = useQuery({ queryKey: ['work-order-assignees'], queryFn: workOrdersApi.assignees });
  const order = orderQuery.data;
  const typesQuery = useQuery({
    queryKey: ['customer-asset-types'],
    queryFn: customerAssetsApi.listTypes,
    enabled: Boolean(order?.asset),
  });
  const [error, setError] = useState('');
  const [editingText, setEditingText] = useState(false);
  const [description, setDescription] = useState('');
  const [intakeNotes, setIntakeNotes] = useState('');
  const [quoting, setQuoting] = useState(false);
  const [viewingQuote, setViewingQuote] = useState(false);
  const [editingQuote, setEditingQuote] = useState<QuoteDetail | null>(null);
  const [scheduling, setScheduling] = useState(false);
  const [appointment, setAppointment] = useState('');
  const [scheduled, setScheduled] = useState('');
  const canWrite = profile?.role === 'OWNER' || profile?.role === 'ADMIN' || profile?.role === 'SALES';

  function refresh(saved?: Awaited<ReturnType<typeof workOrdersApi.get>>) {
    if (saved) queryClient.setQueryData(['work-order', id], saved);
    else void queryClient.invalidateQueries({ queryKey: ['work-order', id] });
    void queryClient.invalidateQueries({ queryKey: ['work-orders'] });
    setError('');
  }

  const statusMutation = useMutation({
    mutationFn: (statusId: string) => workOrdersApi.changeStatus(id, statusId),
    onSuccess: refresh,
    onError: (err) => setError(errorMessage(err, 'No se pudo cambiar el estado')),
  });
  const updateMutation = useMutation({
    mutationFn: (input: Parameters<typeof workOrdersApi.update>[1]) => workOrdersApi.update(id, input),
    onSuccess: (saved) => {
      refresh(saved);
      setEditingText(false);
    },
    onError: (err) => setError(errorMessage(err, 'No se pudo guardar')),
  });
  const whatsappMutation = useMutation({
    mutationFn: () => workOrdersApi.whatsappLink(id),
    onSuccess: ({ url }) => window.open(url, '_blank', 'noopener'),
    onError: (err) => setError(errorMessage(err, 'No se pudo armar el mensaje')),
  });
  const scheduleMutation = useMutation({
    mutationFn: () =>
      calendarApi.createEvent({
        title: `${order?.number} · ${order?.customer.name}${order?.asset ? ` (${order.asset.identifier})` : ''}`,
        startsAt: new Date(appointment).toISOString(),
        kind: 'MEETING',
        linkType: 'work-order',
        linkId: id,
      }),
    onSuccess: () => {
      setScheduled(`Turno agendado para el ${new Date(appointment).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}.`);
      setScheduling(false);
      setAppointment('');
    },
    onError: (err) => setError(errorMessage(err, 'No se pudo agendar')),
  });

  if (orderQuery.isError) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">No se encontró esta orden.</p>
        <Link href="/ordenes-trabajo" className="text-sm text-indigo-600 underline">
          Volver
        </Link>
      </div>
    );
  }
  if (!order || !configQuery.data) return <p className="text-sm text-muted-foreground">Cargando…</p>;

  const config = configQuery.data;
  const steps = config.statuses.filter((s) => s.active || s.id === order.status.id);
  const currentIndex = steps.findIndex((s) => s.id === order.status.id);
  const next = steps[currentIndex + 1];
  const statusName = new Map(config.statuses.map((s) => [s.id, s.name]));
  const assetType = typesQuery.data?.find((t) => t.id === order.asset?.typeId);
  const snapshotFields = (assetType?.fields ?? []).filter(
    (f) => f.type === 'NUMBER' && order.assetSnapshot?.[f.key] !== undefined,
  );
  const quoteStatus = order.quote ? describeQuoteStatus({ status: order.quote.status as QuoteDetail['status'], validUntil: null }) : null;
  const quoteNotes = [
    `${config.docName} ${order.number}`,
    order.asset ? `${order.asset.typeName} ${order.asset.identifier}` : null,
    order.description,
  ]
    .filter(Boolean)
    .join(' — ');

  return (
    <div className="flex max-w-5xl flex-col gap-4">
      <Link href="/ordenes-trabajo" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {config.pluralName}
      </Link>

      <section className="rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">{config.docName}</p>
            <h1 className="font-mono text-2xl font-bold">{order.number}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Ingresó el {formatDate(order.createdAt)} · {order.customer.name}
              {order.customer.phone ? ` · ${order.customer.phone}` : ''}
            </p>
            {order.asset && (
              <Link href={`/fichas/${order.asset.id}`} className="mt-1 inline-block font-mono text-sm font-semibold text-indigo-600 hover:underline">
                {order.asset.typeName} {order.asset.identifier}
              </Link>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={`/comprobante-ingreso/${order.id}`} target="_blank" rel="noopener" className={buttonVariants({ variant: 'outline' })}>
              <Printer className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Comprobante de ingreso
            </a>
          </div>
        </div>

        <ol aria-label="Estados" className="mt-4 flex flex-wrap gap-1.5">
          {steps.map((s, i) => {
            const current = s.id === order.status.id;
            const done = i < currentIndex;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  disabled={!canWrite || current || statusMutation.isPending}
                  onClick={() => statusMutation.mutate(s.id)}
                  aria-current={current ? 'step' : undefined}
                  title={current ? undefined : `Pasar a "${s.name}"`}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                    current
                      ? 'bg-indigo-600 text-white'
                      : done
                        ? 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:text-indigo-300'
                        : 'bg-muted text-muted-foreground hover:bg-muted/70'
                  }`}
                >
                  {s.name}
                </button>
              </li>
            );
          })}
        </ol>
        {canWrite && next && (
          <Button className="mt-3" disabled={statusMutation.isPending} onClick={() => statusMutation.mutate(next.id)}>
            Pasar a &quot;{next.name}&quot;
          </Button>
        )}

        {order.status.notifiesCustomer && (
          <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-900 dark:bg-green-950/40">
            <p className="text-sm font-medium text-green-900 dark:text-green-200">Avisale al cliente que está listo</p>
            <p className="mt-0.5 text-xs text-green-900/80 dark:text-green-300/80">
              Se abre WhatsApp con el mensaje armado{order.customer.phone ? ` para ${order.customer.phone}` : ''}.
            </p>
            <Button className="mt-2 bg-green-700 hover:bg-green-800" disabled={whatsappMutation.isPending} onClick={() => whatsappMutation.mutate()}>
              Avisar por WhatsApp
            </Button>
          </div>
        )}
      </section>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex flex-wrap gap-4">
        <section className="min-w-0 flex-[2_1_380px] rounded-xl border bg-card p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">El trabajo</h2>
            {canWrite && !editingText && (
              <button
                type="button"
                onClick={() => {
                  setDescription(order.description);
                  setIntakeNotes(order.intakeNotes ?? '');
                  setEditingText(true);
                }}
                className="text-xs font-medium text-indigo-600 hover:underline"
              >
                Editar
              </button>
            )}
          </div>
          {editingText ? (
            <div className="mt-2 flex flex-col gap-2">
              <label className="text-sm text-muted-foreground" htmlFor="wo-desc">
                Qué hay que hacer
              </label>
              <textarea id="wo-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="rounded-lg border bg-transparent p-2 text-sm" />
              <label className="text-sm text-muted-foreground" htmlFor="wo-notes">
                Cómo vino
              </label>
              <textarea id="wo-notes" value={intakeNotes} onChange={(e) => setIntakeNotes(e.target.value)} rows={2} className="rounded-lg border bg-transparent p-2 text-sm" />
              <div className="flex gap-2">
                <Button size="sm" disabled={updateMutation.isPending} onClick={() => updateMutation.mutate({ description, intakeNotes })}>
                  Guardar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingText(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <>
              <p className="mt-2 whitespace-pre-line text-sm">{order.description}</p>
              {order.intakeNotes && (
                <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">Cómo vino: </span>
                  {order.intakeNotes}
                </p>
              )}
            </>
          )}
          {snapshotFields.length > 0 && (
            <p className="mt-3 text-sm text-muted-foreground">
              Al ingresar:{' '}
              {snapshotFields.map((f) => `${f.label} ${formatAssetValue(f, order.assetSnapshot?.[f.key])}`).join(' · ')}
            </p>
          )}
        </section>

        <section className="min-w-0 flex-[1_1_240px] rounded-xl border bg-card p-5">
          <div className="flex flex-col gap-1">
            <span className="text-sm text-muted-foreground">Responsable</span>
            <Select
              value={order.assignedUserId ?? ''}
              disabled={!canWrite}
              onChange={(v) => updateMutation.mutate({ assignedUserId: v || null })}
              options={[{ value: '', label: 'Sin asignar' }, ...(assigneesQuery.data ?? []).map((u) => ({ value: u.id, label: u.name }))]}
            />
          </div>
          <div className="mt-3 flex flex-col gap-1">
            <label htmlFor="wo-promised" className="text-sm text-muted-foreground">
              Prometido para
            </label>
            <Input
              id="wo-promised"
              type="date"
              disabled={!canWrite}
              value={order.promisedAt?.slice(0, 10) ?? ''}
              onChange={(e) => updateMutation.mutate({ promisedAt: e.target.value || null })}
            />
          </div>
          {canWrite && (
            <div className="mt-4 border-t pt-3">
              {scheduling ? (
                <div className="flex flex-col gap-2">
                  <label htmlFor="wo-appt" className="text-sm text-muted-foreground">
                    Turno
                  </label>
                  <Input id="wo-appt" type="datetime-local" value={appointment} onChange={(e) => setAppointment(e.target.value)} />
                  <div className="flex gap-2">
                    <Button size="sm" disabled={!appointment || scheduleMutation.isPending} onClick={() => scheduleMutation.mutate()}>
                      Agendar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setScheduling(false)}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => setScheduling(true)} className="text-sm font-medium text-indigo-600 hover:underline">
                  + Agendar turno en la Agenda
                </button>
              )}
              {scheduled && <p className="mt-2 text-xs text-green-700 dark:text-green-400">{scheduled}</p>}
            </div>
          )}
        </section>
      </div>

      <section className="rounded-xl border bg-card p-5">
        <h2 className="text-base font-semibold">Presupuesto y factura</h2>
        {order.quote ? (
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
            <span className="font-mono font-semibold">{order.quote.number}</span>
            {quoteStatus && <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${quoteStatus.colorClass}`}>{quoteStatus.label}</span>}
            <span>{formatMoney(Number(order.quote.total))}</span>
            <Button size="sm" variant="outline" onClick={() => setViewingQuote(true)}>
              Ver presupuesto
            </Button>
          </div>
        ) : (
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <p className="text-sm text-muted-foreground">Todavía no tiene presupuesto.</p>
            {canWrite && (
              <Button size="sm" onClick={() => setQuoting(true)}>
                Armar presupuesto
              </Button>
            )}
          </div>
        )}
        {order.invoice ? (
          <p className="mt-3 text-sm">
            Facturado: <span className="font-mono font-semibold">{order.invoice.label}</span> · {formatMoney(Number(order.invoice.total))} ·{' '}
            <Link href="/invoicing" className="text-indigo-600 hover:underline">
              Ver en Facturación
            </Link>
          </p>
        ) : order.quote ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Cuando el cliente lo acepte, se factura desde el presupuesto (&quot;Ver presupuesto&quot; → Convertir a factura).
          </p>
        ) : null}
      </section>

      {/* Costo y margen (módulo "Costo por trabajo"). */}
      {costsOn && <WorkOrderCostsPanel orderId={order.id} role={profile?.role} />}

      <section className="rounded-xl border bg-card p-5">
        <h2 className="text-base font-semibold">Historial</h2>
        <ul className="mt-2 flex flex-col gap-1 text-sm">
          {order.history.map((h) => (
            <li key={h.id} className="text-muted-foreground">
              {new Date(h.createdAt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })} ·{' '}
              <span className="text-foreground">{statusName.get(h.toStatusId) ?? 'Estado'}</span>
              {h.userName ? ` · ${h.userName}` : ''}
            </li>
          ))}
        </ul>
      </section>

      {quoting && (
        <QuoteFormModal
          initialCustomerId={order.customer.id}
          initialNotes={quoteNotes}
          onClose={() => setQuoting(false)}
          onSaved={(quote) => updateMutation.mutate({ quoteId: quote.id })}
        />
      )}
      {viewingQuote && order.quote && (
        <QuoteDetailPanel
          quoteId={order.quote.id}
          onClose={() => {
            setViewingQuote(false);
            refresh();
          }}
          onEdit={(detail) => {
            setViewingQuote(false);
            setEditingQuote(detail);
          }}
        />
      )}
      {editingQuote && (
        <QuoteFormModal
          quote={editingQuote}
          onClose={() => {
            setEditingQuote(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}
