'use client';

import { AttachmentList, FilePicker } from '@/components/support/SupportFiles';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Select from '@/components/ui/Select';
import { Textarea } from '@/components/ui/textarea';
import {
  SUPPORT_MODULES,
  supportApi,
  ticketCode,
  type SupportTicketRow,
  type SupportTicketStatus,
  type SupportTicketType,
} from '@/lib/support';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

const TYPES: Array<{ key: SupportTicketType; label: string; hint: string }> = [
  { key: 'ERROR', label: 'Error', hint: 'Algo no funciona' },
  { key: 'QUESTION', label: 'Consulta', hint: 'Cómo se hace algo' },
  { key: 'SUGGESTION', label: 'Sugerencia', hint: 'Una idea o mejora' },
];

// Lo que ve el usuario: más simple que los estados internos del admin.
const STATUS: Record<SupportTicketStatus, { label: string; cls: string }> = {
  NEW: { label: 'Recibida', cls: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-500/20 dark:text-indigo-200' },
  IN_PROGRESS: { label: 'En revisión', cls: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-500/20 dark:text-indigo-200' },
  WAITING_USER: { label: 'Te respondimos', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' },
  RESOLVED: { label: 'Resuelta', cls: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-400' },
};

const when = (iso: string) =>
  new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

function extractErrorMessage(err: unknown, fallback: string): string {
  const message = (err as AxiosError<{ message?: string | string[] }> | undefined)?.response?.data?.message;
  if (!message) return fallback;
  return Array.isArray(message) ? message.join(', ') : message;
}

/** Datos técnicos para encontrar el problema (sólo si el usuario lo permite). */
function technicalContext(from: string | null): Record<string, string> {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Otro';
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'Otro';
  return {
    Pantalla: from || '(no indicada)',
    Navegador: `${browser} · ${os}`,
    'Tamaño de pantalla': `${window.innerWidth}×${window.innerHeight}`,
    'Agente completo': ua,
  };
}

export default function SupportPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Cargando...</p>}>
      <Support />
    </Suspense>
  );
}

function Support() {
  const params = useSearchParams();
  const router = useRouter();
  const selected = params.get('ticket');
  const from = params.get('from');
  const { data: tickets } = useQuery({ queryKey: ['support-tickets'], queryFn: supportApi.list });

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold">Ayuda y soporte</h1>
        <p className="text-sm text-muted-foreground">
          Contanos qué pasó. Te respondemos por correo y acá mismo, en general el mismo día hábil. También podés
          buscar en el{' '}
          <a href="/documentacion" target="_blank" rel="noreferrer" className="text-primary hover:underline">
            manual de Oplex
          </a>
          .
        </p>
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <section className="flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-4 sm:p-5">
          {selected ? (
            <TicketView id={selected} onBack={() => router.replace('/support')} />
          ) : (
            <NewTicketForm from={from} onCreated={(id) => router.replace(`/support?ticket=${id}&nuevo=1`)} />
          )}
        </section>
        <section className="flex min-w-0 flex-col gap-2 self-start rounded-xl border bg-card p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold">Mis consultas</h2>
            {selected && (
              <Button variant="outline" size="sm" onClick={() => router.replace('/support')}>
                Nueva consulta
              </Button>
            )}
          </div>
          {!tickets?.length ? (
            <p className="text-sm text-muted-foreground">Todavía no hiciste ninguna consulta.</p>
          ) : (
            <ul className="flex flex-col">
              {tickets.map((t) => (
                <TicketListItem
                  key={t.id}
                  t={t}
                  active={t.id === selected}
                  onClick={() => router.replace(`/support?ticket=${t.id}`)}
                />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function TicketListItem({ t, active, onClick }: { t: SupportTicketRow; active: boolean; onClick: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={`flex w-full items-start justify-between gap-3 border-b py-2.5 text-left text-sm last:border-b-0 ${
          active ? 'text-primary' : 'hover:text-primary'
        }`}
      >
        <span className="min-w-0">
          <span className="flex items-center gap-1.5">
            {t.unreadByUser && <span className="h-2 w-2 shrink-0 rounded-full bg-orange-500" aria-label="Respuesta nueva" />}
            <span className="truncate">
              {ticketCode(t.number)} · {t.subject}
            </span>
          </span>
          <span className="block font-mono text-[11px] text-muted-foreground">{when(t.lastMessageAt)}</span>
        </span>
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold ${STATUS[t.status].cls}`}>
          {STATUS[t.status].label}
        </span>
      </button>
    </li>
  );
}

function NewTicketForm({ from, onCreated }: { from: string | null; onCreated: (id: string) => void }) {
  const queryClient = useQueryClient();
  const [type, setType] = useState<SupportTicketType>('ERROR');
  const [module, setModule] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [shareContext, setShareContext] = useState(true);

  const create = useMutation({
    mutationFn: () =>
      supportApi.create({
        type,
        module: module || 'Otra',
        subject: subject.trim(),
        body: body.trim(),
        context: shareContext ? technicalContext(from) : null,
        files,
      }),
    onSuccess: (r) => {
      void queryClient.invalidateQueries({ queryKey: ['support-tickets'] });
      onCreated(r.id);
    },
  });
  const valid = subject.trim().length >= 3 && body.trim().length >= 5;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) create.mutate();
      }}
    >
      <h2 className="font-semibold">Nueva consulta</h2>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Tipo de consulta">
        {TYPES.map((t) => (
          <button
            key={t.key}
            type="button"
            role="radio"
            aria-checked={type === t.key}
            onClick={() => setType(t.key)}
            className={`flex flex-col rounded-xl border-[1.5px] p-2.5 text-left transition ${
              type === t.key ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted'
            }`}
          >
            <b className="text-sm">{t.label}</b>
            <span className="text-xs text-muted-foreground">{t.hint}</span>
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">¿En qué parte de Oplex?</span>
        <Select
          value={module}
          onChange={setModule}
          placeholder="Elegí una sección"
          options={SUPPORT_MODULES.map((m) => ({ value: m, label: m }))}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="support-subject" className="text-sm font-medium">
          Asunto
        </label>
        <Input
          id="support-subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          maxLength={150}
          placeholder={type === 'SUGGESTION' ? 'Ej.: poder imprimir etiquetas con código de barras' : 'Ej.: no puedo emitir una factura B'}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="support-body" className="text-sm font-medium">
          Contanos el detalle
        </label>
        <Textarea id="support-body" rows={5} value={body} onChange={(e) => setBody(e.target.value)} maxLength={8000} />
        <span className="text-xs text-muted-foreground">
          {type === 'ERROR'
            ? 'Si podés, decinos qué hiciste justo antes, qué esperabas que pase y qué mensaje apareció.'
            : 'Cuanto más concreto, mejor.'}
        </span>
      </div>
      <FilePicker files={files} onChange={setFiles} tone="app" />
      <label className="flex items-start gap-2 text-sm">
        <input
          id="support-context"
          type="checkbox"
          checked={shareContext}
          onChange={(e) => setShareContext(e.target.checked)}
          className="mt-1"
        />
        <span>
          Incluir datos técnicos (pantalla de la que venís y navegador). Nos ayuda a encontrar el problema.
        </span>
      </label>
      {create.isError && (
        <p className="text-sm text-red-600 dark:text-red-400">{extractErrorMessage(create.error, 'No se pudo enviar la consulta.')}</p>
      )}
      <Button type="submit" disabled={!valid || create.isPending} className="self-start">
        {create.isPending ? 'Enviando...' : 'Enviar consulta'}
      </Button>
    </form>
  );
}

function TicketView({ id, onBack }: { id: string; onBack: () => void }) {
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const { data: t, isLoading, isError } = useQuery({ queryKey: ['support-ticket', id], queryFn: () => supportApi.get(id) });

  // Abrirla la marca como leída: refrescar la lista y el aviso del menú.
  useEffect(() => {
    if (t) {
      void queryClient.invalidateQueries({ queryKey: ['support-tickets'] });
      void queryClient.invalidateQueries({ queryKey: ['support-unread'] });
    }
  }, [t?.id, queryClient]);

  const reply = useMutation({
    mutationFn: () => supportApi.reply(id, body.trim(), files),
    onSuccess: () => {
      setBody('');
      setFiles([]);
      void queryClient.invalidateQueries({ queryKey: ['support-ticket', id] });
      void queryClient.invalidateQueries({ queryKey: ['support-tickets'] });
    },
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Cargando consulta...</p>;
  if (isError || !t)
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-red-600 dark:text-red-400">No encontramos esa consulta.</p>
        <Button variant="outline" size="sm" onClick={onBack} className="self-start">
          Volver
        </Button>
      </div>
    );

  return (
    <div className="flex flex-col gap-4">
      {params.get('nuevo') && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300">
          <b>Recibimos tu consulta {ticketCode(t.number)}.</b> Te avisamos a tu correo cuando respondamos.
        </div>
      )}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-semibold">
            {ticketCode(t.number)} · {t.subject}
          </h2>
          <p className="text-xs text-muted-foreground">
            {TYPES.find((x) => x.key === t.type)?.label} · {t.module} · {when(t.createdAt)}
          </p>
        </div>
        <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${STATUS[t.status].cls}`}>{STATUS[t.status].label}</span>
      </div>

      <div className="flex flex-col gap-3">
        {t.messages.map((m) => (
          <article
            key={m.id}
            className={`flex max-w-[600px] flex-col gap-1.5 rounded-xl border px-3 py-2.5 ${
              m.authorKind === 'ADMIN' ? 'border-primary/30 bg-primary/5' : 'self-end bg-muted/50'
            }`}
          >
            <header className="flex justify-between gap-3 text-xs text-muted-foreground">
              <span>{m.authorKind === 'ADMIN' ? 'Equipo de Oplex' : 'Vos'}</span>
              <span>{when(m.createdAt)}</span>
            </header>
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{m.body}</p>
            <AttachmentList attachments={m.attachments} load={supportApi.attachmentBlob} tone="app" />
          </article>
        ))}
      </div>

      <form
        className="flex flex-col gap-2 border-t pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (body.trim().length >= 2) reply.mutate();
        }}
      >
        <label htmlFor="support-user-reply" className="text-sm font-medium">
          {t.status === 'RESOLVED' ? '¿Sigue pasando? Escribinos y la reabrimos' : 'Responder'}
        </label>
        <Textarea id="support-user-reply" rows={3} value={body} onChange={(e) => setBody(e.target.value)} maxLength={8000} />
        <FilePicker files={files} onChange={setFiles} tone="app" compact />
        {reply.isError && (
          <p className="text-sm text-red-600 dark:text-red-400">{extractErrorMessage(reply.error, 'No se pudo enviar.')}</p>
        )}
        <Button type="submit" disabled={body.trim().length < 2 || reply.isPending} className="self-start">
          {reply.isPending ? 'Enviando...' : 'Enviar'}
        </Button>
      </form>
    </div>
  );
}
