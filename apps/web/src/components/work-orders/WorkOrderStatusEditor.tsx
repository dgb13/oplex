'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Select from '@/components/ui/Select';
import { workOrdersApi, type QuoteOutcome, type WorkOrderConfig, type WorkOrderStatus } from '@/lib/workOrders';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { useState } from 'react';

type Draft = Partial<WorkOrderStatus> & { name: string; key: string };

function toDrafts(config: WorkOrderConfig): Draft[] {
  return config.statuses.map((s) => ({ ...s, key: s.id }));
}

/** Estados de las órdenes de trabajo y cómo se llama el documento. Uno que
 * no se usa más se desactiva (las órdenes viejas lo conservan). */
export default function WorkOrderStatusEditor() {
  const configQuery = useQuery({ queryKey: ['work-order-config'], queryFn: workOrdersApi.config });
  if (!configQuery.data) return null;
  return <Editor key={configQuery.dataUpdatedAt} config={configQuery.data} />;
}

function Editor({ config }: { config: WorkOrderConfig }) {
  const queryClient = useQueryClient();
  const [docName, setDocName] = useState(config.docName);
  const [statuses, setStatuses] = useState<Draft[]>(() => toDrafts(config));
  const [message, setMessage] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      workOrdersApi.updateConfig({
        docName: docName.trim(),
        statuses: statuses.map((s) => ({
          ...(s.id ? { id: s.id } : {}),
          name: s.name,
          isFinal: Boolean(s.isFinal),
          notifiesCustomer: Boolean(s.notifiesCustomer),
          ...(s.quoteOutcome && s.active !== false ? { quoteOutcome: s.quoteOutcome } : {}),
          active: s.active !== false,
        })),
      }),
    onSuccess: (saved) => {
      queryClient.setQueryData(['work-order-config'], saved);
      setMessage('Guardado.');
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const m = err.response?.data?.message ?? 'No se pudo guardar';
      setMessage(Array.isArray(m) ? m.join(', ') : m);
    },
  });

  function update(i: number, patch: Partial<Draft>) {
    setMessage('');
    setStatuses((list) => list.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  }
  /** Un solo estado por respuesta: elegir uno le saca la marca al anterior. */
  function setOutcome(outcome: QuoteOutcome, key: string) {
    setMessage('');
    setStatuses((list) =>
      list.map((s) =>
        s.key === key ? { ...s, quoteOutcome: outcome } : s.quoteOutcome === outcome ? { ...s, quoteOutcome: null } : s,
      ),
    );
  }
  const outcomeOptions = [
    { value: '', label: 'No cambia sola' },
    ...statuses.filter((s) => s.active !== false && s.name.trim()).map((s) => ({ value: s.key, label: s.name })),
  ];
  function outcomeKey(outcome: QuoteOutcome): string {
    return statuses.find((s) => s.quoteOutcome === outcome && s.active !== false)?.key ?? '';
  }

  function move(i: number, delta: number) {
    setStatuses((list) => {
      const copy = [...list];
      const [item] = copy.splice(i, 1);
      copy.splice(i + delta, 0, item);
      return copy;
    });
  }

  return (
    <section className="rounded-xl border bg-card p-5">
      <h2 className="text-base font-semibold">Tus {config.pluralName.toLowerCase()}</h2>
      <p className="mb-3 text-sm text-muted-foreground">
        Los pasos de cada trabajo. El que avisa muestra &quot;Avisar por WhatsApp&quot;; el que cierra la saca de las abiertas.
      </p>
      <div className="mb-3 flex max-w-sm flex-col gap-1">
        <label htmlFor="wo-docname" className="text-sm text-muted-foreground">
          Cómo se llama el documento
        </label>
        <Input id="wo-docname" value={docName} onChange={(e) => setDocName(e.target.value)} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th className="py-2 pr-2">Orden</th>
              <th className="py-2 pr-2">Estado</th>
              <th className="py-2 pr-2">Avisa al cliente</th>
              <th className="py-2 pr-2">Cierra la orden</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {statuses.map((s, i) => (
              <tr key={s.key} className={`border-b last:border-0 ${s.active === false ? 'opacity-50' : ''}`}>
                <td className="py-2 pr-2">
                  <div className="flex gap-0.5">
                    <button type="button" aria-label="Subir" disabled={i === 0} onClick={() => move(i, -1)} className="rounded p-1 hover:bg-muted disabled:opacity-30">
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" aria-label="Bajar" disabled={i === statuses.length - 1} onClick={() => move(i, 1)} className="rounded p-1 hover:bg-muted disabled:opacity-30">
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
                <td className="py-2 pr-2">
                  <Input aria-label="Nombre del estado" value={s.name} onChange={(e) => update(i, { name: e.target.value })} disabled={s.active === false} />
                </td>
                <td className="py-2 pr-2">
                  <input
                    type="checkbox"
                    aria-label={`${s.name} avisa al cliente`}
                    checked={Boolean(s.notifiesCustomer)}
                    onChange={(e) => update(i, { notifiesCustomer: e.target.checked })}
                    className="h-4 w-4 accent-indigo-600"
                  />
                </td>
                <td className="py-2 pr-2">
                  <input
                    type="checkbox"
                    aria-label={`${s.name} cierra la orden`}
                    checked={Boolean(s.isFinal)}
                    onChange={(e) => update(i, { isFinal: e.target.checked })}
                    className="h-4 w-4 accent-indigo-600"
                  />
                </td>
                <td className="py-2 text-right">
                  {s.id ? (
                    <button type="button" onClick={() => update(i, { active: s.active === false })} className="text-xs text-muted-foreground hover:text-foreground">
                      {s.active === false ? 'Activar' : 'Desactivar'}
                    </button>
                  ) : (
                    <button type="button" onClick={() => setStatuses((list) => list.filter((_, j) => j !== i))} className="text-xs text-muted-foreground hover:text-foreground">
                      Quitar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 rounded-lg border bg-muted/30 p-3">
        <p className="text-sm font-medium">Cuando el cliente responde el presupuesto</p>
        <p className="mb-2 text-xs text-muted-foreground">
          Si la orden tiene un presupuesto vinculado, pasa sola a este estado cuando lo marcás aceptado o rechazado.
        </p>
        <div className="grid max-w-xl gap-3 sm:grid-cols-2">
          {(
            [
              ['ACCEPTED', 'Si lo acepta, pasa a'],
              ['REJECTED', 'Si lo rechaza, pasa a'],
            ] as const
          ).map(([outcome, label]) => (
            <div key={outcome} className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">{label}</span>
              <Select
                value={outcomeKey(outcome)}
                onChange={(key) =>
                  key
                    ? setOutcome(outcome, key)
                    : setStatuses((list) => list.map((s) => (s.quoteOutcome === outcome ? { ...s, quoteOutcome: null } : s)))
                }
                options={outcomeOptions}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => setStatuses((list) => [...list, { key: `new-${Date.now()}`, name: '', active: true }])}
        >
          + Agregar estado
        </Button>
        <Button type="button" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
          {mutation.isPending ? 'Guardando…' : 'Guardar estados'}
        </Button>
        {message && <span className="text-sm text-muted-foreground">{message}</span>}
      </div>
    </section>
  );
}
