'use client';

import { subscriptionsApi } from '@/lib/subscriptions';
import { useQuery } from '@tanstack/react-query';

/** Compartido por las 5 pantallas de /production - visitar la URL directo
 * (el link del sidebar ya está oculto, ver AppShell) es el único camino
 * que puede llegar a una de estas pantallas en un tenant sin el módulo
 * (BASIC); el backend ya rechaza cualquier escritura con 403
 * (SubscriptionService.assertCanUseProduction), esto es sólo la UX de "no
 * está en tu plan" en vez de un error crudo. Mismo queryKey que
 * AppShell/TrialBanner - React Query lo dedupe. */
export function useProductionGate() {
  const { data: subscription, isLoading } = useQuery({
    queryKey: ['subscription-me'],
    queryFn: subscriptionsApi.getCurrent,
  });
  return {
    enabled: subscription?.plan.productionModuleEnabled ?? false,
    isLoading,
    planName: subscription?.plan.name,
  };
}

export function ProductionPlanGateBanner({ planName }: { planName?: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/40 px-4 py-3 text-sm">
      <span className="text-muted-foreground">
        Tu plan actual{planName ? ` (${planName})` : ''} no incluye el módulo de Producción.
      </span>
      <a href="/settings/billing" className="whitespace-nowrap font-semibold text-primary hover:text-primary">
        Mejorar plan →
      </a>
    </div>
  );
}
