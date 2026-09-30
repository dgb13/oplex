'use client';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { legalApi, type LegalRequestReceipt } from '@/lib/legal';
import { profileApi } from '@/lib/profile';
import { plansApi, subscriptionsApi } from '@/lib/subscriptions';
import { useMutation, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';

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

      <CancellationCard />
    </div>
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
