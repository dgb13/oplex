'use client';

import { UserAvatar } from '@/components/UserAvatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import Select from '@/components/ui/Select';
import {
  collaborationApi,
  dueLabel,
  personName,
  relativeTime,
  type DocumentComment,
  type Person,
  type TeamTask,
} from '@/lib/collaboration';
import { profileApi } from '@/lib/profile';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useMemo, useRef, useState } from 'react';

function firstName(p: Pick<Person, 'name' | 'email'>): string {
  return (p.name?.trim() || p.email).split(/\s+/)[0];
}

function todayPlus(days: number): string {
  const d = new Date(Date.now() + days * 86400000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function errorText(err: unknown, fallback: string): string {
  const message = (err as AxiosError<{ message?: string | string[] }>)?.response?.data?.message;
  return Array.isArray(message) ? message.join(', ') : (message ?? fallback);
}

/** Pinta en color las @menciones de un comentario. */
function CommentBody({ body }: { body: string }) {
  const parts = body.split(/(@[\p{L}\p{N}_.-]+)/u);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith('@') ? (
          <span key={i} className="rounded bg-fuchsia-100 px-1 font-medium text-fuchsia-700 dark:bg-fuchsia-950 dark:text-fuchsia-300">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

type ThreadItem = { kind: 'comment'; at: string; comment: DocumentComment } | { kind: 'task'; at: string; task: TeamTask };

/**
 * "Comentarios y tareas" de un documento: @mencionar a alguien le llega a
 * su campana; "+ Tarea" le asigna algo con vencimiento (queda también en su
 * Agenda). Genérico por entityType/entityId - hoy se usa en las órdenes de
 * producción (ver COMMENTABLE_ENTITIES en la API).
 */
export function CollabPanel({ entityType, entityId }: { entityType: string; entityId: string }) {
  const queryClient = useQueryClient();
  const meQuery = useQuery({ queryKey: ['profile-me'], queryFn: profileApi.getMe });
  const peopleQuery = useQuery({ queryKey: ['collaboration-people'], queryFn: collaborationApi.people });
  const commentsKey = ['comments', entityType, entityId];
  const tasksKey = ['entity-tasks', entityType, entityId];
  const commentsQuery = useQuery({ queryKey: commentsKey, queryFn: () => collaborationApi.listComments(entityType, entityId) });
  const tasksQuery = useQuery({ queryKey: tasksKey, queryFn: () => collaborationApi.tasksFor(entityType, entityId) });

  const me = meQuery.data;
  const people = peopleQuery.data ?? [];
  const everyone = useMemo<Person[]>(
    () => (me ? [{ id: me.id, name: me.name, email: me.email, avatarUrl: me.avatarUrl, role: me.role }, ...people] : people),
    [me, people],
  );
  const byId = useMemo(() => new Map(everyone.map((p) => [p.id, p])), [everyone]);

  const [text, setText] = useState('');
  const [mentioned, setMentioned] = useState<Map<string, string>>(new Map()); // userId -> "@Nombre"
  const [suggest, setSuggest] = useState<{ query: string; index: number } | null>(null);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const [taskOpen, setTaskOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskWho, setTaskWho] = useState('');
  const [taskDue, setTaskDue] = useState(todayPlus(1));

  const matches = suggest
    ? people.filter((p) => {
        const q = suggest.query.toLowerCase();
        const name = (p.name ?? p.email).toLowerCase();
        return name.startsWith(q) || name.split(/\s+/).some((w) => w.startsWith(q)) || p.email.toLowerCase().startsWith(q);
      }).slice(0, 6)
    : [];

  function onType(value: string) {
    setText(value);
    setError('');
    const caret = inputRef.current?.selectionStart ?? value.length;
    const m = value.slice(0, caret).match(/@([\p{L}\p{N}_.-]*)$/u);
    setSuggest(m ? { query: m[1], index: 0 } : null);
  }

  function pick(p: Person) {
    const el = inputRef.current;
    const caret = el?.selectionStart ?? text.length;
    const token = `@${firstName(p)}`;
    const before = text.slice(0, caret).replace(/@([\p{L}\p{N}_.-]*)$/u, `${token} `);
    const next = before + text.slice(caret);
    setText(next);
    setMentioned((prev) => new Map(prev).set(p.id, token));
    setSuggest(null);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(before.length, before.length);
    });
  }

  const send = useMutation({
    mutationFn: () => {
      // Sólo cuentan las menciones que siguen escritas en el texto.
      const ids = [...mentioned.entries()].filter(([, token]) => text.includes(token)).map(([id]) => id);
      return collaborationApi.addComment({ entityType, entityId, body: text.trim(), mentionedUserIds: ids });
    },
    onSuccess: () => {
      setText('');
      setMentioned(new Map());
      void queryClient.invalidateQueries({ queryKey: commentsKey });
    },
    onError: (err) => setError(errorText(err, 'No se pudo guardar el comentario')),
  });

  const createTask = useMutation({
    mutationFn: () =>
      collaborationApi.createTask({ title: taskTitle.trim(), dueDate: taskDue, assignedTo: taskWho, linkType: entityType, linkId: entityId }),
    onSuccess: () => {
      setTaskOpen(false);
      setTaskTitle('');
      void queryClient.invalidateQueries({ queryKey: tasksKey });
      void queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
    },
    onError: (err) => setError(errorText(err, 'No se pudo crear la tarea')),
  });

  const toggleTask = useMutation({
    mutationFn: (t: TeamTask) => collaborationApi.setTaskDone(t.id, t.status !== 'DONE'),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: tasksKey });
      void queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
    },
  });

  const thread: ThreadItem[] = [
    ...(commentsQuery.data ?? []).map((c) => ({ kind: 'comment' as const, at: c.createdAt, comment: c })),
    ...(tasksQuery.data ?? []).map((t) => ({ kind: 'task' as const, at: t.createdAt ?? t.startsAt, task: t })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (suggest && matches.length > 0) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const delta = e.key === 'ArrowDown' ? 1 : -1;
        setSuggest({ ...suggest, index: (suggest.index + delta + matches.length) % matches.length });
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        pick(matches[suggest.index]);
        return;
      }
      if (e.key === 'Escape') {
        setSuggest(null);
        return;
      }
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && text.trim()) {
      e.preventDefault();
      send.mutate();
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Comentarios y tareas</CardTitle>
        <p className="text-xs text-muted-foreground">
          Escribí <b>@</b> para avisarle a alguien del equipo. Cada mención le llega a su campana.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {thread.length === 0 && (
          <p className="text-sm text-muted-foreground">Todavía no hay comentarios ni tareas en esta orden.</p>
        )}
        {thread.map((item) =>
          item.kind === 'comment' ? (
            <div key={item.comment.id} className="grid grid-cols-[28px_1fr] gap-2.5">
              {item.comment.author ? (
                <UserAvatar
                  avatarUrl={item.comment.author.avatarUrl}
                  name={item.comment.author.name}
                  email={item.comment.author.email}
                  size={28}
                />
              ) : (
                <span />
              )}
              <div className="min-w-0">
                <p className="text-xs">
                  <b className="font-semibold">{personName(item.comment.author)}</b>
                  <span className="ml-1.5 text-muted-foreground">{relativeTime(item.comment.createdAt)}</span>
                </p>
                <p className="mt-0.5 rounded-lg bg-muted px-2.5 py-1.5 text-sm break-words whitespace-pre-wrap">
                  <CommentBody body={item.comment.body} />
                </p>
              </div>
            </div>
          ) : (
            <TaskCard
              key={item.task.id}
              task={item.task}
              assignee={item.task.assignedTo ? byId.get(item.task.assignedTo) : undefined}
              assigner={item.task.createdByUserId ? byId.get(item.task.createdByUserId) : undefined}
              meId={me?.id}
              onToggle={() => toggleTask.mutate(item.task)}
              busy={toggleTask.isPending}
            />
          ),
        )}

        <div className="relative mt-1 rounded-xl border focus-within:border-primary">
          {suggest && matches.length > 0 && (
            <div role="listbox" aria-label="Mencionar a" className="absolute bottom-[calc(100%+6px)] left-2 z-10 w-64 rounded-lg border bg-popover p-1 shadow-lg">
              {matches.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  role="option"
                  aria-selected={i === suggest.index}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(p);
                  }}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${i === suggest.index ? 'bg-muted' : 'hover:bg-muted'}`}
                >
                  <UserAvatar avatarUrl={p.avatarUrl} name={p.name} email={p.email} size={22} />
                  <span className="truncate">{personName(p)}</span>
                </button>
              ))}
            </div>
          )}
          <label htmlFor={`collab-${entityId}`} className="sr-only">
            Comentario
          </label>
          <textarea
            id={`collab-${entityId}`}
            ref={inputRef}
            value={text}
            onChange={(e) => onType(e.target.value)}
            onKeyDown={onKeyDown}
            onBlur={() => setTimeout(() => setSuggest(null), 150)}
            placeholder="Escribí un comentario… usá @ para mencionar"
            rows={3}
            maxLength={2000}
            className="block w-full resize-none bg-transparent px-3 py-2.5 text-sm outline-none"
          />
          <div className="flex items-center justify-between gap-2 border-t px-2 py-1.5">
            <Button type="button" variant="outline" size="sm" onClick={() => setTaskOpen((v) => !v)}>
              + Tarea
            </Button>
            <Button type="button" size="sm" disabled={!text.trim() || send.isPending} onClick={() => send.mutate()}>
              {send.isPending ? 'Guardando...' : 'Comentar'}
            </Button>
          </div>
        </div>

        {taskOpen && (
          <form
            className="flex flex-col gap-2.5 rounded-xl border border-dashed p-3"
            onSubmit={(e) => {
              e.preventDefault();
              createTask.mutate();
            }}
          >
            <label className="flex flex-col gap-1 text-xs text-muted-foreground" htmlFor={`task-title-${entityId}`}>
              Tarea
              <Input
                id={`task-title-${entityId}`}
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                placeholder="Ej: Revisar terminación y sacar fotos"
                maxLength={200}
              />
            </label>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                Asignar a
                <Select
                  value={taskWho}
                  onChange={setTaskWho}
                  placeholder="Elegir persona..."
                  options={everyone.map((p) => ({ value: p.id, label: p.id === me?.id ? `${personName(p)} (yo)` : personName(p) }))}
                />
              </div>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground" htmlFor={`task-due-${entityId}`}>
                Vence
                <Input id={`task-due-${entityId}`} type="date" value={taskDue} onChange={(e) => setTaskDue(e.target.value)} />
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setTaskOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={!taskTitle.trim() || !taskWho || !taskDue || createTask.isPending}>
                {createTask.isPending ? 'Creando...' : 'Crear tarea'}
              </Button>
            </div>
          </form>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}

function TaskCard({
  task,
  assignee,
  assigner,
  meId,
  onToggle,
  busy,
}: {
  task: TeamTask;
  assignee?: Person;
  assigner?: Person;
  meId?: string;
  onToggle: () => void;
  busy: boolean;
}) {
  const done = task.status === 'DONE';
  const due = dueLabel(task.startsAt);
  const who = assignee ? (assignee.id === meId ? 'vos' : personName(assignee)) : 'sin asignar';
  return (
    <label className="grid cursor-pointer grid-cols-[20px_1fr] gap-2 rounded-lg border p-2.5">
      <input type="checkbox" checked={done} onChange={onToggle} disabled={busy} className="mt-1 accent-[var(--primary)]" aria-label={`Completar ${task.title}`} />
      <span className="min-w-0">
        <span className={`block text-sm font-medium ${done ? 'text-muted-foreground line-through' : ''}`}>{task.title}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {assignee && <UserAvatar avatarUrl={assignee.avatarUrl} name={assignee.name} email={assignee.email} size={16} />}
          Asignada a {who}
          {assigner && assigner.id !== assignee?.id && ` por ${assigner.id === meId ? 'vos' : personName(assigner)}`}
          {' · '}
          {done ? (
            <span>completada</span>
          ) : (
            <span className={due.tone === 'late' ? 'text-destructive' : due.tone === 'soon' ? 'text-amber-600 dark:text-amber-400' : ''}>
              {due.text}
            </span>
          )}
        </span>
      </span>
    </label>
  );
}
