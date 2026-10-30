'use client';

import { AttachmentList, FilePicker } from '@/components/support/SupportFiles';
import {
  adminSupportApi,
  adminTenantsApi,
  type AdminSupportTicketRow,
  type SupportTicketPriority,
  type SupportTicketStatus,
  type SupportTicketType,
} from '@/lib/admin';
import { startImpersonation } from '@/lib/impersonation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import AdminSelect from '../AdminSelect';
import { formatWhen } from '../OpsUi';

const STATUS_LABELS: Record<SupportTicketStatus, { label: string; cls: string }> = {
  NEW: { label: 'Nueva', cls: 'bg-indigo-500/15 text-indigo-200' },
  IN_PROGRESS: { label: 'En curso', cls: 'bg-amber-900/50 text-amber-300' },
  WAITING_USER: { label: 'Esperando al usuario', cls: 'bg-slate-800 text-slate-400' },
  RESOLVED: { label: 'Resuelta', cls: 'bg-green-900/50 text-green-300' },
};
const TYPE_LABELS: Record<SupportTicketType, { label: string; cls: string }> = {
  ERROR: { label: 'Error', cls: 'bg-red-900/50 text-red-300' },
  QUESTION: { label: 'Consulta', cls: 'bg-slate-800 text-slate-300' },
  SUGGESTION: { label: 'Sugerencia', cls: 'bg-indigo-500/15 text-indigo-200' },
};
const PRIORITY_LABELS: Record<SupportTicketPriority, string> = { LOW: 'Baja', NORMAL: 'Normal', HIGH: 'Alta' };

type Filter = 'open' | 'resolved' | 'all';

const code = (n: number) => `#${String(n).padStart(4, '0')}`;

function extractErrorMessage(err: unknown, fallback: string): string {
  const message = (err as AxiosError<{ message?: string | string[] }> | undefined)?.response?.data?.message;
  if (!message) return fallback;
  return Array.isArray(message) ? message.join(', ') : message;
}

export default function AdminSupportPage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">Cargando...</p>}>
      <SupportInbox />
    </Suspense>
  );
}

