'use client';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { legalApi, type LegalRequestReceipt } from '@/lib/legal';
import { profileApi } from '@/lib/profile';
import {
  billingApi,
  formatPesos,
  plansApi,
  type BillingOverview,
  type Plan,
  type SubscriptionPayment,
} from '@/lib/subscriptions';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import Link from 'next/link';
import { useState } from 'react';
import CheckoutDialog from './CheckoutDialog';

const STATUS_PILL: Record<string, { label: string; className: string }> = {
  TRIALING: { label: 'En prueba', className: 'bg-primary/10 text-primary' },
  ACTIVE: { label: 'Activo', className: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' },
  PAST_DUE: { label: 'Pago vencido', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400' },
  EXPIRED: { label: 'Sólo lectura', className: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400' },
  CANCELLED: { label: 'Dado de baja', className: 'bg-muted text-muted-foreground' },
};

const METHOD_LABEL: Record<string, string> = {
  MP_DEBIT: 'Débito automático',
  TRANSFER: 'Transferencia',
  CASH: 'Efectivo',
  OTHER: 'Otro',
};

const PAYMENT_STATUS: Record<string, { label: string; className: string }> = {
  PENDING: { label: 'Por confirmar', className: 'text-amber-600 dark:text-amber-400' },
  PAID: { label: 'Pagado', className: 'text-green-600 dark:text-green-400' },
  REJECTED: { label: 'Rechazado', className: 'text-destructive' },
  REFUNDED: { label: 'Devuelto', className: 'text-muted-foreground' },
};

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
}

function errorMessage(err: unknown, fallback: string): string {
  const message = (err as AxiosError<{ message?: string | string[] }> | undefined)?.response?.data?.message;
  if (!message) return fallback;
  return Array.isArray(message) ? message.join(', ') : message;
}

function monthsLabel(months: number): string {
  return months === 12 ? '1 año' : `${months} ${months === 1 ? 'mes' : 'meses'}`;
}

export default function BillingPage() {
  const queryClient = useQueryClient();
  const { data: plans, isLoading: plansLoading } = useQuery({ queryKey: ['plans'], queryFn: plansApi.list });
  const { data: billing, isLoading: billingLoading } = useQuery({ queryKey: ['billing'], queryFn: billingApi.get });
  const { data: profile } = useQuery({ queryKey: ['profile-me'], queryFn: profileApi.getMe });
  const canManage = profile?.role === 'OWNER' || profile?.role === 'ADMIN';
  const [checkoutPlan, setCheckoutPlan] = useState<Plan | null>(null);
  const [planToSwitch, setPlanToSwitch] = useState<Plan | null>(null);
  const [notice, setNotice] = useState('');

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ['billing'] });
    void queryClient.invalidateQueries({ queryKey: ['subscription-me'] });
  }

  if (plansLoading || billingLoading || !plans || !billing) {
    return (
      <div className="flex max-w-6xl flex-col gap-6">
        <h1 className="text-xl font-semibold">Planes y facturación</h1>
        <p className="text-sm text-muted-foreground">Cargando...</p>
      </div>
    );
  }

  const { subscription, pendingPayment, payments, oplexBank } = billing;
  const currentPlan = subscription.plan;
  // Con un período pago (o vencido hace poco), los otros planes se ofrecen
  // como cambio de plan, no como una contratación nueva.
  const paying = subscription.status === 'ACTIVE' || subscription.status === 'PAST_DUE';

  function planAction(plan: Plan): { label: string; onClick: () => void } | null {
    if (!canManage || pendingPayment) return null;
    const isCurrent = plan.id === currentPlan.id;
    const price = Number(plan.priceMonthly);
    if (isCurrent) return !paying && price > 0 ? { label: 'Contratar', onClick: () => setCheckoutPlan(plan) } : null;
    if (price === 0) return { label: 'Usar gratis', onClick: () => setPlanToSwitch(plan) };
    if (paying) {
      const up = price > Number(currentPlan.priceMonthly);
      return { label: `${up ? 'Subir' : 'Bajar'} a ${plan.name}`, onClick: () => setPlanToSwitch(plan) };
    }
    return { label: 'Contratar', onClick: () => setCheckoutPlan(plan) };
  }

  return (
    <div className="flex max-w-6xl flex-col gap-6">
      <h1 className="text-xl font-semibold">Planes y facturación</h1>

      <StatusCard billing={billing} canManage={canManage} onPay={() => setCheckoutPlan(currentPlan)} />

      {notice && (
        <p className="rounded-lg bg-green-50 p-3 text-sm text-green-700 dark:bg-green-950/40 dark:text-green-400">{notice}</p>
      )}

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-semibold">Planes</h2>
          <p className="text-xs text-muted-foreground">Precios mensuales sin IVA. Pagando el año entero tenés descuento.</p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {plans.map((plan) => {
            const isCurrent = plan.id === currentPlan.id;
            const price = Number(plan.priceMonthly);
            const annual = Number(plan.annualDiscountPercent);
            const action = planAction(plan);
            return (
              <div key={plan.id} className={`flex flex-col gap-3 rounded-xl border p-5 ${isCurrent ? 'border-primary bg-primary/5' : ''}`}>
                {isCurrent && (
                  <span className="self-start rounded bg-primary px-2 py-0.5 text-[10px] font-semibold tracking-wide text-primary-foreground uppercase">
                    {subscription.status === 'TRIALING' ? 'En prueba' : 'Tu plan'}
                  </span>
                )}
                <h3 className="text-sm font-semibold">{plan.name}</h3>
                <p>
                  <span className="text-2xl font-bold">{price === 0 ? 'Gratis' : `$${price.toLocaleString('es-AR')}`}</span>
                  {price > 0 && <span className="text-xs font-normal text-muted-foreground"> / mes + IVA</span>}
                </p>
                {price > 0 && annual > 0 && (
                  <p className="-mt-2 text-xs font-semibold text-green-600 dark:text-green-400">{annual}% off pagando el año</p>
                )}
                <ul className="flex flex-1 flex-col gap-1 text-xs text-muted-foreground">
                  <li>
                    {plan.maxUsers} usuario{plan.maxUsers === 1 ? '' : 's'}
                  </li>
                  <li>{plan.maxClients} clientes</li>
                  <li>{plan.maxMonthlyInvoices.toLocaleString('es-AR')} facturas/mes</li>
                  <li>
                    {plan.aiInvoiceScanMonthlyQuota != null
                      ? `${plan.aiInvoiceScanMonthlyQuota.toLocaleString('es-AR')} comprobantes IA/mes`
                      : 'Sin carga de comprobantes con IA'}
                  </li>
                </ul>
                {action && (
                  <Button size="sm" variant={isCurrent ? 'default' : 'outline'} onClick={action.onClick}>
                    {action.label}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <PaymentsCard payments={payments} />

      <CancellationCard />

      {checkoutPlan && (
        <CheckoutDialog
          plan={checkoutPlan}
          oplexBank={oplexBank}
          onClose={() => setCheckoutPlan(null)}
          onReported={() => {
            setCheckoutPlan(null);
            setNotice('Recibimos tu aviso de transferencia. Te avisamos cuando la confirmemos.');
            refresh();
          }}
        />
      )}
      {planToSwitch && (
        <SwitchPlanDialog
          plan={planToSwitch}
          currentPlan={currentPlan}
          onClose={() => setPlanToSwitch(null)}
          onDone={() => {
            setNotice(`Listo, ahora estás en el Plan ${planToSwitch.name}.`);
            setPlanToSwitch(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function StatusCard({ billing, canManage, onPay }: { billing: BillingOverview; canManage: boolean; onPay: () => void }) {
  const { subscription, pendingPayment } = billing;
  const pill = pendingPayment
    ? { label: 'Esperando confirmación', className: STATUS_PILL['PAST_DUE'].className }
    : STATUS_PILL[subscription.status];
  const facts: [string, string][] = [['Plan', subscription.plan.name]];
  if (pendingPayment) {
    facts.push(['Transferencia avisada', `${formatDate(pendingPayment.createdAt)} · ${formatPesos(pendingPayment.total)}`]);
    facts.push(['Activa mientras la confirmamos', `hasta ${formatDate(subscription.currentPeriodEnd)}`]);
  } else if (subscription.status === 'TRIALING') {
    facts.push(['Vence la prueba', formatDate(subscription.trialEndsAt)]);
  } else if (subscription.status === 'ACTIVE') {
    facts.push(['Pago hasta', subscription.currentPeriodEnd ? formatDate(subscription.currentPeriodEnd) : 'Sin vencimiento']);
    if (subscription.paymentMethod) {
      facts.push(['Medio de pago', METHOD_LABEL[subscription.paymentMethod] ?? subscription.paymentMethod]);
    }
  } else if (subscription.status === 'PAST_DUE') {
    facts.push(['Venció', formatDate(subscription.currentPeriodEnd)]);
    facts.push(['Pasa a sólo lectura', formatDate(subscription.graceEndsAt)]);
  } else if (subscription.status === 'EXPIRED') {
    facts.push(['Estado', 'Podés ver tus datos pero no cargar nada nuevo']);
  }

  const paidPlan = Number(subscription.plan.priceMonthly) > 0;
  const needsPayment = !pendingPayment && subscription.status !== 'ACTIVE';
  const showPay = canManage && paidPlan && !pendingPayment && subscription.status !== 'CANCELLED';

  return (
    <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border p-5">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">Tu suscripción</h2>
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${pill.className}`}>{pill.label}</span>
        </div>
        <dl className="flex flex-wrap gap-x-8 gap-y-2">
          {facts.map(([label, value]) => (
            <div key={label} className="flex flex-col">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="text-sm font-medium tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
      {showPay && (
        <Button variant={needsPayment ? 'default' : 'outline'} onClick={onPay}>
          {needsPayment ? `Pagar Plan ${subscription.plan.name}` : 'Pagar por adelantado'}
        </Button>
      )}
    </section>
  );
}

function SwitchPlanDialog({
  plan,
  currentPlan,
  onClose,
  onDone,
}: {
  plan: Plan;
  currentPlan: Plan;
  onClose: () => void;
  onDone: () => void;
}) {
  const change = useMutation({ mutationFn: () => billingApi.changePlan(plan.key), onSuccess: onDone });
  const free = Number(plan.priceMonthly) === 0;
  const upgrading = Number(plan.priceMonthly) > Number(currentPlan.priceMonthly);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{free ? `Pasar a ${plan.name}` : `${upgrading ? 'Subir' : 'Bajar'} al Plan ${plan.name}`}</DialogTitle>
          <DialogDescription>
            {free
              ? `${plan.name} no tiene costo: ${plan.maxUsers} usuario${plan.maxUsers === 1 ? '' : 's'}, ${plan.maxClients} cliente${plan.maxClients === 1 ? '' : 's'} y ${plan.maxMonthlyInvoices} facturas por mes. Si hoy tenés más, primero vas a tener que desactivar los que sobran.`
              : upgrading
                ? 'Los topes nuevos aplican ya mismo. El precio nuevo corre desde tu próximo pago.'
                : 'El precio nuevo corre desde tu próximo pago. Si hoy tenés más usuarios o clientes que el tope nuevo, primero vas a tener que desactivar los que sobran.'}
          </DialogDescription>
        </DialogHeader>
        {change.isError && <p className="text-sm text-destructive">{errorMessage(change.error, 'No se pudo cambiar el plan')}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => change.mutate()} disabled={change.isPending}>
            {change.isPending ? 'Cambiando...' : 'Confirmar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PaymentsCard({ payments }: { payments: SubscriptionPayment[] }) {
  return (
    <section className="rounded-xl border p-5">
      <h2 className="text-sm font-semibold">Pagos</h2>
      {payments.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">Todavía no hay pagos. Cuando contrates un plan, acá vas a ver cada uno.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Fecha</th>
                <th className="py-2 pr-4 font-medium">Concepto</th>
                <th className="py-2 pr-4 font-medium">Medio</th>
                <th className="py-2 pr-4 text-right font-medium">Importe</th>
                <th className="py-2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="py-2 pr-4 tabular-nums">{formatDate(p.createdAt)}</td>
                  <td className="py-2 pr-4">
                    Plan {p.plan.name} · {monthsLabel(p.months)}
                    {p.status === 'PAID' && (
                      <span className="text-muted-foreground">
                        {' '}
                        ({formatDate(p.periodStart)} al {formatDate(p.periodEnd)})
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-4">{METHOD_LABEL[p.method]}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{formatPesos(p.total)}</td>
                  <td className={`py-2 font-medium ${PAYMENT_STATUS[p.status].className}`}>{PAYMENT_STATUS[p.status].label}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/**
 * Baja de la suscripción por el mismo medio de la contratación (Ley 24.240
 * art. 10 ter). Genera un número de trámite y avisa por email; la baja se
 * aplica al final del período ya pagado (Términos, cláusula 15).
 */
function CancellationCard() {
  const { data: profile } = useQuery({ queryKey: ['profile-me'], queryFn: profileApi.getMe });
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState('');
  const [receipt, setReceipt] = useState<LegalRequestReceipt | null>(null);
  const request = useMutation({ mutationFn: () => legalApi.cancellation(message || undefined), onSuccess: setReceipt });

  if (profile?.role !== 'OWNER' && profile?.role !== 'ADMIN') return null;

  return (
    <section className="max-w-2xl rounded-xl border p-5">
      <h2 className="text-sm font-semibold">Dar de baja la suscripción</h2>
      {receipt ? (
        <p className="mt-2 text-sm">
          Recibimos tu pedido de baja. Número de trámite: <b className="font-mono">{receipt.code}</b>. Te lo enviamos por
          email; la baja se aplica al final del período ya pagado.
        </p>
      ) : confirming ? (
        <div className="mt-3 flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm" htmlFor="cancel-msg">
            ¿Querés contarnos el motivo? (opcional)
            <Textarea id="cancel-msg" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} />
          </label>
          {request.isError && <p className="text-sm text-destructive">No pudimos registrar el pedido. Probá de nuevo.</p>}
          <div className="flex gap-2">
            <Button variant="destructive" onClick={() => request.mutate()} disabled={request.isPending}>
              {request.isPending ? 'Enviando...' : 'Confirmar la baja'}
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex flex-col gap-3 text-sm text-muted-foreground">
          <p>
            La baja se aplica al final del período ya pagado. Tus datos quedan disponibles 30 días para exportarlos. Si
            contrataste hace menos de 10 días como consumidor, también podés usar el{' '}
            <Link href="/arrepentimiento" className="underline">
              Botón de arrepentimiento
            </Link>
            .
          </p>
          <Button variant="outline" className="self-start" onClick={() => setConfirming(true)}>
            Pedir la baja
          </Button>
        </div>
      )}
    </section>
  );
}
