'use client';

import { UserAvatar } from '@/components/UserAvatar';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  collaborationApi,
  dayLabel,
  dueLabel,
  NOTIFICATION_CREATED_EVENT,
  relativeTime,
  type AppNotification,
  type NotificationCategory,
  type NotificationFilter,
} from '@/lib/collaboration';
import { getSocket } from '@/lib/socket';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AtSign, Bell, CheckSquare, Factory, Package, Receipt, TriangleAlert, type LucideIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { RichText } from './RichText';

type Tab = NotificationFilter | 'tasks';

const CATEGORY: Record<NotificationCategory, { icon: LucideIcon; label: string; className: string }> = {
  PRODUCTION: { icon: Factory, label: 'Producción', className: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300' },
  PURCHASES: { icon: Package, label: 'Compras', className: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300' },
  STOCK: { icon: TriangleAlert, label: 'Stock', className: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' },
  MENTION: { icon: AtSign, label: 'Mención', className: 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-950 dark:text-fuchsia-300' },
  TASK: { icon: CheckSquare, label: 'Tarea', className: 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-950 dark:text-fuchsia-300' },
  BILLING: { icon: Receipt, label: 'Facturación', className: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300' },
};

const TABS: { key: Tab; label: string }[] = [
  { key: 'all', label: 'Todas' },
  { key: 'unread', label: 'No leídas' },
  { key: 'mentions', label: 'Menciones' },
  { key: 'tasks', label: 'Mis tareas' },
];

/**
 * La campana de avisos del equipo (barra superior). Los avisos llegan en
 * vivo por el WebSocket del Tablero (sala user:<id>, ver DashboardGateway)
 * y además se refrescan al abrir el panel. Aprobado en el mockup "Oplex en
 * equipo" (2026-09-30).
 */
export function NotificationBell() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('all');
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [ringing, setRinging] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const unreadQuery = useQuery({ queryKey: ['notifications-unread'], queryFn: collaborationApi.unreadCount });
  const listQuery = useQuery({
    queryKey: ['notifications', tab],
    queryFn: () => collaborationApi.listNotifications(tab as NotificationFilter),
    enabled: open && tab !== 'tasks',
  });
  const tasksQuery = useQuery({ queryKey: ['my-tasks'], queryFn: collaborationApi.myTasks });

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    void queryClient.invalidateQueries({ queryKey: ['notifications-unread'] });
  }

  function go(n: AppNotification) {
    if (!n.readAt) {
      void collaborationApi.markRead(n.id).then(refresh);
    }
    setOpen(false);
    if (n.link) router.push(n.link);
  }

  // Aviso en vivo: suena la campana y aparece el globito.
  useEffect(() => {
    const socket = getSocket();
    const onNotification = (n: AppNotification) => {
      refresh();
      if (n.category === 'TASK') void queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
      // Si el documento del aviso está abierto (panel "Comentarios y
      // tareas", orden de producción), que se actualice solo.
      if (n.category === 'MENTION' || n.category === 'TASK') {
        void queryClient.invalidateQueries({ queryKey: ['comments'] });
        void queryClient.invalidateQueries({ queryKey: ['entity-tasks'] });
      }
      if (n.category === 'PRODUCTION') void queryClient.invalidateQueries({ queryKey: ['production-order'] });
      setRinging(false);
      requestAnimationFrame(() => setRinging(true));
      toast(<RichText text={n.message} />, {
        description: n.quote ?? undefined,
        action: n.link ? { label: 'Ver', onClick: () => go(n) } : undefined,
        duration: 7000,
      });
    };
    socket.on(NOTIFICATION_CREATED_EVENT, onNotification);
    return () => {
      socket.off(NOTIFICATION_CREATED_EVENT, onNotification);
    };
    // go/refresh sólo leen router/queryClient, estables entre renders.
  }, [queryClient]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const markAll = useMutation({ mutationFn: collaborationApi.markAllRead, onSuccess: refresh });
  const toggleTask = useMutation({
    mutationFn: (id: string) => collaborationApi.setTaskDone(id, true),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['my-tasks'] }),
  });

  const unread = unreadQuery.data ?? 0;
  const openTasks = tasksQuery.data ?? [];
  const items = listQuery.data ?? [];

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onAnimationEnd={() => setRinging(false)}
        className={`relative rounded-lg p-1.5 text-muted-foreground hover:bg-muted ${open ? 'bg-muted text-foreground' : ''}`}
        aria-label={unread > 0 ? `Notificaciones, ${unread} sin leer` : 'Notificaciones'}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Notificaciones"
      >
        <Bell className={`h-5 w-5 ${ringing ? 'animate-[bell-ring_0.9s_ease]' : ''}`} style={{ transformOrigin: '50% 3px' }} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] rounded-full border-2 border-background bg-red-500 px-1 text-center text-[10.5px] leading-[14px] font-semibold text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notificaciones"
          className="absolute top-11 right-0 z-50 w-[min(420px,calc(100vw-2rem))] overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-xl"
        >
          <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
            <h3 className="text-[15px] font-semibold">Notificaciones</h3>
            <button
              type="button"
              className="text-xs text-primary hover:underline disabled:opacity-50"
              onClick={() => markAll.mutate()}
              disabled={unread === 0 || markAll.isPending}
            >
              Marcar todo como leído
            </button>
          </div>
          <div className="flex gap-1 border-b px-3 pb-2.5" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
                className={`rounded-md px-2.5 py-1 text-xs ${tab === t.key ? 'bg-muted font-semibold text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {t.label}
                {t.key === 'unread' && unread > 0 && (
                  <span className="ml-1 rounded bg-primary/10 px-1 font-mono text-[10px] text-primary">{unread}</span>
                )}
                {t.key === 'tasks' && openTasks.length > 0 && (
                  <span className="ml-1 rounded bg-primary/10 px-1 font-mono text-[10px] text-primary">{openTasks.length}</span>
                )}
              </button>
            ))}
          </div>

          <div className="max-h-[440px] overflow-y-auto">
            {tab === 'tasks' ? (
              openTasks.length === 0 ? (
                <p className="px-4 py-9 text-center text-sm text-muted-foreground">No tenés tareas pendientes.</p>
              ) : (
                openTasks.map((task) => {
                  const due = dueLabel(task.startsAt);
                  return (
                    <label key={task.id} className="flex cursor-pointer gap-3 border-b px-4 py-2.5 last:border-0 hover:bg-muted/50">
                      <input
                        type="checkbox"
                        className="mt-1 accent-[var(--primary)]"
                        onChange={() => toggleTask.mutate(task.id)}
                        disabled={toggleTask.isPending}
                        aria-label={`Completar ${task.title}`}
                      />
                      <span className="min-w-0">
                        <span className="block text-sm">{task.title}</span>
                        <span
                          className={`text-xs ${due.tone === 'late' ? 'text-destructive' : due.tone === 'soon' ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}
                        >
                          {due.text}
                        </span>
                      </span>
                    </label>
                  );
                })
              )
            ) : listQuery.isLoading ? (
              <p className="px-4 py-9 text-center text-sm text-muted-foreground">Cargando...</p>
            ) : items.length === 0 ? (
              <p className="px-4 py-9 text-center text-sm text-muted-foreground">
                {tab === 'unread' ? 'Estás al día.' : 'Todavía no hay avisos.'}
              </p>
            ) : (
              items.map((n, i) => {
                const cat = CATEGORY[n.category];
                const Icon = cat.icon;
                const day = dayLabel(n.createdAt);
                const showDay = i === 0 || dayLabel(items[i - 1].createdAt) !== day;
                return (
                  <div key={n.id}>
                    {showDay && (
                      <p className="px-4 pt-2.5 pb-1 font-mono text-[10.5px] tracking-widest text-muted-foreground uppercase">
                        {day}
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => go(n)}
                      className="grid w-full grid-cols-[34px_1fr_8px] gap-2.5 border-b px-4 py-2.5 text-left last:border-0 hover:bg-muted/50"
                    >
                      <span className={`relative grid h-[34px] w-[34px] place-items-center rounded-[10px] ${cat.className}`}>
                        <Icon className="h-4 w-4" />
                        {n.actor && (
                          <UserAvatar
                            avatarUrl={n.actor.avatarUrl}
                            name={n.actor.name}
                            email={n.actor.email}
                            size={18}
                            className="absolute -right-1.5 -bottom-1.5 ring-2 ring-popover"
                          />
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className={`block text-[13.5px] leading-snug ${n.readAt ? 'text-muted-foreground' : ''}`}>
                          <RichText text={n.message} />
                        </span>
                        {n.quote && (
                          <span className="mt-1 block rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">{n.quote}</span>
                        )}
                        <span className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                          <span className={`rounded px-1.5 py-0.5 font-mono text-[9.5px] tracking-wide uppercase ${cat.className}`}>
                            {cat.label}
                          </span>
                          {relativeTime(n.createdAt)}
                        </span>
                      </span>
                      <span
                        className={`mt-1.5 h-2 w-2 rounded-full ${n.readAt ? '' : 'bg-primary'}`}
                        aria-label={n.readAt ? 'Leída' : 'No leída'}
                      />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          <div className="flex items-center justify-between border-t px-4 py-2.5 text-xs">
            <button
              type="button"
              className="text-primary hover:underline"
              onClick={() => {
                setOpen(false);
                setPrefsOpen(true);
              }}
            >
              Qué me avisa Oplex
            </button>
            <span className="text-muted-foreground">Se guardan 90 días</span>
          </div>
        </div>
      )}

      {prefsOpen && <PreferencesDialog onClose={() => setPrefsOpen(false)} />}
    </div>
  );
}

function PreferencesDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const prefsQuery = useQuery({ queryKey: ['notification-preferences'], queryFn: collaborationApi.getPreferences });
  const save = useMutation({
    mutationFn: collaborationApi.setPreferences,
    onSuccess: (data) => queryClient.setQueryData(['notification-preferences'], data),
  });
  const prefs = prefsQuery.data ?? [];

  function toggle(key: string) {
    const muted = prefs.filter((p) => (p.key === key ? p.enabled : !p.enabled)).map((p) => p.key);
    save.mutate(muted);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Qué me avisa Oplex</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Elegí qué avisos querés recibir en la campana. Las menciones y las tareas que te asignan siempre llegan.
          </p>
        </DialogHeader>
        <div className="flex flex-col">
          {prefs.map((p) => (
            <div key={p.key} className="flex items-center justify-between gap-4 border-b py-2.5 last:border-0">
              <span className="text-sm">{p.label}</span>
              <button
                type="button"
                role="switch"
                aria-checked={p.enabled}
                aria-label={p.label}
                onClick={() => toggle(p.key)}
                disabled={save.isPending}
                className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${p.enabled ? 'bg-primary' : 'bg-muted-foreground/30'}`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${p.enabled ? 'translate-x-4' : ''}`}
                />
              </button>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Listo</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