function SupportInbox() {
  const params = useSearchParams();
  const router = useRouter();
  const tenantFilter = params.get('tenant');
  const selectedParam = params.get('ticket'); // "<tenantId>.<ticketId>" (lo usa el link del mail)
  const [filter, setFilter] = useState<Filter>('open');
  const { data: tickets, isLoading, isError } = useQuery({
    queryKey: ['admin-support-tickets'],
    queryFn: adminSupportApi.list,
    refetchInterval: 60_000,
  });

  const rows = (tickets ?? []).filter(
    (t) =>
      (!tenantFilter || t.tenantId === tenantFilter) &&
      (filter === 'all' || (filter === 'open' ? t.status !== 'RESOLVED' : t.status === 'RESOLVED')),
  );
  const [selTenant, selId] = selectedParam?.split('.') ?? [];
  const select = (t: AdminSupportTicketRow) => {
    const q = new URLSearchParams(params.toString());
    q.set('ticket', `${t.tenantId}.${t.id}`);
    router.replace(`/admin/support?${q.toString()}`, { scroll: false });
  };

  const open = (tickets ?? []).filter((t) => t.status !== 'RESOLVED').length;
  const unread = (tickets ?? []).filter((t) => t.unreadByAdmin).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-xl font-semibold text-white">Soporte</h1>
        <div className="flex gap-4 text-xs text-slate-500">
          <span>
            Abiertas: <b className="text-slate-200">{open}</b>
          </span>
          <span>
            Sin leer: <b className="text-slate-200">{unread}</b>
          </span>
          <span>Avisos a soporte@oplex.com.ar</span>
        </div>
      </div>

      <div className="grid min-h-[560px] grid-cols-1 overflow-hidden rounded-xl border border-slate-800 bg-slate-900 lg:grid-cols-[330px_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col border-b border-slate-800 lg:border-b-0 lg:border-r">
          <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-800 p-3">
            {(
              [
                ['open', 'Abiertas'],
                ['resolved', 'Resueltas'],
                ['all', 'Todas'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`rounded-full border px-2.5 py-1 text-xs transition ${
                  filter === key ? 'border-indigo-500 bg-indigo-500/15 text-white' : 'border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
            {tenantFilter && (
              <button
                type="button"
                onClick={() => router.replace('/admin/support')}
                className="rounded-full border border-amber-800 px-2.5 py-1 text-xs text-amber-300"
              >
                Un solo tenant ✕
              </button>
            )}
          </div>
          {isLoading ? (
            <p className="p-4 text-sm text-slate-500">Cargando consultas...</p>
          ) : isError ? (
            <p className="p-4 text-sm text-red-400">No se pudieron cargar las consultas.</p>
          ) : rows.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">No hay consultas en esta vista.</p>
          ) : (
            <ul className="max-h-[70vh] overflow-y-auto">
              {rows.map((t) => {
                const active = t.tenantId === selTenant && t.id === selId;
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => select(t)}
                      className={`flex w-full flex-col gap-1 border-b border-slate-800 px-3 py-2.5 text-left transition ${
                        active ? 'bg-indigo-500/15' : 'hover:bg-slate-800/40'
                      }`}
                    >
                      <span className="flex justify-between gap-2 text-[11.5px] text-slate-500">
                        <span className="flex min-w-0 items-center gap-1.5">
                          {t.unreadByAdmin && <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-orange-500" aria-label="Sin leer" />}
                          <span className="truncate">
                            {code(t.number)} · {t.tenantName}
                          </span>
                        </span>
                        <span className="shrink-0">{formatWhen(t.lastMessageAt)}</span>
                      </span>
                      <b className="text-[13px] font-semibold text-white">{t.subject}</b>
                      <span className="flex flex-wrap gap-1">
                        <Chip {...TYPE_LABELS[t.type]} />
                        <Chip {...STATUS_LABELS[t.status]} />
                        {t.priority === 'HIGH' && <Chip label="Alta" cls="bg-red-900/50 text-red-300" />}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {selTenant && selId ? (
          <TicketThread key={`${selTenant}.${selId}`} tenantId={selTenant} ticketId={selId} />
        ) : (
          <p className="grid place-items-center p-8 text-sm text-slate-500">Elegí una consulta de la lista.</p>
        )}
      </div>
    </div>
  );
}

function Chip({ label, cls }: { label: string; cls: string }) {
  return <span className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium ${cls}`}>{label}</span>;
}

function TicketThread({ tenantId, ticketId }: { tenantId: string; ticketId: string }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [mode, setMode] = useState<'public' | 'internal'>('public');
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const { data: t, isLoading, isError } = useQuery({
    queryKey: ['admin-support-ticket', tenantId, ticketId],
    queryFn: () => adminSupportApi.get(tenantId, ticketId),
  });

  // Abrirla la marca como leída: refrescar la lista y el número del menú.
  useEffect(() => {
    if (t) {
      void queryClient.invalidateQueries({ queryKey: ['admin-support-tickets'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-support-counts'] });
    }
  }, [t?.id, queryClient]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin-support-ticket', tenantId, ticketId] });
    void queryClient.invalidateQueries({ queryKey: ['admin-support-tickets'] });
    void queryClient.invalidateQueries({ queryKey: ['admin-support-counts'] });
  };
  const update = useMutation({
    mutationFn: (dto: { status?: SupportTicketStatus; priority?: SupportTicketPriority }) =>
      adminSupportApi.update(tenantId, ticketId, dto),
    onSuccess: refresh,
  });
  const reply = useMutation({
    mutationFn: () => adminSupportApi.reply(tenantId, ticketId, body, mode === 'internal', files),
    onSuccess: () => {
      setBody('');
      setFiles([]);
      refresh();
    },
  });
  const impersonate = useMutation({
    mutationFn: (userId: string) => adminTenantsApi.impersonate(tenantId, userId),
    onSuccess: (r) => startImpersonation(queryClient, router, tenantId, r.accessToken, r.expiresAt),
  });
  const load = useCallback((id: string) => adminSupportApi.attachmentBlob(tenantId, id), [tenantId]);

  if (isLoading) return <p className="p-6 text-sm text-slate-500">Cargando consulta...</p>;
  if (isError || !t) return <p className="p-6 text-sm text-red-400">No se pudo abrir esta consulta.</p>;

  return (
    <div className="flex min-w-0 flex-col">
      <div className="flex flex-col gap-2 border-b border-slate-800 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <b className="text-[15px] text-white">
            {code(t.number)} · {t.subject}
          </b>
          <div className="flex flex-wrap items-center gap-2">
            <AdminSelect
              className="w-48"
              buttonClassName="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200"
              value={t.status}
              onChange={(v) => update.mutate({ status: v as SupportTicketStatus })}
              options={(Object.keys(STATUS_LABELS) as SupportTicketStatus[]).map((s) => ({ value: s, label: STATUS_LABELS[s].label }))}
            />
            <AdminSelect
              className="w-40"
              buttonClassName="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200"
              value={t.priority}
              onChange={(v) => update.mutate({ priority: v as SupportTicketPriority })}
              options={(Object.keys(PRIORITY_LABELS) as SupportTicketPriority[]).map((p) => ({
                value: p,
                label: `Prioridad ${PRIORITY_LABELS[p].toLowerCase()}`,
              }))}
            />
            {t.userExists && (
              <button
                type="button"
                onClick={() => impersonate.mutate(t.userId)}
                disabled={impersonate.isPending}
                className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-500 disabled:opacity-50"
              >
                {impersonate.isPending ? 'Ingresando...' : `Entrar como ${t.userEmail.split('@')[0]}`}
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-slate-500">
          <Chip {...TYPE_LABELS[t.type]} />
          <a href={`/admin/tenants/${tenantId}`} className="text-indigo-300 hover:underline">
            {t.tenantName}
          </a>
          <span>
            {t.userName ? `${t.userName} · ` : ''}
            {t.userEmail}
          </span>
          <span>Sección: {t.module}</span>
        </div>
        {(update.error || impersonate.error) && (
          <p className="text-xs text-red-400">{extractErrorMessage(update.error ?? impersonate.error, 'No se pudo aplicar el cambio')}</p>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        {t.messages.map((m, i) => {
          const fromAdmin = m.authorKind === 'ADMIN';
          return (
            <article
              key={m.id}
              className={`flex max-w-[640px] flex-col gap-1.5 rounded-xl border px-3 py-2.5 ${
                m.internal
                  ? 'self-end border-dashed border-amber-900 bg-amber-950/25'
                  : fromAdmin
                    ? 'self-end border-indigo-900 bg-indigo-500/15'
                    : 'border-slate-800'
              }`}
            >
              <header className="flex justify-between gap-3 text-[11.5px] text-slate-500">
                <span>{m.internal ? `Nota interna · ${m.authorEmail}` : fromAdmin ? `Oplex · ${m.authorEmail}` : m.authorEmail}</span>
                <span>{formatWhen(m.createdAt)}</span>
              </header>
              <p className="whitespace-pre-wrap break-words text-[13.5px] leading-relaxed text-slate-200">{m.body}</p>
              <AttachmentList attachments={m.attachments} load={load} tone="admin" />
              {i === 0 && t.context && (
                <div className="rounded-md bg-slate-950/60 px-2.5 py-2 font-mono text-[11px] leading-relaxed text-slate-400">
                  <span className="text-slate-500">Datos tomados automáticamente</span>
                  {Object.entries(t.context).map(([k, v]) => (
                    <span key={k} className="block break-words">
                      {k}: {v}
                    </span>
                  ))}
                  {t.userRoles.length > 0 && <span className="block">Rol: {t.userRoles.join(', ')}</span>}
                </div>
              )}
            </article>
          );
        })}
      </div>

      <form
        className="flex flex-col gap-2 border-t border-slate-800 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (body.trim().length >= 2) reply.mutate();
        }}
      >
        <div className="inline-flex self-start overflow-hidden rounded-lg border border-slate-700">
          <button
            type="button"
            onClick={() => setMode('public')}
            className={`px-3 py-1.5 text-xs ${mode === 'public' ? 'bg-indigo-500/15 text-white' : 'text-slate-400'}`}
          >
            Responder al usuario
          </button>
          <button
            type="button"
            onClick={() => setMode('internal')}
            className={`px-3 py-1.5 text-xs ${mode === 'internal' ? 'bg-amber-900/50 text-amber-300' : 'text-slate-400'}`}
          >
            Nota interna
          </button>
        </div>
        <label htmlFor="support-reply" className="sr-only">
          Respuesta
        </label>
        <textarea
          id="support-reply"
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={8000}
          placeholder={mode === 'public' ? 'Le llega por correo y lo ve en Oplex → Ayuda y soporte' : 'Sólo la ven los admins de Oplex'}
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-[13px] text-slate-200 placeholder:text-slate-600"
        />
        <FilePicker files={files} onChange={setFiles} tone="admin" compact />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11.5px] text-slate-500">
            {mode === 'public'
              ? `Se le manda a ${t.userEmail} y la consulta pasa a "Esperando al usuario".`
              : 'No se le manda a nadie.'}
          </span>
          <button
            type="submit"
            disabled={reply.isPending || body.trim().length < 2}
            className="rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-40"
          >
            {reply.isPending ? 'Enviando...' : mode === 'public' ? 'Enviar respuesta' : 'Guardar nota'}
          </button>
        </div>
        {reply.isError && <p className="text-xs text-red-400">{extractErrorMessage(reply.error, 'No se pudo enviar')}</p>}
      </form>
    </div>
  );
}
