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
      <h1 className="text-xl font-semibold">Planes y facturación</h1>

      {isLoading || !plans ? (
        <p className="text-sm text-muted-foreground">Cargando...</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {plans.map((plan) => {
            const isCurrent = currentSubscription?.planId === plan.id;
            return (
              <div
                key={plan.id}
                className={`flex flex-col gap-3 rounded-xl border p-5 ${
                  isCurrent ? 'border-primary bg-primary/5' : ''
                }`}
              >
                {isCurrent && (
                  <span className="self-start rounded bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">
                    Tu plan actual
                  </span>
                )}
                <h2 className="text-sm font-semibold">{plan.name}</h2>
                <p>
                  <span className="text-2xl font-bold">
                    {Number(plan.priceMonthly) === 0
                      ? 'Gratis'
                      : `$${Number(plan.priceMonthly).toLocaleString('es-AR')}`}
                  </span>
                  {Number(plan.priceMonthly) > 0 && (
                    <span className="text-xs font-normal text-muted-foreground"> / mes</span>
                  )}
                </p>
                <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
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
        <p className="text-xs text-muted-foreground">
          Tu prueba gratuita del Plan {currentSubscription.plan.name} vence el{' '}
          {new Date(currentSubscription.trialEndsAt).toLocaleDateString('es-AR')}.
        </p>
      )}
    </div>
  );
}
