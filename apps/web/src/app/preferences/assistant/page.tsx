'use client';

import { Card, CardContent } from '@/components/ui/card';
import {
  assistantHistoryApi,
  type AssistantChannel,
  type AssistantHistoryEntry,
  type AssistantHistoryStatus,
} from '@/lib/assistant';
import { ROLE_LABELS, type TeamRole } from '@/lib/team';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import Link from 'next/link';
import { useState } from 'react';

type Filter = 'ALL' | AssistantChannel;

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'ALL', label: 'Todo' },
  { id: 'WHATSAPP', label: 'WhatsApp' },
  { id: 'WEB', label: 'Web' },
];

const STATUS: Record<AssistantHistoryStatus, { label: string; className: string }> = {
  ANSWERED_WITH_DATA: {
    label: 'Respondida',
    className: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  },
  HELP: {
    label: 'Ayuda de uso',
    className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  },
  ANSWERED_WITHOUT_DATA: {
    label: 'Sin datos para responder',
    className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  },
  NO_REPLY: {
    label: 'No respondió',
    className: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  },
};

const CHANNEL: Record<AssistantChannel, { label: string; className: string }> = {
  WHATSAPP: { label: 'WhatsApp', className: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' },
  WEB: { label: 'Web', className: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300' },
};

function formatTime(iso: string): string {
  const date = new Date(iso);
  const time = date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return time;
  if (date.toDateString() === yesterday.toDateString()) return `Ayer ${time}`;
  return `${date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })} ${time}`;
}

function errorMessage(err: unknown): string {
  const status = (err as AxiosError)?.response?.status;
  if (status === 403) return 'Sólo el Dueño o un Administrador pueden ver el historial del asistente.';
  return 'No se pudo cargar el historial. Probá de nuevo en un rato.';
}

/** Preferencias › Asistente (docs/planesdemodulos/plan-asistente-fase2-gestion-acciones.md).
 * Etapa 1: sólo el Historial. "Temas por rol" y "Acciones" del mockup llegan
 * en las etapas 2 y 3, junto con sus contadores y filtros. */
export default function AssistantPreferencesPage() {
  const [filter, setFilter] = useState<Filter>('ALL');
  const [openId, setOpenId] = useState<string | null>(null);

  const { data: stats } = useQuery({ queryKey: ['assistant-history-stats'], queryFn: assistantHistoryApi.stats });

  const history = useInfiniteQuery({
    queryKey: ['assistant-history', filter],
    queryFn: ({ pageParam }) =>
      assistantHistoryApi.list({ channel: filter === 'ALL' ? undefined : filter, before: pageParam ?? undefined }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
  const entries = history.data?.pages.flatMap((p) => p.entries) ?? [];

  return (
    <div className="flex max-w-[1180px] flex-col gap-6">
      <div>
        <p className="text-sm text-muted-foreground">
          <Link href="/preferences" className="hover:underline">
            Preferencias
          </Link>{' '}
          › Asistente
        </p>
        <h1 className="mt-1 text-xl font-semibold">Asistente de IA</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Qué le preguntó cada persona de la empresa al asistente y qué respondió, por la web y por WhatsApp.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Consultas hoy" value={stats?.questionsToday} />
        <StatCard label="Por WhatsApp hoy" value={stats?.whatsappToday} />
        <StatCard
          label="Sin datos para responder hoy"
          value={stats?.withoutDataToday}
          hint="Preguntas sobre datos que el asistente todavía no sabe consultar."
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={`min-h-[34px] rounded-full border px-3 py-1.5 text-sm transition ${
              filter === f.id
                ? 'border-foreground bg-foreground text-background'
                : 'border-border bg-background hover:bg-muted'
            }`}
          >
            {f.label}
          </button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">Se guarda 12 meses</span>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="hidden grid-cols-[84px_150px_96px_minmax(0,1.2fr)_minmax(0,1.5fr)_170px] gap-3 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid">
            <span>Hora</span>
            <span>Quién</span>
            <span>Canal</span>
            <span>Pedido</span>
            <span>Qué respondió</span>
            <span>Estado</span>
          </div>

          {history.isLoading ? (
            <p className="border-t px-4 py-6 text-sm text-muted-foreground">Cargando...</p>
          ) : history.isError ? (
            <p className="border-t px-4 py-6 text-sm text-destructive">{errorMessage(history.error)}</p>
          ) : entries.length === 0 ? (
            <p className="border-t px-4 py-6 text-sm text-muted-foreground">
              {filter === 'ALL' ? 'Todavía nadie le preguntó nada al asistente.' : 'No hay consultas por este canal.'}
            </p>
          ) : (
            entries.map((entry) => (
              <HistoryRow
                key={entry.id}
                entry={entry}
                open={openId === entry.id}
                onToggle={() => setOpenId(openId === entry.id ? null : entry.id)}
              />
            ))
          )}
        </CardContent>
      </Card>

      {history.hasNextPage && (
        <button
          type="button"
          onClick={() => void history.fetchNextPage()}
          disabled={history.isFetchingNextPage}
          className="self-center rounded-lg border px-4 py-2 text-sm hover:bg-muted disabled:opacity-50"
        >
          {history.isFetchingNextPage ? 'Cargando...' : 'Ver más'}
        </button>
      )}
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: number | undefined; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{value ?? '–'}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function HistoryRow({ entry, open, onToggle }: { entry: AssistantHistoryEntry; open: boolean; onToggle: () => void }) {
  const status = STATUS[entry.status];
  const channel = entry.channel ? CHANNEL[entry.channel] : null;
  const role = entry.user.role ? (ROLE_LABELS[entry.user.role as TeamRole] ?? entry.user.role) : null;
  const facts = [
    entry.tools.length > 0 ? `Consultó: ${entry.tools.join(', ')}` : null,
    entry.status === 'ANSWERED_WITHOUT_DATA' ? 'No usó datos del sistema: probablemente no tiene cómo consultar eso todavía.' : null,
    entry.status === 'NO_REPLY' ? 'No hay respuesta guardada: falló el asistente o se cortó la conexión.' : null,
    entry.feedback === 'UP' ? 'La marcaron como útil' : null,
    entry.feedback === 'DOWN' ? 'La marcaron como no útil' : null,
    entry.channel ? null : 'Consulta de antes de que se guardara el canal.',
  ].filter((f): f is string => f !== null);

  return (
    <div className="border-t">
      <div className="grid grid-cols-1 gap-2 px-4 py-3 md:grid-cols-[84px_150px_96px_minmax(0,1.2fr)_minmax(0,1.5fr)_170px] md:items-center md:gap-3">
        <span className="text-sm tabular-nums text-muted-foreground">{formatTime(entry.createdAt)}</span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{entry.user.name}</p>
          {role && <p className="text-xs text-muted-foreground">{role}</p>}
        </div>
        <div>
          {channel ? (
            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${channel.className}`}>
              {channel.label}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </div>
        <p className="line-clamp-2 text-sm">“{entry.question}”</p>
        <p className="line-clamp-2 text-sm text-muted-foreground">{entry.answer ?? '—'}</p>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${status.className}`}>
            {status.label}
          </span>
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            className="text-xs text-primary hover:underline"
          >
            {open ? 'Ocultar' : 'Ver detalle'}
          </button>
        </div>
      </div>

      {open && (
        <div className="grid grid-cols-1 gap-4 bg-muted/40 px-4 py-4 md:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Conversación</p>
            <div className="flex flex-col gap-2 text-sm">
              <p>
                <span className="font-medium">{entry.user.name}:</span> {entry.question}
              </p>
              <p className="whitespace-pre-line">
                <span className="font-medium">Asistente:</span> {entry.answer ?? '(sin respuesta)'}
              </p>
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Detalle</p>
            {facts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Respondió sin consultar datos.</p>
            ) : (
              <ul className="flex list-disc flex-col gap-1 pl-4 text-sm">
                {facts.map((fact) => (
                  <li key={fact}>{fact}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
