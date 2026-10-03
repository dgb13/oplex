'use client';

import {
  adminPlansApi,
  adminSubscriptionsApi,
  type AdminPlan,
  type SubscriptionPaymentRow,
  type SubscriptionStatusValue,
  type TenantSubscriptionRow,
} from '@/lib/admin';
import { resolveUploadUrl } from '@/lib/inventory';
import { computeSubscriptionCharge, formatPesos, SUBSCRIPTION_MONTH_OPTIONS } from '@/lib/subscriptions';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import Link from 'next/link';
import { useState } from 'react';
import AdminSelect from '../AdminSelect';

const STATUS: Record<SubscriptionStatusValue, { label: string; className: string }> = {
  TRIALING: { label: 'En prueba', className: 'bg-indigo-500/15 text-indigo-300' },
  ACTIVE: { label: 'Activo', className: 'bg-emerald-500/15 text-emerald-300' },
  PAST_DUE: { label: 'Cobro vencido', className: 'bg-amber-500/15 text-amber-300' },
  EXPIRED: { label: 'Sólo lectura', className: 'bg-red-500/15 text-red-300' },
  CANCELLED: { label: 'Dado de baja', className: 'bg-slate-500/15 text-slate-400' },
};

const METHOD_LABEL: Record<string, string> = {
  MP_DEBIT: 'Débito MP',
  TRANSFER: 'Transferencia',
  CASH: 'Efectivo',
  OTHER: 'Otro',
};

const PAYMENT_STATUS: Record<string, string> = {
  PENDING: 'Por confirmar',
  PAID: 'Pagado',
  REJECTED: 'Rechazado',
  REFUNDED: 'Devuelto',
};

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
}

function errorMessage(err: unknown, fallback: string): string {
  const message = (err as AxiosError<{ message?: string | string[] }> | undefined)?.response?.data?.message;
  if (!message) return fallback;
  return Array.isArray(message) ? message.join(', ') : message;
}

/** Hasta cuándo puede usar Oplex sin pagar de nuevo, según el estado. */
function coveredUntil(row: TenantSubscriptionRow): string {
  if (row.status === 'TRIALING') return formatDate(row.trialEndsAt);
  if (row.status === 'PAST_DUE') return `${formatDate(row.currentPeriodEnd)} (gracia hasta ${formatDate(row.graceEndsAt)})`;
  if (row.status === 'ACTIVE' && !row.currentPeriodEnd) return 'Sin vencimiento';
  return formatDate(row.currentPeriodEnd ?? row.trialEndsAt);
}

