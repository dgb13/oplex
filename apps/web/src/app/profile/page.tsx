'use client';

import AvatarPickerModal from '@/components/AvatarPickerModal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { UserAvatar } from '@/components/UserAvatar';
import { activityLogApi } from '@/lib/activityLog';
import { profileApi, type UserProfile } from '@/lib/profile';
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
      <h1 className="text-xl font-semibold">Mi perfil</h1>
      {isLoading || !profile ? (
        <p className="text-sm text-muted-foreground">Cargando...</p>
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
    <Card>
      <CardContent>
        <h2 className="mb-4 text-sm font-medium text-muted-foreground">Últimas acciones</h2>
        {isLoading || !entries ? (
          <p className="text-sm text-muted-foreground">Cargando...</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay actividad registrada.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {entries.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-4">
                <span>{entry.action}</span>
                <span className="whitespace-nowrap text-xs text-muted-foreground">
                  {formatRelative(entry.occurredAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function AccountCard({ profile, onSaved }: { profile: UserProfile; onSaved: () => void }) {
  const [name, setName] = useState(profile.name ?? '');
  const [showOnlinePresence, setShowOnlinePresence] = useState(profile.showOnlinePresence);
  const [message, setMessage] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);

  const mutation = useMutation({
    mutationFn: () => profileApi.updateMe({ name, showOnlinePresence }),
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
    <Card>
      <CardContent>
        <h2 className="mb-4 text-sm font-medium text-muted-foreground">Datos de la cuenta</h2>

        <div className="mb-6 flex items-center gap-4">
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="group relative rounded-full transition hover:opacity-90"
            aria-label="Cambiar avatar"
          >
            <UserAvatar avatarUrl={profile.avatarUrl} name={profile.name} email={profile.email} size={64} />
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/0 text-[10px] font-medium text-transparent transition group-hover:bg-black/40 group-hover:text-white">
              Cambiar
            </span>
          </button>
          <div>
            <p>{profile.name || profile.email}</p>
            <p className="text-xs text-muted-foreground">{profile.email}</p>
          </div>
        </div>

        {pickerOpen && <AvatarPickerModal profile={profile} onClose={() => setPickerOpen(false)} />}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field label="Nombre">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre" />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showOnlinePresence}
              onChange={(e) => setShowOnlinePresence(e.target.checked)}
            />
            Mostrar mi estado en línea a mis compañeros
          </label>

          <div className="grid grid-cols-2 gap-4 border-t pt-4 text-xs sm:grid-cols-3">
            <div>
              <p className="text-muted-foreground">Rol</p>
              <p>{ROLE_LABELS[profile.role] ?? profile.role}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Miembro desde</p>
              <p>{new Date(profile.createdAt).toLocaleDateString('es-AR')}</p>
            </div>
          </div>

          {message && <p className="text-sm text-emerald-600 dark:text-emerald-400">{message}</p>}
          <Button type="submit" className="self-start" disabled={mutation.isPending}>
            {mutation.isPending ? 'Guardando...' : 'Guardar cambios'}
          </Button>
        </form>
      </CardContent>
    </Card>
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
    <Card>
      <CardContent>
        <h2 className="mb-4 text-sm font-medium text-muted-foreground">Cambiar contraseña</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field label="Contraseña actual">
            <Input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </Field>
          <Field label="Contraseña nueva">
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
            />
          </Field>
          <Field label="Confirmar contraseña nueva">
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
            />
          </Field>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {success && <p className="text-sm text-emerald-600 dark:text-emerald-400">{success}</p>}
          <Button type="submit" className="self-start" disabled={mutation.isPending}>
            {mutation.isPending ? 'Actualizando...' : 'Cambiar contraseña'}
          </Button>
        </form>
      </CardContent>
    </Card>
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
    <Card>
      <CardContent>
        <h2 className="mb-1 text-sm font-medium text-muted-foreground">WhatsApp</h2>
        <p className="mb-4 text-xs text-muted-foreground">
          Vinculá tu número para consultarle al asistente de IA por WhatsApp.
        </p>

        {isLoading || !status ? (
          <p className="text-sm text-muted-foreground">Cargando...</p>
        ) : status.linked ? (
          <div className="flex flex-wrap items-center gap-3">
            <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
              Vinculado
            </Badge>
            <span className="text-sm">{status.phoneE164}</span>
            <Button type="button" variant="outline" size="sm" onClick={() => unlinkMutation.mutate()} disabled={unlinkMutation.isPending}>
              {unlinkMutation.isPending ? 'Desvinculando...' : 'Desvincular'}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
              <Field label="Número de WhatsApp">
                <Input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+54 9 11 1234-5678"
                  className="w-52"
                  required
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Formato internacional completo, con código de país. Si es un celular argentino, incluí el "9"
                  después del 54 (ej: +54 9 11 1234-5678) - sin eso el asistente no va a poder responderte por
                  WhatsApp.
                </p>
              </Field>
              <Button type="submit" disabled={!phone.trim() || requestMutation.isPending}>
                {requestMutation.isPending
                  ? 'Generando...'
                  : generated || status.pending
                    ? 'Generar otro código'
                    : 'Generar código'}
              </Button>
            </form>

            {error && <p className="text-sm text-destructive">{error}</p>}

            {generated ? (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm">
                <p>
                  Desde <span className="font-mono">{generated.phoneE164}</span>, mandale este código por WhatsApp{' '}
                  {generated.businessPhoneDisplay ? (
                    <>
                      al número de Oplex{' '}
                      <span className="font-semibold font-mono">{generated.businessPhoneDisplay}</span>
                    </>
                  ) : (
                    <span className="font-semibold">al número de Oplex</span>
                  )}
                  :
                </p>
                <p className="mt-2 font-mono text-2xl font-bold tracking-widest text-primary">{generated.code}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Vence a las {new Date(generated.expiresAt).toLocaleTimeString('es-AR')}.
                </p>
              </div>
            ) : (
              status.pending && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Ya generaste un código para {status.pending.phoneE164}, vence a las{' '}
                  {new Date(status.pending.expiresAt).toLocaleTimeString('es-AR')}. Generá uno nuevo si no llegás a
                  mandarlo a tiempo.
                </p>
              )
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
