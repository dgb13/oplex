'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { remindersApi, tenantSettingsApi, type TenantSettings } from '@/lib/tenantSettings';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useEffect, useState } from 'react';

const PRESETS = [3, 5, 10];

function pillClass(active: boolean): string {
  return `rounded-lg px-3 py-1.5 text-xs font-medium transition ${
    active
      ? 'bg-primary text-primary-foreground'
      : 'bg-muted text-muted-foreground hover:text-foreground'
  }`;
}

/** Server sends a fixed instant (next 01:00); this only formats the
 * countdown to it and re-renders every minute (see the interval in
 * ReminderStatusCard) - it doesn't refetch that instant itself. */
function formatRemaining(targetIso: string, now: Date): string {
  const diffMs = new Date(targetIso).getTime() - now.getTime();
  if (diffMs <= 0) return 'en curso';
  const totalMinutes = Math.round(diffMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours === 0 ? `en ${minutes} min` : `en ${hours} h ${minutes} min`;
}

function errorMessage(err: AxiosError<{ message?: string | string[] }>, fallback: string): string {
  const message = err.response?.data?.message ?? fallback;
  return Array.isArray(message) ? message.join(', ') : message;
}

export default function RecordatoriosTab() {
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useQuery({
    queryKey: ['tenant-settings'],
    queryFn: tenantSettingsApi.get,
  });

  function invalidateBoth() {
    void queryClient.invalidateQueries({ queryKey: ['tenant-settings'] });
    // ReminderStatusCard reads the same interval via a separate query
    // (reminders-status also carries nextCronRunAt, which tenant-settings
    // doesn't) - without this it'd show the old value until its own 60s
    // refetch fires.
    void queryClient.invalidateQueries({ queryKey: ['reminders-status'] });
  }

  return (
    <div className="flex items-start gap-6">
      {isLoading || !settings ? (
        <div className="text-muted-foreground">Cargando...</div>
      ) : (
        <div className="flex-1">
          <ArReminderCard settings={settings} onSaved={invalidateBoth} />
        </div>
      )}
      <div className="flex-1">
        <ReminderStatusCard />
      </div>
    </div>
  );
}

function ArReminderCard({
  settings,
  onSaved,
}: {
  settings: TenantSettings;
  onSaved: () => void;
}) {
  const initialDays = settings.arReminderIntervalDays;
  const [enabled, setEnabled] = useState(initialDays !== null);
  const [preset, setPreset] = useState<number | 'custom'>(
    initialDays && (PRESETS as number[]).includes(initialDays)
      ? initialDays
      : initialDays
        ? 'custom'
        : PRESETS[0],
  );
  const [customDays, setCustomDays] = useState(
    initialDays && !(PRESETS as number[]).includes(initialDays) ? String(initialDays) : '',
  );
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const mutation = useMutation({
    mutationFn: () => {
      if (!enabled) {
        return tenantSettingsApi.update({ arReminderIntervalDays: null });
      }
      const days = preset === 'custom' ? Number(customDays) : preset;
      return tenantSettingsApi.update({ arReminderIntervalDays: days });
    },
    onSuccess: () => {
      setMessage('Guardado');
      onSaved();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      setError(errorMessage(err, 'No se pudo guardar la preferencia'));
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage('');
    setError('');
    if (enabled && preset === 'custom' && (!customDays.trim() || Number(customDays) < 1)) {
      setError('Ingresá una cantidad de días válida (1 o más)');
      return;
    }
    mutation.mutate();
  }

  return (
    <Card>
      <CardContent>
        <h2 className="mb-4 text-sm font-medium text-muted-foreground">Recordatorio de facturas vencidas</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            Recordar facturas vencidas de forma recurrente (por defecto se avisa una sola vez)
          </label>

          {enabled && (
            <div className="flex flex-col gap-2 pl-6">
              <p className="text-sm text-muted-foreground">Revisar cuentas a cobrar cada</p>
              <div className="flex flex-wrap items-center gap-2">
                {PRESETS.map((days) => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => setPreset(days)}
                    className={pillClass(preset === days)}
                  >
                    {days} días
                  </button>
                ))}
                <button type="button" onClick={() => setPreset('custom')} className={pillClass(preset === 'custom')}>
                  Otra
                </button>
                {preset === 'custom' && (
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    value={customDays}
                    onChange={(e) => setCustomDays(e.target.value)}
                    placeholder="días"
                    className="w-20"
                  />
                )}
              </div>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
          {message && <p className="text-sm text-green-600 dark:text-green-400">{message}</p>}
          <Button type="submit" disabled={mutation.isPending} className="self-start">
            {mutation.isPending ? 'Guardando...' : 'Guardar cambios'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function ReminderStatusCard() {
  const queryClient = useQueryClient();
  const [now, setNow] = useState(() => new Date());
  const { data: status } = useQuery({
    queryKey: ['reminders-status'],
    queryFn: remindersApi.getStatus,
    refetchInterval: 60_000,
  });
  const [actionMessage, setActionMessage] = useState('');
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const runNowMutation = useMutation({
    mutationFn: remindersApi.runNow,
    onSuccess: (result) => {
      setActionError('');
      setActionMessage(
        `Ejecutado: ${result.becomingOverdue} recién vencida(s), ${result.recurring} recordatorio(s) recurrente(s) enviados`,
      );
      void queryClient.invalidateQueries({ queryKey: ['reminders-status'] });
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      setActionMessage('');
      setActionError(errorMessage(err, 'No se pudo ejecutar el recordatorio'));
    },
  });

  const resetMutation = useMutation({
    mutationFn: remindersApi.reset,
    onSuccess: (result) => {
      setActionError('');
      setActionMessage(`Conteo reiniciado para ${result.reset} factura(s) vencida(s), sin enviar mails`);
      void queryClient.invalidateQueries({ queryKey: ['reminders-status'] });
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      setActionMessage('');
      setActionError(errorMessage(err, 'No se pudo reiniciar el conteo'));
    },
  });

  return (
    <Card>
      <CardContent>
        <h2 className="mb-4 text-sm font-medium text-muted-foreground">Estado del recordatorio automático</h2>
        {!status ? (
          <p className="text-sm text-muted-foreground">Cargando...</p>
        ) : (
          <div className="flex flex-col gap-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Recordatorio recurrente</span>
              <span>
                {status.recurringEnabled
                  ? `Cada ${status.arReminderIntervalDays} días`
                  : 'Desactivado (solo alerta única)'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Próxima corrida del cron</span>
              <span>{formatRemaining(status.nextCronRunAt, now)} (todos los días a la 01:00)</span>
            </div>
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3 border-t pt-4">
          <Button size="sm" variant="outline" onClick={() => runNowMutation.mutate()} disabled={runNowMutation.isPending}>
            {runNowMutation.isPending ? 'Ejecutando...' : 'Ejecutar recordatorio ahora'}
          </Button>
          <Button size="sm" variant="outline" onClick={() => resetMutation.mutate()} disabled={resetMutation.isPending}>
            {resetMutation.isPending ? 'Reiniciando...' : 'Reiniciar conteo (sin enviar mails)'}
          </Button>
        </div>
        {actionError && <p className="mt-3 text-xs text-destructive">{actionError}</p>}
        {actionMessage && <p className="mt-3 text-xs text-muted-foreground">{actionMessage}</p>}
      </CardContent>
    </Card>
  );
}
