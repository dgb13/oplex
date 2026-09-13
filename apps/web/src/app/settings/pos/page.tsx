'use client';

import CreateRegisterModal from '@/app/pos/CreateRegisterModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import ToggleSwitch from '@/components/ToggleSwitch';
import { profileApi } from '@/lib/profile';
import { posApi, type CashRegister } from '@/lib/pos';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { Check, Pencil, Plus, X } from 'lucide-react';
import { useState } from 'react';

// Misma extracción que TeamPage/CompanyFormModal - sin esto, un PATCH
// fallido no deja ningún rastro de qué salió mal.
function extractErrorMessage(err: unknown, fallback: string): string {
  const message = (err as AxiosError<{ message?: string | string[] }> | undefined)?.response?.data?.message;
  if (!message) return fallback;
  return Array.isArray(message) ? message.join(', ') : message;
}

export default function PosSettingsPage() {
  const { data: profile } = useQuery({ queryKey: ['profile-me'], queryFn: profileApi.getMe });
  const { data: registers, isLoading } = useQuery({
    queryKey: ['pos-registers', 'all'],
    queryFn: () => posApi.listRegisters(true),
  });
  const [creating, setCreating] = useState(false);

  const canManage = profile?.role === 'OWNER' || profile?.role === 'ADMIN';

  if (profile && !canManage) {
    return (
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold">Cajas (POS)</h1>
        <p className="text-sm text-muted-foreground">No tenés permiso para ver esta sección.</p>
      </div>
    );
  }

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Cajas (POS)</h1>
          <p className="text-sm text-muted-foreground">
            Administrá las cajas de Caja/POS: renombralas o activá/desactivalas.
          </p>
        </div>
        <Button type="button" className="shrink-0" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" />
          Nueva caja
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando cajas...</p>
      ) : !registers || registers.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no hay ninguna caja creada.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-xs text-muted-foreground">
                <th className="p-3">Nombre</th>
                <th className="p-3">Sucursal</th>
                <th className="p-3">Depósito</th>
                <th className="p-3">Estado</th>
              </tr>
            </thead>
            <tbody>
              {registers.map((register) => (
                <RegisterRow key={register.id} register={register} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating && <CreateRegisterModal onClose={() => setCreating(false)} />}
    </div>
  );
}

function RegisterRow({ register }: { register: CashRegister }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(register.name);
  const [feedback, setFeedback] = useState<{ text: string; isError: boolean } | null>(null);

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['pos-registers'] });
  }

  const renameMutation = useMutation({
    mutationFn: (newName: string) => posApi.updateRegister(register.id, { name: newName }),
    onSuccess: () => {
      setFeedback(null);
      setEditing(false);
      invalidate();
    },
    onError: (err) => setFeedback({ text: extractErrorMessage(err, 'No se pudo renombrar la caja'), isError: true }),
  });

  const activeMutation = useMutation({
    mutationFn: (active: boolean) => posApi.updateRegister(register.id, { active }),
    onSuccess: () => {
      setFeedback(null);
      invalidate();
    },
    onError: (err) => setFeedback({ text: extractErrorMessage(err, 'No se pudo aplicar el cambio'), isError: true }),
  });

  function submitRename() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === register.name) {
      setEditing(false);
      setName(register.name);
      return;
    }
    renameMutation.mutate(trimmed);
  }

  return (
    <tr className="border-b border-border/70 last:border-0">
      <td className="p-3">
        {editing ? (
          <div className="flex items-center gap-2">
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitRename();
                if (e.key === 'Escape') {
                  setEditing(false);
                  setName(register.name);
                }
              }}
              className="h-8"
            />
            <button
              type="button"
              onClick={submitRename}
              disabled={renameMutation.isPending}
              className="text-emerald-600 dark:text-emerald-400 transition hover:text-emerald-700 dark:hover:text-emerald-300 disabled:opacity-50"
              aria-label="Confirmar"
            >
              <Check className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setName(register.name);
              }}
              className="text-muted-foreground transition hover:text-foreground"
              aria-label="Cancelar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="font-medium">{register.name}</span>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-muted-foreground transition hover:text-foreground"
              aria-label="Renombrar"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        {feedback && (
          <div className={`mt-1 text-xs ${feedback.isError ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'}`}>
            {feedback.text}
          </div>
        )}
      </td>
      <td className="p-3 text-muted-foreground">{register.branch.name}</td>
      <td className="p-3 text-muted-foreground">{register.warehouse.name}</td>
      <td className="p-3">
        <div className="flex items-center gap-2">
          <ToggleSwitch
            checked={register.active}
            onChange={(checked) => activeMutation.mutate(checked)}
            label={register.active ? 'Activa' : 'Inactiva'}
          />
          <span className="text-xs text-muted-foreground">{register.active ? 'Activa' : 'Inactiva'}</span>
        </div>
      </td>
    </tr>
  );
}
