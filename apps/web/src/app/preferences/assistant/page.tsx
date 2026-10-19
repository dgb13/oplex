'use client';

import { Card, CardContent } from '@/components/ui/card';
import {
  assistantActionsApi,
  assistantConfigApi,
  assistantHistoryApi,
  type AssistantActionLevel,
  type AssistantActionStatus,
  type AssistantChannel,
  type AssistantConfig,
  type AssistantConfigAction,
  type AssistantConfigTopic,
  type AssistantHistoryEntry,
  type AssistantHistoryStatus,
  type UpdateAssistantConfig,
} from '@/lib/assistant';
import { ROLE_LABELS, type TeamRole } from '@/lib/team';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import Link from 'next/link';
import { useState } from 'react';

type Tab = 'history' | 'topics' | 'actions';
type Filter = 'ALL' | AssistantChannel | 'ACTIONS' | 'BLOCKED';

const TABS: { id: Tab; label: string }[] = [
  { id: 'history', label: 'Historial' },
  { id: 'topics', label: 'Temas por rol' },
  { id: 'actions', label: 'Acciones' },
];

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'ALL', label: 'Todo' },
  { id: 'WHATSAPP', label: 'WhatsApp' },
  { id: 'WEB', label: 'Web' },
  { id: 'ACTIONS', label: 'Sólo acciones' },
  { id: 'BLOCKED', label: 'Bloqueadas' },
];

