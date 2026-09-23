'use client';

import { companiesApi } from '@/lib/companies';
import { inventoryApi } from '@/lib/inventory';
import { invoicingApi } from '@/lib/invoicing';
import { profileApi } from '@/lib/profile';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

const DISMISSED_KEY = 'plexo-onboarding-dismissed';

interface Step {
  label: string;
  done: boolean;
  href: string;
}

export default function OnboardingChecklist() {
  const [dismissed, setDismissed] = useState(true);

  // Read localStorage after mount, not during render, so this matches
  // between server and client and doesn't trip a hydration warning.
  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISSED_KEY) === 'true');
  }, []);

  const { data: companies } = useQuery({
    queryKey: ['onboarding-companies'],
    queryFn: () => companiesApi.list(),
    staleTime: 60_000,
    enabled: !dismissed,
  });
  const { data: articles } = useQuery({
    queryKey: ['onboarding-articles'],
    queryFn: () => inventoryApi.listArticles(),
    staleTime: 60_000,
    enabled: !dismissed,
  });
  const { data: invoices } = useQuery({
    queryKey: ['onboarding-invoices'],
    queryFn: invoicingApi.listInvoices,
    staleTime: 60_000,
    enabled: !dismissed,
  });
  const { data: profile } = useQuery({
    queryKey: ['profile-me'],
    queryFn: profileApi.getMe,
    staleTime: 60_000,
    enabled: !dismissed,
  });

  const dataLoaded = Boolean(companies && articles && invoices && profile);
  const steps: Step[] =
    companies && articles && invoices && profile
      ? [
          {
            label: 'Agregá tu primera sucursal',
            done: companies.some((c) => c.roles.some((r) => r.role === 'BRANCH')),
            href: '/branches?openBranch=1',
          },
          { label: 'Cargá tu primer artículo', done: articles.length > 0, href: '/inventory' },
          { label: 'Emití tu primera factura', done: invoices.length > 0, href: '/invoicing' },
          { label: 'Completá tu perfil', done: Boolean(profile.name), href: '/profile' },
        ]
      : [];
  const allDone = dataLoaded && steps.every((s) => s.done);

  useEffect(() => {
    if (allDone) {
      localStorage.setItem(DISMISSED_KEY, 'true');
      setDismissed(true);
    }
  }, [allDone]);

  // Nothing to show yet (still loading), nothing left to do, or the user
  // already closed it - all three collapse to the same "render nothing".
  if (dismissed || !dataLoaded || allDone) {
    return null;
  }

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, 'true');
    setDismissed(true);
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium text-slate-600 dark:text-slate-400">Primeros pasos en OPLEX</h2>
        <button
          onClick={dismiss}
          aria-label="Descartar"
          className="text-slate-400 dark:text-slate-600 transition hover:text-slate-600 dark:hover:text-slate-400"
        >
          ✕
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {steps.map((step) => (
          <div
            key={step.label}
            className="flex flex-col gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3"
          >
            <div className="flex items-center gap-2">
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs ${
                  step.done
                    ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300'
                    : 'border border-slate-300 dark:border-slate-700 text-transparent'
                }`}
              >
                {step.done ? '✓' : '·'}
              </span>
              <span
                className={`text-sm ${
                  step.done
                    ? 'text-slate-500 dark:text-slate-500 line-through'
                    : 'text-slate-800 dark:text-slate-200'
                }`}
              >
                {step.label}
              </span>
            </div>
            {!step.done && (
              <Link
                href={step.href}
                className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300"
              >
                Comenzar →
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
