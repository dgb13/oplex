'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { INVITABLE_ROLES, ROLE_LABELS, teamApi, type CreatedMemberWithPassword, type TeamRole } from '@/lib/team';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';

type Mode = 'INVITE' | 'PASSWORD';

function pillClass(active: boolean): string {
  return `rounded-lg px-3 py-1.5 text-xs font-medium transition ${
    active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
  }`;
}

const selectClass =
  'h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

function errorMessage(err: unknown, fallback: string): string {
  const message = (err as AxiosError<{ message?: string | string[] }> | undefined)?.response?.data?.message;
  if (!message) return fallback;
  return Array.isArray(message) ? message.join(', ') : message;
}

export default function InviteMemberModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode>('INVITE');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<TeamRole>('SALES');
  const [error, setError] = useState('');
  const [created, setCreated] = useState<CreatedMemberWithPassword | null>(null);
  const [copied, setCopied] = useState(false);

  const inviteMutation = useMutation({
    mutationFn: () => teamApi.invite({ email, role }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['team-members'] });
      onClose();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => setError(errorMessage(err, 'No se pudo enviar la invitación')),
  });

  const createMutation = useMutation({
    mutationFn: () => teamApi.createWithPassword({ email, name: name || undefined, role }),
    onSuccess: (result) => {
      setError('');
      setCreated(result);
      void queryClient.invalidateQueries({ queryKey: ['team-members'] });
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => setError(errorMessage(err, 'No se pudo crear el usuario')),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!email.trim()) {
      setError('El email es obligatorio');
      return;
    }
    if (mode === 'INVITE') {
      inviteMutation.mutate();
    } else {
      createMutation.mutate();
    }
  }

  async function copyPassword() {
    if (!created) return;
    await navigator.clipboard.writeText(created.tempPassword);
    setCopied(true);
  }

  const isPending = inviteMutation.isPending || createMutation.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{created ? 'Usuario creado' : 'Invitar / Agregar colaborador'}</h2>
          <button onClick={onClose} className="text-muted-foreground transition hover:text-foreground">
            ✕
          </button>
        </div>

        {created ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm">
              Compartile esta contraseña temporal a <strong>{created.email}</strong> por un canal seguro - se le va a
              pedir que la cambie apenas inicie sesión.
            </p>
            <div className="flex items-center gap-2 rounded-lg border bg-muted px-3 py-2">
              <code className="flex-1 select-all font-mono text-sm">{created.tempPassword}</code>
              <Button type="button" variant="outline" size="xs" className="shrink-0" onClick={copyPassword}>
                {copied ? 'Copiado' : 'Copiar'}
              </Button>
            </div>
            <div className="mt-2 flex justify-end">
              <Button type="button" onClick={onClose}>
                Listo
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setMode('INVITE');
                  setError('');
                }}
                className={pillClass(mode === 'INVITE')}
              >
                Invitar por mail
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('PASSWORD');
                  setError('');
                }}
                className={pillClass(mode === 'PASSWORD')}
              >
                Alta con clave temporal
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              {mode === 'INVITE'
                ? 'Le mandamos un link para que elija su propia contraseña. Expira en unos días si no lo usa.'
                : 'Se crea la cuenta ahora mismo con una contraseña que vos le pasás - se la van a pedir cambiar al entrar.'}
            </p>

            <div className="flex flex-col gap-1">
              <label className="text-sm text-muted-foreground">Email</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nombre@empresa.com"
                required
              />
            </div>

            {mode === 'PASSWORD' && (
              <div className="flex flex-col gap-1">
                <label className="text-sm text-muted-foreground">Nombre (opcional)</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
            )}

            <div className="flex flex-col gap-1">
              <label className="text-sm text-muted-foreground">Rol</label>
              <select className={selectClass} value={role} onChange={(e) => setRole(e.target.value as TeamRole)}>
                {INVITABLE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="mt-2 flex justify-end gap-3">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? 'Enviando...' : mode === 'INVITE' ? 'Enviar invitación' : 'Crear usuario'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