const ACTION_STATUS: Record<AssistantActionStatus, { label: string; className: string }> = {
  PENDING_CONFIRMATION: {
    label: 'Esperando “SÍ”',
    className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  },
  DONE: { label: 'Hecho', className: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' },
  EXPIRED: { label: 'Venció sin “SÍ”', className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  CANCELLED: { label: 'Cancelada', className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  UNDONE: {
    label: 'Deshecha',
    className: 'bg-slate-100 text-slate-700 line-through dark:bg-slate-800 dark:text-slate-300',
  },
  FAILED: { label: 'No se pudo hacer', className: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
};

const LEVELS: { id: AssistantActionLevel; label: string }[] = [
  { id: 'OFF', label: 'Apagada' },
  { id: 'DRAFT', label: 'Borrador' },
  { id: 'DIRECT', label: 'Directa' },
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
  BLOCKED: {
    label: 'Bloqueada',
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

function errorMessage(err: unknown, what: string): string {
  const status = (err as AxiosError)?.response?.status;
  if (status === 403) return `Sólo el Dueño o un Administrador pueden ver ${what}.`;
  return `No se pudo cargar ${what}. Probá de nuevo en un rato.`;
}

/** Preferencias › Asistente (docs/planesdemodulos/plan-asistente-fase2-gestion-acciones.md).
 * Etapa 1: Historial. Etapa 2: Temas por rol + canales. Etapa 3: Acciones. */
export default function AssistantPreferencesPage() {
  const [tab, setTab] = useState<Tab>('history');

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
          Qué hizo el asistente, de qué temas puede hablar con cada rol y qué acciones puede hacer, por la web y por
          WhatsApp.
        </p>
      </div>

      <div role="tablist" className="flex gap-1 border-b">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px min-h-[44px] border-b-2 px-3.5 py-2.5 text-sm transition ${
              tab === t.id
                ? 'border-primary font-semibold text-foreground'
                : 'border-transparent font-medium text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'history' ? <HistoryTab /> : tab === 'topics' ? <TopicsTab /> : <ActionsTab />}
    </div>
  );
}

function HistoryTab() {
  const [filter, setFilter] = useState<Filter>('ALL');
  const [openId, setOpenId] = useState<string | null>(null);

  const { data: stats } = useQuery({ queryKey: ['assistant-history-stats'], queryFn: assistantHistoryApi.stats });

  const history = useInfiniteQuery({
    queryKey: ['assistant-history', filter],
    queryFn: ({ pageParam }) =>
      assistantHistoryApi.list({
        channel: filter === 'WEB' || filter === 'WHATSAPP' ? filter : undefined,
        blocked: filter === 'BLOCKED' ? true : undefined,
        actions: filter === 'ACTIONS' ? true : undefined,
        before: pageParam ?? undefined,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
  const entries = history.data?.pages.flatMap((p) => p.entries) ?? [];

  const queryClient = useQueryClient();
  const [undoError, setUndoError] = useState('');
  const undoMutation = useMutation({
    mutationFn: (actionId: string) => assistantActionsApi.undo(actionId),
    onSuccess: () => {
      setUndoError('');
      void queryClient.invalidateQueries({ queryKey: ['assistant-history'] });
      void queryClient.invalidateQueries({ queryKey: ['assistant-history-stats'] });
    },
    onError: (err) => {
      const message = (err as AxiosError<{ message?: string }>).response?.data?.message;
      setUndoError(typeof message === 'string' ? message : 'No se pudo deshacer. Probá de nuevo.');
    },
  });

  const emptyMessage =
    filter === 'ALL'
      ? 'Todavía nadie le preguntó nada al asistente.'
      : filter === 'BLOCKED'
        ? 'No hubo consultas bloqueadas por permisos.'
        : filter === 'ACTIONS'
          ? 'El asistente todavía no propuso ninguna acción.'
          : 'No hay consultas por este canal.';

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Consultas hoy" value={stats?.questionsToday} hint={stats ? `${stats.whatsappToday} por WhatsApp` : undefined} />
        <StatCard label="Acciones hechas hoy" value={stats?.actionsDoneToday} />
        <StatCard label="Esperando “SÍ”" value={stats?.actionsPendingNow} hint="Propuestas que todavía nadie confirmó." />
        <StatCard
          label="Bloqueadas por permisos hoy"
          value={stats?.blockedToday}
          hint="Se cambia en Temas por rol."
        />
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
            <span>Qué hizo el asistente</span>
            <span>Estado</span>
          </div>

          {undoError && <p className="border-t px-4 py-3 text-sm text-destructive">{undoError}</p>}
          {history.isLoading ? (
            <p className="border-t px-4 py-6 text-sm text-muted-foreground">Cargando...</p>
          ) : history.isError ? (
            <p className="border-t px-4 py-6 text-sm text-destructive">{errorMessage(history.error, 'el historial del asistente')}</p>
          ) : entries.length === 0 ? (
            <p className="border-t px-4 py-6 text-sm text-muted-foreground">{emptyMessage}</p>
          ) : (
            entries.map((entry) => (
              <HistoryRow
                key={entry.id}
                entry={entry}
                open={openId === entry.id}
                onToggle={() => setOpenId(openId === entry.id ? null : entry.id)}
                onUndo={(actionId) => undoMutation.mutate(actionId)}
                undoing={undoMutation.isPending && undoMutation.variables === entry.action?.id}
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
    </>
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

function HistoryRow({
  entry,
  open,
  onToggle,
  onUndo,
  undoing,
}: {
  entry: AssistantHistoryEntry;
  open: boolean;
  onToggle: () => void;
  onUndo: (actionId: string) => void;
  undoing: boolean;
}) {
  const action = entry.action;
  // Con acción, el estado que importa es el de la acción (esperando, hecha...).
  const status = action ? ACTION_STATUS[action.status] : STATUS[entry.status];
  const channel = entry.channel ? CHANNEL[entry.channel] : null;
  const role = entry.user.role ? (ROLE_LABELS[entry.user.role as TeamRole] ?? entry.user.role) : null;
  const facts = [
    action ? `Acción: ${action.label} (${action.level === 'DIRECT' ? 'Directa' : 'Borrador'})` : null,
    action?.status === 'DONE' && !action.undoable ? 'Ya no se puede deshacer desde acá.' : null,
    action?.errorMessage ? `Motivo: ${action.errorMessage}` : null,
    entry.status === 'BLOCKED'
      ? `No respondió: el rol ${role ?? ''} no tiene "${entry.blockedTopic ?? 'ese tema'}". Se cambia en Temas por rol.`
      : null,
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
        {action ? (
          <div className="min-w-0 text-sm">
            <span className="mr-1 inline-flex rounded-md bg-indigo-100 px-1.5 py-0.5 text-xs font-medium text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300">
              Acción · {action.level === 'DIRECT' ? 'Directa' : 'Borrador'}
            </span>
            <span className="line-clamp-2">{action.summary}</span>
          </div>
        ) : (
          <p className="line-clamp-2 text-sm text-muted-foreground">{entry.answer ?? '—'}</p>
        )}
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
          {action?.undoable && (
            <button
              type="button"
              onClick={() => onUndo(action.id)}
              disabled={undoing}
              className="rounded-md border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
            >
              {undoing ? 'Deshaciendo…' : 'Deshacer'}
            </button>
          )}
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

function CheckIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.5}>
      <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: () => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-50 ${
        checked ? 'bg-primary' : 'bg-slate-300 dark:bg-slate-700'
      }`}
    >
      <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  );
}

function TopicsTab() {
  const queryClient = useQueryClient();
  const { data: config, isLoading, isError, error } = useQuery({ queryKey: ['assistant-config'], queryFn: assistantConfigApi.get });
  const [saveError, setSaveError] = useState('');

  const mutation = useMutation({
    mutationFn: (patch: UpdateAssistantConfig) => assistantConfigApi.update(patch),
    onSuccess: (updated) => {
      setSaveError('');
      queryClient.setQueryData(['assistant-config'], updated);
      // El widget se oculta/muestra según webEnabled.
      void queryClient.invalidateQueries({ queryKey: ['assistant-settings'] });
    },
    onError: () => setSaveError('No se pudo guardar el cambio. Probá de nuevo.'),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Cargando...</p>;
  if (isError || !config) return <p className="text-sm text-destructive">{errorMessage(error, 'los permisos del asistente')}</p>;

  function toggleCell(topic: AssistantConfigTopic, role: AssistantConfig['roles'][number]) {
    const enabled = topic.cells.filter((c) => c.enabled).map((c) => c.role);
    const next = enabled.includes(role) ? enabled.filter((r) => r !== role) : [...enabled, role];
    mutation.mutate({ topicsByRole: { [topic.id]: next } });
  }

  const channels: { key: 'webEnabled' | 'whatsappEnabled'; label: string; hint: string }[] = [
    { key: 'webEnabled', label: 'Asistente en la web', hint: 'El botón del asistente dentro de Oplex.' },
    { key: 'whatsappEnabled', label: 'Asistente por WhatsApp', hint: 'Sólo contesta a teléfonos vinculados desde Perfil.' },
  ];

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div>
            <h2 className="text-base font-semibold">De qué puede hablar con cada rol</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Se controla en el servidor: si un rol no tiene el tema, el asistente ni siquiera puede consultarlo y contesta
              “no tenés permiso”. Nunca puede ver más de lo que ese rol ya ve en Oplex.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="py-2 pr-3 text-left">
                    Tema
                  </th>
                  <th scope="col" className="px-1 py-2 text-center">
                    Dueño / Admin
                  </th>
                  {config.roles.map((role) => (
                    <th key={role} scope="col" className="px-1 py-2 text-center">
                      {ROLE_LABELS[role]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {config.topics.map((topic) => (
                  <tr key={topic.id} className="border-t">
                    <th scope="row" className="py-2 pr-3 text-left font-normal">
                      <span className="block text-sm font-medium">{topic.label}</span>
                      <span className="block text-xs text-muted-foreground">{topic.hint}</span>
                    </th>
                    <td className="px-1 py-2 text-center">
                      <span
                        aria-label={`${topic.label} para Dueño y Admin: siempre permitido`}
                        title="El Dueño y los administradores siempre pueden consultar todo."
                        className="inline-flex h-11 w-11 items-center justify-center rounded-[10px] bg-primary text-primary-foreground opacity-60"
                      >
                        <CheckIcon />
                      </span>
                    </td>
                    {topic.cells.map((cell) => {
                      const roleName = ROLE_LABELS[cell.role];
                      if (!cell.capable) {
                        return (
                          <td key={cell.role} className="px-1 py-2 text-center">
                            <span
                              role="img"
                              aria-label={`${topic.label} para ${roleName}: no disponible. ${cell.reason ?? ''}`}
                              title={cell.reason ?? undefined}
                              className="inline-flex h-11 w-11 items-center justify-center rounded-[10px] border border-dashed border-slate-300 bg-muted text-muted-foreground dark:border-slate-700"
                            >
                              —
                            </span>
                          </td>
                        );
                      }
                      return (
                        <td key={cell.role} className="px-1 py-2 text-center">
                          <button
                            type="button"
                            aria-pressed={cell.enabled}
                            aria-label={`${topic.label} para ${roleName}: ${cell.enabled ? 'permitido' : 'no permitido'}`}
                            disabled={mutation.isPending}
                            onClick={() => toggleCell(topic, cell.role)}
                            className={`inline-flex h-11 w-11 items-center justify-center rounded-[10px] border transition disabled:cursor-wait ${
                              cell.enabled
                                ? 'border-primary bg-primary text-primary-foreground'
                                : 'border-slate-300 bg-background text-primary hover:bg-muted dark:border-slate-700'
                            }`}
                          >
                            {cell.enabled && <CheckIcon />}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            “—”: ese rol no tiene acceso a ese módulo en Oplex, así que el asistente tampoco. Pasá el mouse para ver el motivo.
          </p>

          <div className="flex items-start justify-between gap-4 border-t pt-4">
            <div>
              <p className="text-sm font-medium">Ventas ve sólo sus propias ventas y clientes</p>
              <p className="text-xs text-muted-foreground">
                Ventas y deudas sólo de las facturas que emitió esa persona. Si está apagado, un vendedor puede preguntar por las
                de toda la empresa.
              </p>
            </div>
            <Switch
              checked={config.salesOwnDataOnly}
              label="Ventas ve sólo sus propias ventas y clientes"
              disabled={mutation.isPending}
              onChange={() => mutation.mutate({ salesOwnDataOnly: !config.salesOwnDataOnly })}
            />
          </div>
          {saveError && <p className="text-sm text-destructive">{saveError}</p>}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-6">
        <Card>
          <CardContent className="flex flex-col gap-4">
            <h2 className="text-base font-semibold">Canales</h2>
            {channels.map((ch) => (
              <div key={ch.key} className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">{ch.label}</p>
                  <p className="text-xs text-muted-foreground">{ch.hint}</p>
                </div>
                <Switch
                  checked={config[ch.key]}
                  label={ch.label}
                  disabled={mutation.isPending}
                  onChange={() => mutation.mutate({ [ch.key]: !config[ch.key] })}
                />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-2">
            <h2 className="text-base font-semibold">Siempre, sin importar el rol</h2>
            <ul className="flex list-disc flex-col gap-1 pl-4 text-sm text-muted-foreground">
              <li>Sólo ve datos de esta empresa.</li>
              <li>Todo número sale del sistema; si no hay dato, lo dice.</li>
              <li>Por WhatsApp sólo contesta a teléfonos vinculados a un usuario.</li>
              <li>Nunca ve más de lo que el rol de esa persona ve en Oplex.</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ActionsTab() {
  const queryClient = useQueryClient();
  const { data: config, isLoading, isError, error } = useQuery({ queryKey: ['assistant-config'], queryFn: assistantConfigApi.get });
  const [saveError, setSaveError] = useState('');
  const [maxPerDay, setMaxPerDay] = useState<string | null>(null);
  const [expiry, setExpiry] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (patch: UpdateAssistantConfig) => assistantConfigApi.update(patch),
    onSuccess: (updated) => {
      setSaveError('');
      setMaxPerDay(null);
      setExpiry(null);
      queryClient.setQueryData(['assistant-config'], updated);
    },
    onError: () => setSaveError('No se pudo guardar el cambio. Probá de nuevo.'),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Cargando...</p>;
  if (isError || !config) return <p className="text-sm text-destructive">{errorMessage(error, 'las acciones del asistente')}</p>;

  function toggleRole(action: AssistantConfigAction, role: AssistantConfig['roles'][number]) {
    const enabled = action.roles.filter((c) => c.enabled).map((c) => c.role);
    const next = enabled.includes(role) ? enabled.filter((r) => r !== role) : [...enabled, role];
    mutation.mutate({ actionRoles: { [action.id]: next } });
  }

  function saveNumber(field: 'maxActionsPerDay' | 'confirmExpiryMinutes', raw: string | null, current: number) {
    const value = Number(raw);
    if (raw === null || !Number.isInteger(value) || value < 1 || value === current) return;
    mutation.mutate({ [field]: value });
  }

  const reminder = config.actions.find((a) => a.id === 'recordatorio');

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <Card>
        <CardContent className="flex flex-col gap-1">
          <h2 className="text-base font-semibold">Qué puede hacer</h2>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Borrador</span>: lo arma y pide “SÍ” antes de que quede firme.{' '}
            <span className="font-medium text-foreground">Directa</span>: lo hace solo, sólo para cosas internas que se
            pueden deshacer desde el Historial.
          </p>

          {config.actions.map((action) => (
            <div key={action.id} className="flex flex-col gap-3 border-t py-4 first-of-type:mt-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{action.label}</p>
                  <p className="text-xs text-muted-foreground">{action.hint}</p>
                  {action.rule && <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-400">{action.rule}</p>}
                </div>
                <div role="radiogroup" aria-label={`Nivel de ${action.label}`} className="inline-flex overflow-hidden rounded-lg border">
                  {LEVELS.map((lv) => {
                    const allowed = action.allowedLevels.includes(lv.id);
                    const selected = action.level === lv.id;
                    return (
                      <button
                        key={lv.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        disabled={!allowed || mutation.isPending}
                        title={allowed ? undefined : 'No disponible para esta acción'}
                        onClick={() => mutation.mutate({ actionLevels: { [action.id]: lv.id } })}
                        className={`min-h-[36px] px-3.5 text-sm transition disabled:cursor-not-allowed ${
                          selected
                            ? lv.id === 'OFF'
                              ? 'bg-slate-700 font-semibold text-white'
                              : 'bg-primary font-semibold text-primary-foreground'
                            : allowed
                              ? 'bg-background hover:bg-muted'
                              : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {lv.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-xs text-muted-foreground">Pueden pedirla:</span>
                <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-xs text-indigo-800 dark:border-indigo-900 dark:bg-indigo-950 dark:text-indigo-300">
                  Dueño / Admin
                </span>
                {action.roles.map((cell) => {
                  const on = cell.enabled && action.level !== 'OFF';
                  return (
                    <button
                      key={cell.role}
                      type="button"
                      aria-pressed={cell.enabled}
                      disabled={!cell.capable || action.level === 'OFF' || mutation.isPending}
                      title={cell.reason ?? undefined}
                      onClick={() => toggleRole(action, cell.role)}
                      className={`min-h-[28px] rounded-full px-2.5 py-0.5 text-xs transition disabled:cursor-not-allowed ${
                        on
                          ? 'border border-indigo-200 bg-indigo-50 text-indigo-800 dark:border-indigo-900 dark:bg-indigo-950 dark:text-indigo-300'
                          : 'border border-dashed border-slate-300 bg-background text-muted-foreground dark:border-slate-700'
                      } ${cell.capable ? '' : 'opacity-50'}`}
                    >
                      {ROLE_LABELS[cell.role]}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {saveError && <p className="text-sm text-destructive">{saveError}</p>}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-6">
        <Card>
          <CardContent className="flex flex-col gap-4">
            <h2 className="text-base font-semibold">Topes</h2>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>
                <span className="block font-medium">Acciones por día</span>
                <span className="block text-xs text-muted-foreground">De toda la empresa. Al llegar, avisa y pide hacerlo a mano.</span>
              </span>
              <input
                type="number"
                min={1}
                max={1000}
                value={maxPerDay ?? String(config.limits.maxActionsPerDay)}
                onChange={(e) => setMaxPerDay(e.target.value)}
                onBlur={() => saveNumber('maxActionsPerDay', maxPerDay, config.limits.maxActionsPerDay)}
                className="w-24 rounded-lg border bg-background px-2.5 py-2 text-right tabular-nums"
              />
            </label>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>
                <span className="block font-medium">El “SÍ” vence a los (minutos)</span>
                <span className="block text-xs text-muted-foreground">Después queda sin hacer.</span>
              </span>
              <input
                type="number"
                min={1}
                max={120}
                value={expiry ?? String(config.limits.confirmExpiryMinutes)}
                onChange={(e) => setExpiry(e.target.value)}
                onBlur={() => saveNumber('confirmExpiryMinutes', expiry, config.limits.confirmExpiryMinutes)}
                className="w-24 rounded-lg border bg-background px-2.5 py-2 text-right tabular-nums"
              />
            </label>
          </CardContent>
        </Card>

        {reminder && <WhatsAppPreview level={reminder.level} minutes={config.limits.confirmExpiryMinutes} />}
      </div>
    </div>
  );
}

/** Ejemplo de cómo responde por WhatsApp según el nivel de "Agendar
 * recordatorio" - texto ilustrativo, no una conversación real. */
function WhatsAppPreview({ level, minutes }: { level: AssistantActionLevel; minutes: number }) {
  const ask = 'Recordame llamar a Pérez el jueves a las 10';
  const replies =
    level === 'OFF'
      ? ['Todavía no puedo agendar recordatorios. Lo puede habilitar el Dueño o un administrador en Preferencias › Asistente.']
      : level === 'DRAFT'
        ? [`Te agendo “Llamar a Pérez” el jueves a las 10:00. Respondé SÍ para confirmar o NO para cancelar (vence en ${minutes} min).`, 'SÍ', 'Listo: quedó agendado “Llamar a Pérez”.']
        : ['Listo: quedó agendado “Llamar a Pérez” el jueves a las 10:00.'];
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Así se ve en WhatsApp</h2>
        <div className="flex flex-col gap-2 rounded-xl bg-[#efeae2] p-3 dark:bg-slate-800">
          <div className="flex justify-end">
            <p className="max-w-[85%] rounded-[10px_10px_2px_10px] bg-[#d9fdd3] px-2.5 py-2 text-sm text-[#111b21]">{ask}</p>
          </div>
          {replies.map((text, i) =>
            text === 'SÍ' ? (
              <div key={i} className="flex justify-end">
                <p className="rounded-[10px_10px_2px_10px] bg-[#d9fdd3] px-2.5 py-2 text-sm text-[#111b21]">Sí</p>
              </div>
            ) : (
              <div key={i} className="flex justify-start">
                <p className="max-w-[85%] rounded-[10px_10px_10px_2px] bg-white px-2.5 py-2 text-sm text-[#111b21]">{text}</p>
              </div>
            ),
          )}
        </div>
        <p className="text-xs text-muted-foreground">Cambiá el nivel de “Agendar recordatorio” para ver cómo responde. Es un ejemplo.</p>
      </CardContent>
    </Card>
  );
}
