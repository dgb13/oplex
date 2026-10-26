'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatMoney } from '@/lib/vatCost';
import { formatDate, formatDay, workOrderCostsApi, workOrdersApi, type WorkOrderCosts } from '@/lib/workOrders';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';

function errorMessage(err: unknown, fallback: string): string {
  const message = (err as AxiosError<{ message?: string | string[] }> | undefined)?.response?.data?.message;
  if (!message) return fallback;
  return Array.isArray(message) ? message.join(', ') : message;
}

const HOURS = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });

/** Costo y margen de una orden: horas, repuestos, compras para el trabajo
 * y lo cobrado. Dueño/admin/contador ven importes; Ventas sólo las horas. */
export default function WorkOrderCostsPanel({ orderId, role }: { orderId: string; role: string | undefined }) {
  const queryClient = useQueryClient();
  const costsQuery = useQuery({ queryKey: ['work-order-costs', orderId], queryFn: () => workOrderCostsApi.get(orderId) });
  const assigneesQuery = useQuery({ queryKey: ['work-order-assignees'], queryFn: workOrdersApi.assignees });
  const canLabor = role === 'OWNER' || role === 'ADMIN' || role === 'SALES';
  const canPurchases = role === 'OWNER' || role === 'ADMIN' || role === 'PURCHASES' || role === 'ACCOUNTANT';
  const seeMoney = role === 'OWNER' || role === 'ADMIN' || role === 'ACCOUNTANT';
  const ratesQuery = useQuery({ queryKey: ['work-order-labor-rates'], queryFn: workOrderCostsApi.rates, enabled: seeMoney });

  const [worker, setWorker] = useState('');
  const [hours, setHours] = useState('');
  const [rate, setRate] = useState('');
  const [note, setNote] = useState('');
  const [linking, setLinking] = useState(false);
  const [purchaseQuery, setPurchaseQuery] = useState('');
  const [error, setError] = useState('');

  const purchasesQuery = useQuery({
    queryKey: ['work-order-purchase-search', purchaseQuery],
    queryFn: () => workOrderCostsApi.searchPurchases(purchaseQuery.trim() || undefined),
    enabled: linking,
  });

  function saved(costs: WorkOrderCosts) {
    queryClient.setQueryData(['work-order-costs', orderId], costs);
    setError('');
  }
  const laborMutation = useMutation({
    mutationFn: () => {
      const user = assigneesQuery.data?.find((u) => u.name === worker.trim());
      return workOrderCostsApi.addLabor(orderId, {
        workerName: worker.trim(),
        userId: user?.id,
        hours: Number(hours.replace(',', '.')),
        costPerHour: rate.trim() ? Number(rate.replace(',', '.')) : undefined,
        note: note.trim() || undefined,
      });
    },
    onSuccess: (costs) => {
      saved(costs);
      setHours('');
      setNote('');
      void queryClient.invalidateQueries({ queryKey: ['work-order-labor-rates'] });
    },
    onError: (err) => setError(errorMessage(err, 'No se pudieron cargar las horas')),
  });
  const deleteMutation = useMutation({
    mutationFn: (laborId: string) => workOrderCostsApi.deleteLabor(orderId, laborId),
    onSuccess: saved,
    onError: (err) => setError(errorMessage(err, 'No se pudo borrar')),
  });
  const linkMutation = useMutation({
    mutationFn: ({ id, link }: { id: string; link: boolean }) => workOrderCostsApi.linkPurchase(orderId, id, link),
    onSuccess: (costs) => {
      saved(costs);
      void queryClient.invalidateQueries({ queryKey: ['work-order-purchase-search'] });
    },
    onError: (err) => setError(errorMessage(err, 'No se pudo vincular la compra')),
  });

  const costs = costsQuery.data;
  if (!costs) return null;

  function pickWorker(name: string) {
    setWorker(name);
    const known = ratesQuery.data?.[name];
    if (known !== undefined && !rate) setRate(String(known));
  }

  return (
    <section className="rounded-xl border bg-card p-5">
      <h2 className="text-base font-semibold">{seeMoney ? 'Costo y margen' : role === 'PURCHASES' ? 'Horas y compras' : 'Horas trabajadas'}</h2>

      {seeMoney && !costs.hidden && (
        <>
          <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2.5">
            <Kpi
              label={costs.income?.source === 'quote' ? 'Presupuestado (sin IVA)' : 'Facturado (sin IVA)'}
              value={costs.income ? formatMoney(costs.income.amount) : '—'}
            />
            <Kpi
              label={costs.parts?.source === 'estimate' ? 'Repuestos (estimado)' : 'Repuestos (costo)'}
              value={costs.parts ? formatMoney(costs.parts.amount) : '—'}
            />
            <Kpi label="Compras para el trabajo" value={formatMoney(costs.purchasesTotal)} />
            <Kpi label={`Horas (${HOURS.format(costs.laborHours)} h)`} value={formatMoney(costs.laborCost)} />
            <Kpi
              label={costs.marginPercent !== null ? `Margen · ${costs.marginPercent.toLocaleString('es-AR')}%` : 'Margen'}
              value={costs.margin !== null ? formatMoney(costs.margin) : '—'}
              tone={costs.margin === null ? undefined : costs.margin >= 0 ? 'good' : 'bad'}
            />
          </div>
          <ul className="mt-2 flex flex-col gap-0.5 text-xs text-muted-foreground">
            <li>Margen = ingreso sin IVA menos repuestos, compras para el trabajo y horas.</li>
            {costs.income?.source === 'quote' && <li>Todavía no se facturó: se usa lo presupuestado y el costo actual de los repuestos.</li>}
            {!costs.income && <li>Sin presupuesto ni factura todavía: no hay ingreso para calcular el margen.</li>}
            {(costs.parts?.missingCost ?? 0) > 0 && (
              <li className="text-amber-700 dark:text-amber-400">
                {costs.parts?.missingCost} repuesto(s) sin costo cargado: cuentan como $0.
              </li>
            )}
            {costs.laborWithoutCost > 0 && (
              <li className="text-amber-700 dark:text-amber-400">
                {costs.laborWithoutCost} carga(s) de horas sin costo por hora: cuentan como $0.
              </li>
            )}
          </ul>
        </>
      )}

      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

      <h3 className="mt-5 text-sm font-semibold">Horas</h3>
      {costs.labor.length === 0 ? (
        <p className="mt-1 text-sm text-muted-foreground">Todavía no se cargaron horas.</p>
      ) : (
        <ul className="mt-1 flex flex-col gap-1 text-sm">
          {costs.labor.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-lg bg-muted/40 px-3 py-1.5">
              <span className="text-muted-foreground">{formatDate(l.workedAt)}</span>
              <span className="font-medium">{l.workerName}</span>
              <span>{HOURS.format(l.hours)} h</span>
              {seeMoney && l.costPerHour !== null && <span className="text-muted-foreground">× {formatMoney(l.costPerHour)}/h</span>}
              {l.note && <span className="text-muted-foreground">· {l.note}</span>}
              {canLabor && (
                <button
                  type="button"
                  onClick={() => deleteMutation.mutate(l.id)}
                  className="ml-auto text-xs text-muted-foreground hover:text-foreground"
                  aria-label={`Borrar horas de ${l.workerName}`}
                >
                  Borrar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canLabor && (
        <form
          className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[1.4fr_0.6fr_0.8fr_1.4fr_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            if (!worker.trim() || !(Number(hours.replace(',', '.')) > 0)) return setError('Completá quién y cuántas horas');
            laborMutation.mutate();
          }}
        >
          <div>
            <label htmlFor="lab-worker" className="sr-only">
              Quién
            </label>
            <Input id="lab-worker" list="lab-workers" value={worker} onChange={(e) => pickWorker(e.target.value)} placeholder="Quién" />
            <datalist id="lab-workers">
              {(assigneesQuery.data ?? []).map((u) => (
                <option key={u.id} value={u.name} />
              ))}
              {Object.keys(ratesQuery.data ?? {}).map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </div>
          <div>
            <label htmlFor="lab-hours" className="sr-only">
              Horas
            </label>
            <Input id="lab-hours" inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} placeholder="Horas" />
          </div>
          {seeMoney ? (
            <div>
              <label htmlFor="lab-rate" className="sr-only">
                Costo por hora
              </label>
              <Input id="lab-rate" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="$ por hora" />
            </div>
          ) : (
            <span />
          )}
          <div>
            <label htmlFor="lab-note" className="sr-only">
              Nota
            </label>
            <Input id="lab-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Qué hizo (opcional)" />
          </div>
          <Button type="submit" disabled={laborMutation.isPending}>
            Cargar horas
          </Button>
        </form>
      )}

      {/* Compras ve las compras que vincula, sin ingreso ni margen. */}
      {(seeMoney ? !costs.hidden : role === 'PURCHASES') && (
        <>
          <h3 className="mt-5 text-sm font-semibold">Compras para este trabajo</h3>
          <p className="text-xs text-muted-foreground">El repuesto o la tornería que compraste especialmente para esta orden.</p>
          {costs.purchases.length > 0 && (
            <ul className="mt-1 flex flex-col gap-1 text-sm">
              {costs.purchases.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-x-3 rounded-lg bg-muted/40 px-3 py-1.5">
                  <span className="text-muted-foreground">{formatDay(p.date)}</span>
                  <span className="font-medium">{p.supplier}</span>
                  <span className="font-mono text-xs">{p.number}</span>
                  <span>{formatMoney(p.amount)}</span>
                  {canPurchases && (
                    <button type="button" onClick={() => linkMutation.mutate({ id: p.id, link: false })} className="ml-auto text-xs text-muted-foreground hover:text-foreground">
                      Quitar
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {canPurchases &&
            (linking ? (
              <div className="mt-2 rounded-lg border p-3">
                <label htmlFor="purchase-q" className="text-sm text-muted-foreground">
                  Buscá la factura de compra (proveedor, número o nota)
                </label>
                <Input id="purchase-q" value={purchaseQuery} onChange={(e) => setPurchaseQuery(e.target.value)} className="mt-1" autoFocus />
                <ul className="mt-2 flex max-h-60 flex-col gap-1 overflow-y-auto text-sm">
                  {(purchasesQuery.data ?? [])
                    .filter((p) => p.workOrderId !== orderId)
                    .map((p) => (
                      <li key={p.id} className="flex flex-wrap items-center gap-x-3 rounded-lg px-2 py-1 hover:bg-muted/50">
                        <span className="text-muted-foreground">{formatDay(p.date)}</span>
                        <span>{p.supplier}</span>
                        <span className="font-mono text-xs">{p.number}</span>
                        <span>{formatMoney(p.amount)}</span>
                        {p.workOrderId ? (
                          <span className="ml-auto text-xs text-muted-foreground">En otra orden</span>
                        ) : (
                          <button type="button" onClick={() => linkMutation.mutate({ id: p.id, link: true })} className="ml-auto text-xs font-medium text-indigo-600 hover:underline">
                            Sumar a esta orden
                          </button>
                        )}
                      </li>
                    ))}
                </ul>
                <Button size="sm" variant="ghost" className="mt-2" onClick={() => setLinking(false)}>
                  Listo
                </Button>
              </div>
            ) : (
              <button type="button" onClick={() => setLinking(true)} className="mt-2 text-sm font-medium text-indigo-600 hover:underline">
                + Sumar una compra
              </button>
            ))}
        </>
      )}
    </section>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  return (
    <div
      className={`rounded-lg border p-3 ${
        tone === 'good' ? 'bg-green-50 dark:bg-green-950/30' : tone === 'bad' ? 'bg-red-50 dark:bg-red-950/30' : ''
      }`}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`mt-0.5 text-lg font-bold ${
          tone === 'good' ? 'text-green-800 dark:text-green-300' : tone === 'bad' ? 'text-red-700 dark:text-red-300' : ''
        }`}
      >
        {value}
      </p>
    </div>
  );
}
