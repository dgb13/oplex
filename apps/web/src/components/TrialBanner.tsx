'use client';

import { subscriptionsApi } from '@/lib/subscriptions';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';

function daysRemaining(trialEndsAt: string): number {
  const ms = new Date(trialEndsAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
}

/** Persistente en toda la app (ver AppShell): prueba en curso, pago vencido
 * (todavía funciona, con fecha de pase a sólo lectura) o cuenta en sólo
 * lectura. ACTIVE no muestra nada. */
export default function TrialBanner() {
  const { data: subscription, isError } = useQuery({
    queryKey: ['subscription-me'],
    queryFn: subscriptionsApi.getCurrent,
  });

  // isError explicitly checked (not just "!subscription"): react-query
  // keeps the last successful `data` around on a failed refetch (e.g. this
  // route 403s while mustChangePassword is still true, or any other
  // tenant's account was open in this same tab moments ago) - without this
  // check, a failed fetch would keep showing whatever the previous
  // successful one returned instead of hiding the banner.
  if (!subscription || isError) return null;

  if (subscription.status === 'TRIALING' && subscription.trialEndsAt) {
    const days = daysRemaining(subscription.trialEndsAt);
    return (
      <Banner tone="info" link="Ver planes">
        Te quedan {days} día{days === 1 ? '' : 's'} de tu prueba gratuita del Plan {subscription.plan.name}.
      </Banner>
    );
  }
  if (subscription.status === 'PAST_DUE') {
    return (
      <Banner tone="warn" link="Pagar">
        Tu plan venció{subscription.currentPeriodEnd ? ` el ${formatDate(subscription.currentPeriodEnd)}` : ''}.
        {subscription.graceEndsAt ? ` El ${formatDate(subscription.graceEndsAt)} la cuenta pasa a sólo lectura.` : ''}
      </Banner>
    );
  }
  if (subscription.status === 'EXPIRED') {
    return (
      <Banner tone="bad" link="Elegir plan">
        Tu cuenta está en sólo lectura: podés ver tus datos pero no cargar nada nuevo.
      </Banner>
    );
  }
  return null;
}

const TONES = { info: 'bg-indigo-600 text-white', warn: 'bg-amber-500 text-amber-950', bad: 'bg-red-600 text-white' } as const;

function Banner({ tone, link, children }: { tone: keyof typeof TONES; link: string; children: React.ReactNode }) {
  return (
    <div className={`flex items-center justify-center gap-2 px-4 py-1.5 text-center text-xs font-medium ${TONES[tone]}`}>
      <span>{children}</span>
      <Link href="/settings/billing" className="underline hover:no-underline">
        {link}
      </Link>
    </div>
  );
}
