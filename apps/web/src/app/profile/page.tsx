'use client';

import { activityLogApi } from '@/lib/activityLog';
import { initials, profileApi, type UserProfile } from '@/lib/profile';
import { disconnectSocket } from '@/lib/socket';
import { whatsAppLinkApi, type WhatsAppLinkRequestResult } from '@/lib/whatsappLink';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

const ROLE_LABELS: Record<string, string> = {
  OWNER: 'Dueño',
  ADMIN: 'Administrador',
  SALES: 'Ventas',
  PURCHASES: 'Compras',
  INVENTORY: 'Inventario',
  ACCOUNTANT: 'Contador',
  VIEWER: 'Solo lectura',
};

export default function ProfilePage() {
  const queryClient = useQueryClient();
  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile-me'],
    queryFn: profileApi.getMe,
  });

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Mi perfil</h1>
      {isLoading || !profile ? (
        <div className="text-slate-500">Cargando...</div>
      ) : (
        <>
          <AccountCard
            profile={profile}
            onSaved={() => void queryClient.invalidateQueries({ queryKey: ['profile-me'] })}
          />
          <PasswordCard />
          <WhatsAppLinkCard />
          <ActivityCard />
        </>
      )}
    </div>
  );
}

/** Formats a small set of relative-time buckets ("hace 2 horas") without
 * pulling in a date library for a handful of cases. */
function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'recién';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `hace ${days} día${days === 1 ? '' : 's'}`;
}

