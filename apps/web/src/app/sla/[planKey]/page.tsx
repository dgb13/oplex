'use client';

import { plansApi } from '@/lib/subscriptions';
import { useQuery } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';

// Público, sin login (ver PlansController.getSla / SubscriptionService.getPlanSla)
// - contenido editable desde /admin/plans, campo "SLA".
export default function PublicPlanSlaPage() {
  const { planKey } = useParams<{ planKey: string }>();
  const { data, isLoading, error } = useQuery({
    queryKey: ['plan-sla', planKey],
    queryFn: () => plansApi.getSla(planKey),
    retry: false,
  });

  const notFound = (error as AxiosError)?.response?.status === 404;

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="mx-auto max-w-3xl px-6 py-16">
        {isLoading && <p className="text-sm text-slate-500">Cargando...</p>}

        {notFound && (
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-8 text-center">
            <p className="text-slate-300">No encontramos un SLA publicado para este plan.</p>
          </div>
        )}

        {data && !data.slaMarkdown && (
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-8 text-center">
            <p className="text-slate-300">
              El Acuerdo de Nivel de Servicio de <span className="font-semibold text-slate-100">{data.name}</span>{' '}
              todavía no está publicado.
            </p>
          </div>
        )}

        {data?.slaMarkdown && (
          <article>
            <div className="mb-8 border-b border-slate-800 pb-6">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-indigo-400">
                Oplex · plan {data.name}
              </div>
              {data.slaUpdatedAt && (
                <div className="text-xs text-slate-500">
                  Última actualización:{' '}
                  {new Date(data.slaUpdatedAt).toLocaleDateString('es-AR', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                    timeZone: 'UTC',
                  })}
                </div>
              )}
            </div>
            <div
              className="text-slate-200
                [&_h1]:mb-4 [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:text-slate-50
                [&_h2]:mb-3 [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-slate-50
                [&_h3]:mb-2 [&_h3]:mt-6 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-slate-100
                [&_p]:mb-4 [&_p]:leading-relaxed
                [&_ul]:mb-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:mb-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:mb-1.5
                [&_strong]:font-semibold [&_strong]:text-slate-50
                [&_a]:text-indigo-400 [&_a]:underline
                [&_hr]:my-8 [&_hr]:border-slate-800"
            >
              <ReactMarkdown>{data.slaMarkdown}</ReactMarkdown>
            </div>
          </article>
        )}
      </div>
    </div>
  );
}