export default function AdminSubscriptionsPage() {
  const queryClient = useQueryClient();
  const { data: rows, isLoading } = useQuery({ queryKey: ['admin-subscriptions'], queryFn: adminSubscriptionsApi.list });
  const { data: plans } = useQuery({ queryKey: ['admin-plans'], queryFn: adminPlansApi.listAll });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const pending = (rows ?? []).filter((row) => row.pendingPayment);
  const selected = rows?.find((row) => row.tenantId === selectedId) ?? null;
  const paidPlans = (plans ?? []).filter((plan) => plan.isActive && Number(plan.priceMonthly) > 0);

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ['admin-subscriptions'] });
    void queryClient.invalidateQueries({ queryKey: ['admin-subscription-payments'] });
  }

  const review = useMutation({
    mutationFn: ({ row, action }: { row: TenantSubscriptionRow; action: 'confirm' | 'reject' }) =>
      action === 'confirm'
        ? adminSubscriptionsApi.confirm(row.tenantId, row.pendingPayment!.id)
        : adminSubscriptionsApi.reject(row.tenantId, row.pendingPayment!.id),
    onSuccess: refresh,
  });

  return (
    <div className="flex max-w-6xl flex-col gap-6">
      <h1 className="text-xl font-semibold text-white">Suscripciones</h1>

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900 p-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-200">Descuentos</h2>
          <p className="text-xs text-slate-500">
            Sobre el precio sin IVA. Débito automático mensual con Mercado Pago o pago anual por adelantado; no se suman.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {paidPlans.map((plan) => (
              <span key={plan.id} className="rounded-full bg-slate-800 px-2.5 py-1 text-xs text-slate-300">
                {plan.name} · débito <b className="text-slate-100">{Number(plan.debitDiscountPercent)}%</b> · anual{' '}
                <b className="text-slate-100">{Number(plan.annualDiscountPercent)}%</b>
              </span>
            ))}
          </div>
        </div>
        <Link href="/admin/plans" className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800">
          Editar en Planes
        </Link>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-slate-200">Transferencias por confirmar</h2>
        {pending.length === 0 ? (
          <p className="text-sm text-slate-500">No hay transferencias por confirmar.</p>
        ) : (
          pending.map((row) => {
            const payment = row.pendingPayment!;
            const receipt = resolveUploadUrl(payment.receiptUrl);
            return (
              <div key={row.tenantId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-slate-900 p-4">
                <div>
                  <p className="font-medium text-slate-100">{row.tenantName}</p>
                  <p className="text-xs text-slate-400">
                    Plan {payment.plan.name} · {payment.months} {payment.months === 1 ? 'mes' : 'meses'} · {formatPesos(payment.total)} IVA
                    incl.
                    {payment.reference ? ` · op. ${payment.reference}` : ''} · avisó el {formatDate(payment.createdAt)}
                  </p>
                </div>
                <div className="flex gap-2">
                  {receipt && (
                    <a href={receipt} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800">
                      Ver comprobante
                    </a>
                  )}
                  <button
                    type="button"
                    disabled={review.isPending}
                    onClick={() => review.mutate({ row, action: 'reject' })}
                    className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/10"
                  >
                    Rechazar
                  </button>
                  <button
                    type="button"
                    disabled={review.isPending}
                    onClick={() => review.mutate({ row, action: 'confirm' })}
                    className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
                  >
                    Confirmar pago
                  </button>
                </div>
              </div>
            );
          })
        )}
        {review.isError && <p className="text-xs text-red-400">{errorMessage(review.error, 'No se pudo revisar el pago')}</p>}
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="rounded-xl border border-slate-800 bg-slate-900">
          {isLoading ? (
            <p className="p-6 text-sm text-slate-500">Cargando...</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-left text-xs text-slate-500">
                    <th className="p-3">Tenant</th>
                    <th className="p-3">Plan</th>
                    <th className="p-3">Estado</th>
                    <th className="p-3">Cubierto hasta</th>
                    <th className="p-3">Cómo paga</th>
                  </tr>
                </thead>
                <tbody>
                  {(rows ?? []).map((row) => (
                    <tr
                      key={row.tenantId}
                      onClick={() => setSelectedId(row.tenantId)}
                      className={`cursor-pointer border-b border-slate-800/50 ${
                        row.tenantId === selectedId ? 'bg-indigo-500/10' : 'hover:bg-slate-800/30'
                      }`}
                    >
                      <td className="p-3 font-medium text-slate-200">{row.tenantName}</td>
                      <td className="p-3 text-slate-300">{row.planName}</td>
                      <td className="p-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS[row.status].className}`}>
                          {row.pendingPayment ? 'Transferencia por confirmar' : STATUS[row.status].label}
                        </span>
                      </td>
                      <td className="p-3 text-slate-300">{coveredUntil(row)}</td>
                      <td className="p-3 text-slate-400">{row.paymentMethod ? METHOD_LABEL[row.paymentMethod] : row.status === 'TRIALING' ? 'Prueba' : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {selected ? (
          <TenantPanel key={selected.tenantId} row={selected} plans={plans ?? []} onDone={refresh} />
        ) : (
          <div className="rounded-xl border border-dashed border-slate-800 p-6 text-sm text-slate-500">
            Elegí un tenant para registrar un pago, extender la prueba o cambiarle el plan.
          </div>
        )}
      </div>
    </div>
  );
}

function TenantPanel({ row, plans, onDone }: { row: TenantSubscriptionRow; plans: AdminPlan[]; onDone: () => void }) {
  const [tab, setTab] = useState<'pago' | 'prueba' | 'plan'>('pago');
  const [planKey, setPlanKey] = useState(Number(plans.find((p) => p.key === row.planKey)?.priceMonthly ?? 0) > 0 ? row.planKey : 'SILVER');
  const [months, setMonths] = useState(1);
  const [method, setMethod] = useState<'TRANSFER' | 'CASH' | 'OTHER'>('TRANSFER');
  const [reference, setReference] = useState('');
  const [days, setDays] = useState('15');
  const [newPlan, setNewPlan] = useState(row.planKey);
  const [done, setDone] = useState('');

  const { data: payments } = useQuery({
    queryKey: ['admin-subscription-payments', row.tenantId],
    queryFn: () => adminSubscriptionsApi.payments(row.tenantId),
  });

  const plan = plans.find((p) => p.key === planKey);
  const charge = plan ? computeSubscriptionCharge(plan, method, months) : null;

  const action = useMutation({
    mutationFn: async () => {
      if (tab === 'pago') {
        await adminSubscriptionsApi.recordPayment(row.tenantId, { planKey, months, method, reference: reference || undefined });
        return 'Pago registrado. El tenant quedó activo.';
      }
      if (tab === 'prueba') {
        await adminSubscriptionsApi.extendTrial(row.tenantId, Number(days));
        return `Prueba extendida ${days} días.`;
      }
      await adminSubscriptionsApi.changePlan(row.tenantId, newPlan);
      return 'Plan cambiado. Los topes nuevos ya aplican.';
    },
    onSuccess: (message) => {
      setDone(message);
      onDone();
    },
  });

  const inputClass = 'w-full rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-100';
  const paidPlanOptions = plans.filter((p) => p.isActive && Number(p.priceMonthly) > 0).map((p) => ({ value: p.key, label: p.name }));

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div>
        <h2 className="font-semibold text-slate-100">{row.tenantName}</h2>
        <p className="text-xs text-slate-500">
          Plan {row.planName} · {STATUS[row.status].label} · cubierto hasta {coveredUntil(row)}
        </p>
      </div>

      <div className="flex gap-1 border-b border-slate-800">
        {(
          [
            ['pago', 'Registrar pago'],
            ['prueba', 'Extender prueba'],
            ['plan', 'Cambiar plan'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setTab(key);
              setDone('');
            }}
            className={`-mb-px border-b-2 px-2.5 py-1.5 text-xs ${tab === key ? 'border-indigo-500 font-semibold text-slate-100' : 'border-transparent text-slate-500'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'pago' && (
        <div className="flex flex-col gap-3 text-xs text-slate-400">
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              Plan
              <AdminSelect value={planKey} onChange={setPlanKey} options={paidPlanOptions} />
            </label>
            <label className="flex flex-col gap-1">
              Meses
              <AdminSelect
                value={String(months)}
                onChange={(v) => setMonths(Number(v))}
                options={SUBSCRIPTION_MONTH_OPTIONS.map((m) => ({ value: String(m), label: m === 12 ? '12 (anual)' : String(m) }))}
              />
            </label>
            <label className="flex flex-col gap-1">
              Medio
              <AdminSelect
                value={method}
                onChange={(v) => setMethod(v as typeof method)}
                options={[
                  { value: 'TRANSFER', label: 'Transferencia' },
                  { value: 'CASH', label: 'Efectivo' },
                  { value: 'OTHER', label: 'Otro' },
                ]}
              />
            </label>
            <label className="flex flex-col gap-1" htmlFor="admin-sub-ref">
              Referencia
              <input id="admin-sub-ref" className={inputClass} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="N° de operación" />
            </label>
          </div>
          {charge && (
            <div className="rounded-lg bg-slate-800/60 p-3 text-slate-300">
              <div className="flex justify-between">
                <span>Plan sin IVA</span>
                <span>{formatPesos(charge.listPrice)}</span>
              </div>
              {charge.discountAmount > 0 && (
                <div className="flex justify-between text-emerald-300">
                  <span>Descuento {charge.discountPercent}%</span>
                  <span>-{formatPesos(charge.discountAmount)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>IVA 21%</span>
                <span>{formatPesos(charge.vatAmount)}</span>
              </div>
              <div className="mt-1 flex justify-between border-t border-slate-700 pt-1 font-semibold text-slate-100">
                <span>Total</span>
                <span>{formatPesos(charge.total)}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'prueba' && (
        <label className="flex flex-col gap-1 text-xs text-slate-400" htmlFor="admin-sub-days">
          Días extra
          <input id="admin-sub-days" type="number" min={1} max={90} className={inputClass} value={days} onChange={(e) => setDays(e.target.value)} />
        </label>
      )}

      {tab === 'plan' && (
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          Plan nuevo
          <AdminSelect
            value={newPlan}
            onChange={setNewPlan}
            options={plans.filter((p) => p.isActive).map((p) => ({ value: p.key, label: p.name }))}
          />
          <span className="text-slate-500">No cambia la fecha de pago: el precio nuevo corre desde el próximo cobro.</span>
        </label>
      )}

      {done ? (
        <p className="rounded-lg bg-emerald-500/10 p-2.5 text-xs text-emerald-300">{done}</p>
      ) : (
        <button
          type="button"
          disabled={action.isPending}
          onClick={() => action.mutate()}
          className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {tab === 'pago' ? 'Registrar pago y activar' : tab === 'prueba' ? 'Extender prueba' : 'Cambiar plan'}
        </button>
      )}
      {action.isError && <p className="text-xs text-red-400">{errorMessage(action.error, 'No se pudo hacer el cambio')}</p>}

      <PaymentsList payments={payments ?? []} />
    </div>
  );
}

function PaymentsList({ payments }: { payments: SubscriptionPaymentRow[] }) {
  if (payments.length === 0) return <p className="text-xs text-slate-500">Sin pagos registrados.</p>;
  return (
    <div className="flex flex-col gap-1.5 border-t border-slate-800 pt-3">
      <h3 className="text-xs font-semibold text-slate-400">Pagos</h3>
      {payments.map((p) => (
        <div key={p.id} className="flex justify-between gap-2 text-xs text-slate-400">
          <span>
            {formatDate(p.createdAt)} · {p.plan.name} · {p.months}m · {METHOD_LABEL[p.method]}
          </span>
          <span className="text-right text-slate-300">
            {formatPesos(p.total)} · {PAYMENT_STATUS[p.status]}
          </span>
        </div>
      ))}
    </div>
  );
}
