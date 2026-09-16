'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Select from '@/components/ui/Select';
import { calendarApi, type CalendarEventKind, type CreateCalendarEventInput } from '@/lib/calendar';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';

interface Props {
  defaultDate: string; // YYYY-MM-DD
  onClose: () => void;
}

const KIND_OPTIONS: { value: CalendarEventKind; label: string }[] = [
  { value: 'CUSTOM', label: 'Propio' },
  { value: 'MEETING', label: 'Reunión' },
  { value: 'TASK', label: 'Tarea' },
  { value: 'REMINDER', label: 'Recordatorio' },
];

function toDatetimeLocal(date: string): string {
  return `${date}T09:00`;
}

/** Crear un evento propio - editar queda para una vuelta futura (el
 * borrado ya cubre el caso de "me equivoqué", ver DayPanel). */
export default function EventDialog({ defaultDate, onClose }: Props) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [startsAt, setStartsAt] = useState(toDatetimeLocal(defaultDate));
  const [kind, setKind] = useState<CalendarEventKind>('CUSTOM');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () => {
      const input: CreateCalendarEventInput = { title: title.trim(), startsAt: new Date(startsAt).toISOString(), kind };
      return calendarApi.createEvent(input);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['calendar-entries'] });
      onClose();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo crear el evento';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!title.trim()) {
      setError('El título es obligatorio');
      return;
    }
    mutation.mutate();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Agregar evento propio</h2>
          <button onClick={onClose} className="text-muted-foreground transition hover:text-foreground">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm text-muted-foreground">Título</label>
            <Input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Reunión con contador externo"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-muted-foreground">Fecha y hora</label>
            <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-muted-foreground">Tipo</label>
            <Select value={kind} onChange={(value) => setKind(value as CalendarEventKind)} options={KIND_OPTIONS} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="mt-2 flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Creando...' : 'Crear evento'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