function ActivityCard() {
  const { data: entries, isLoading } = useQuery({
    queryKey: ['profile-activity'],
    queryFn: activityLogApi.getMine,
  });

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-6">
      <h2 className="mb-4 text-sm font-medium text-slate-600 dark:text-slate-400">Últimas acciones</h2>
      {isLoading || !entries ? (
        <p className="text-sm text-slate-500">Cargando...</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-slate-500">Todavía no hay actividad registrada.</p>
      ) : (
        <ul className="flex flex-col gap-2 text-sm">
          {entries.map((entry) => (
            <li key={entry.id} className="flex items-center justify-between gap-4">
              <span className="text-slate-700 dark:text-slate-300">{entry.action}</span>
              <span className="whitespace-nowrap text-xs text-slate-500">{formatRelative(entry.occurredAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AccountCard({ profile, onSaved }: { profile: UserProfile; onSaved: () => void }) {
  const [name, setName] = useState(profile.name ?? '');
  const [avatarUrl, setAvatarUrl] = useState(profile.avatarUrl ?? '');
  const [showOnlinePresence, setShowOnlinePresence] = useState(profile.showOnlinePresence);
  const [message, setMessage] = useState('');

  const mutation = useMutation({
    mutationFn: () => profileApi.updateMe({ name, avatarUrl, showOnlinePresence }),
    onSuccess: () => {
      setMessage('Guardado');
      onSaved();
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage('');
    mutation.mutate();
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-6">
      <h2 className="mb-4 text-sm font-medium text-slate-600 dark:text-slate-400">Datos de la cuenta</h2>

      <div className="mb-6 flex items-center gap-4">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt=""
            className="h-16 w-16 rounded-full border border-slate-300 dark:border-slate-700 object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-600 text-lg font-semibold text-white">
            {initials(profile.name, profile.email)}
          </div>
        )}
        <div>
          <p className="text-slate-800 dark:text-slate-200">{profile.name || profile.email}</p>
          <p className="text-xs text-slate-500">{profile.email}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Nombre">
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tu nombre"
          />
        </Field>
        <Field label="URL de avatar">
          <input
            className={inputClass}
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            placeholder="https://..."
          />
        </Field>
        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
          <input
            type="checkbox"
            checked={showOnlinePresence}
            onChange={(e) => setShowOnlinePresence(e.target.checked)}
          />
          Mostrar mi estado en línea a mis compañeros
        </label>

        <div className="grid grid-cols-2 gap-4 border-t border-slate-200 dark:border-slate-800 pt-4 text-xs sm:grid-cols-3">
          <div>
            <p className="text-slate-400 dark:text-slate-600">Rol</p>
            <p className="text-slate-700 dark:text-slate-300">{ROLE_LABELS[profile.role] ?? profile.role}</p>
          </div>
          <div>
            <p className="text-slate-400 dark:text-slate-600">Miembro desde</p>
            <p className="text-slate-700 dark:text-slate-300">
              {new Date(profile.createdAt).toLocaleDateString('es-AR')}
            </p>
          </div>
        </div>

        {message && <p className="text-sm text-green-600 dark:text-green-400">{message}</p>}
        <button
          type="submit"
          disabled={mutation.isPending}
          className="self-start rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
        >
          {mutation.isPending ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </form>
    </div>
  );
}

function PasswordCard() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const mutation = useMutation({
    mutationFn: () => profileApi.changePassword({ currentPassword, newPassword }),
    // El JWT actual quedó firmado con mustChangePassword=true (u otro claim
    // que haya cambiado) - ese claim no se actualiza solo hasta el próximo
    // login, así que cualquier otra ruta seguiría devolviendo 403 aunque la
    // contraseña ya haya cambiado en la base. Forzar un login nuevo evita
    // dejar al usuario en un estado roto/confuso (ver MustChangePasswordGuard).
    onSuccess: () => {
      setSuccess('Contraseña actualizada - iniciá sesión de nuevo');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => {
        localStorage.removeItem('token');
        localStorage.removeItem('tenantId');
        disconnectSocket();
        router.replace('/login');
      }, 1200);
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo cambiar la contraseña';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (newPassword !== confirmPassword) {
      setError('Las contraseñas nuevas no coinciden');
      return;
    }
    mutation.mutate();
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-6">
      <h2 className="mb-4 text-sm font-medium text-slate-600 dark:text-slate-400">Cambiar contraseña</h2>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Contraseña actual">
          <input
            type="password"
            className={inputClass}
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
        </Field>
        <Field label="Contraseña nueva">
          <input
            type="password"
            className={inputClass}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={8}
          />
        </Field>
        <Field label="Confirmar contraseña nueva">
          <input
            type="password"
            className={inputClass}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={8}
          />
        </Field>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        {success && <p className="text-sm text-green-600 dark:text-green-400">{success}</p>}
        <button
          type="submit"
          disabled={mutation.isPending}
          className="self-start rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
        >
          {mutation.isPending ? 'Actualizando...' : 'Cambiar contraseña'}
        </button>
      </form>
    </div>
  );
}

/** Fase 5a del asistente de IA (docs/plan-asistente-ia-conversacional.md,
 * sección 3.3) - genera un código, lo muestra en pantalla para que el
 * usuario lo mande por WhatsApp al número de Oplex. Todavía no hay
 * ningún lado que reciba ese mensaje (Fase 5b, pendiente de credenciales
 * de Meta) - por ahora esta tarjeta sólo cubre la mitad "pedir código"
 * del flujo; nunca acepta el código escrito acá mismo, porque eso no
 * probaría que el usuario tiene acceso real a ese WhatsApp. */
function WhatsAppLinkCard() {
  const queryClient = useQueryClient();
  const [phone, setPhone] = useState('');
  const [generated, setGenerated] = useState<WhatsAppLinkRequestResult | null>(null);
  const [error, setError] = useState('');

  const { data: status, isLoading } = useQuery({
    queryKey: ['whatsapp-link-status'],
    queryFn: whatsAppLinkApi.getStatus,
  });

  function invalidateStatus() {
    void queryClient.invalidateQueries({ queryKey: ['whatsapp-link-status'] });
  }

  const requestMutation = useMutation({
    mutationFn: () => whatsAppLinkApi.requestLink(phone),
    onSuccess: (result) => {
      setError('');
      setGenerated(result);
      invalidateStatus();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      setGenerated(null);
      const message = err.response?.data?.message ?? 'No se pudo generar el código';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: whatsAppLinkApi.unlink,
    onSuccess: () => {
      setError('');
      setGenerated(null);
      invalidateStatus();
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    requestMutation.mutate();
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-6">
      <h2 className="mb-1 text-sm font-medium text-slate-600 dark:text-slate-400">WhatsApp</h2>
      <p className="mb-4 text-xs text-slate-500">
        Vinculá tu número para consultarle al asistente de IA por WhatsApp más adelante - todavía no está activa la
        recepción de mensajes, esto sólo prepara la vinculación.
      </p>

      {isLoading || !status ? (
        <p className="text-sm text-slate-500">Cargando...</p>
      ) : status.linked ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-full bg-green-100 dark:bg-green-900/40 px-2 py-0.5 text-xs font-medium text-green-700 dark:text-green-400">
            Vinculado
          </span>
          <span className="text-sm text-slate-700 dark:text-slate-300">{status.phoneE164}</span>
          <button
            type="button"
            onClick={() => unlinkMutation.mutate()}
            disabled={unlinkMutation.isPending}
            className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 transition hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-50"
          >
            {unlinkMutation.isPending ? 'Desvinculando...' : 'Desvincular'}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
            <Field label="Número de WhatsApp">
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+54 9 11 1234-5678"
                className={`${inputClass} w-52`}
                required
              />
            </Field>
            <button
              type="submit"
              disabled={!phone.trim() || requestMutation.isPending}
              className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
            >
              {requestMutation.isPending ? 'Generando...' : generated || status.pending ? 'Generar otro código' : 'Generar código'}
            </button>
          </form>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          {generated ? (
            <div className="rounded-lg border border-indigo-200 dark:border-indigo-900 bg-indigo-50 dark:bg-indigo-950 p-4 text-sm">
              <p className="text-slate-700 dark:text-slate-300">
                Mandá este código por WhatsApp <span className="font-semibold">al número de Oplex</span> desde{' '}
                <span className="font-mono">{generated.phoneE164}</span>:
              </p>
              <p className="mt-2 font-mono text-2xl font-bold tracking-widest text-indigo-700 dark:text-indigo-400">{generated.code}</p>
              <p className="mt-2 text-xs text-slate-500">
                Vence a las {new Date(generated.expiresAt).toLocaleTimeString('es-AR')}. La recepción del mensaje todavía no está
                activa en esta versión.
              </p>
            </div>
          ) : (
            status.pending && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Ya generaste un código para {status.pending.phoneE164}, vence a las{' '}
                {new Date(status.pending.expiresAt).toLocaleTimeString('es-AR')}. Generá uno nuevo si no llegás a mandarlo a tiempo.
              </p>
            )
          )}
        </div>
      )}
    </div>
  );
}

const inputClass =
  'rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm text-slate-600 dark:text-slate-400">{label}</label>
      {children}
    </div>
  );
}
