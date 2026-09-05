'use client';

import { plansApi, subscriptionsApi } from '@/lib/subscriptions';
import { useQuery } from '@tanstack/react-query';

export default function BillingPage() {
  const { data: plans, isLoading: plansLoading } = useQuery({
    queryKey: ['plans'],
    queryFn: plansApi.list,
  });
  const {
    data: subscription,
    isLoading: subscriptionLoading,
    isError: subscriptionError,
  } = useQuery({
    queryKey: ['subscription-me'],
    queryFn: subscriptionsApi.getCurrent,
  });

  const isLoading = plansLoading || subscriptionLoading;
  // Ignora los datos de subscription si la consulta falló (ver TrialBanner
  // para el mismo motivo) - nunca marcar el plan equivocado como "actual".
  const currentSubscription = subscriptionError ? undefined : subscription;

  return (
    <div className="flex max-w-6xl flex-col gap-6">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Planes y facturación</h1>

      {isLoading || !plans ? (
        <div className="text-slate-500">Cargando...</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {plans.map((plan) => {
            const isCurrent = currentSubscription?.planId === plan.id;
            return (
              <div
                key={plan.id}
                className={`flex flex-col gap-3 rounded-xl border p-5 ${
                  isCurrent
                    ? 'border-indigo-500 bg-indigo-50 dark:border-indigo-500 dark:bg-indigo-950/40'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900'
                }`}
              >
                {isCurrent && (
                  <span className="self-start rounded bg-indigo-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                    Tu plan actual
                  </span>
                )}
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{plan.name}</h2>
                <p className="text-slate-900 dark:text-slate-100">
                  <span className="text-2xl font-bold">
                    {Number(plan.priceMonthly) === 0
                      ? 'Gratis'
                      : `$${Number(plan.priceMonthly).toLocaleString('es-AR')}`}
                  </span>
                  {Number(plan.priceMonthly) > 0 && (
                    <span className="text-xs font-normal text-slate-500"> / mes</span>
                  )}
                </p>
                <ul className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-400">
                  <li>{plan.maxUsers} usuario{plan.maxUsers === 1 ? '' : 's'}</li>
                  <li>{plan.maxClients} clientes</li>
                  <li>{plan.maxMonthlyInvoices.toLocaleString('es-AR')} facturas/mes</li>
                  <li>
                    {plan.aiInvoiceScanMonthlyQuota != null
                      ? `${plan.aiInvoiceScanMonthlyQuota.toLocaleString('es-AR')} comprobantes IA/mes`
                      : 'Sin carga de comprobantes con IA'}
                  </li>
                </ul>
              </div>
            );
          })}
        </div>
      )}

      {currentSubscription?.status === 'TRIALING' && currentSubscription.trialEndsAt && (
        <p className="text-xs text-slate-500">
          Tu prueba gratuita del Plan {currentSubscription.plan.name} vence el{' '}
          {new Date(currentSubscription.trialEndsAt).toLocaleDateString('es-AR')}.
        </p>
      )}
    </div>
  );
}
