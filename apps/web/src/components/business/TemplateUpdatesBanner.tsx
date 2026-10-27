'use client';

import { Button } from '@/components/ui/button';
import { BUSINESS_MODULE_LABELS, businessProfileApi, type TemplateUpdateItem } from '@/lib/businessModules';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

const FIELD_TYPE_LABELS: Record<string, string> = {
  TEXT: 'texto',
  NUMBER: 'número',
  DATE: 'fecha',
  SELECT: 'lista',
  BOOLEAN: 'sí / no',
  VEHICLE_BRAND: 'lista de marcas',
  VEHICLE_MODEL: 'modelos según la marca',
};

const QUOTE_OUTCOME_TEXT = { ACCEPTED: 'acepta el presupuesto', REJECTED: 'rechaza el presupuesto' } as const;

function describe(item: TemplateUpdateItem): { title: string; detail: string } {
  switch (item.kind) {
    case 'module':
      return { title: 'Módulo', detail: BUSINESS_MODULE_LABELS[item.key] ?? item.key };
    case 'category':
      return { title: 'Categoría de artículos', detail: item.name };
    case 'assetField':
      return {
        title: `Campo nuevo en ${item.typeName}`,
        detail: `${item.field.label} (${FIELD_TYPE_LABELS[item.field.type] ?? item.field.type}${
          item.field.options?.length ? `: ${item.field.options.join(', ')}` : ''
        })`,
      };
    case 'fieldType':
      return {
        title: `Campo de ${item.typeName} que pasa a una lista`,
        detail:
          item.type === 'VEHICLE_BRAND'
            ? `${item.label}: se elige de la lista de marcas de ${item.vehicleKind === 'MOTO' ? 'motos' : 'autos'} (o se escribe a mano si no está)`
            : item.type === 'VEHICLE_MODEL'
              ? `${item.label}: se elige de los modelos de la marca (o se escribe a mano si no está)`
              : `${item.label} (${FIELD_TYPE_LABELS[item.type] ?? item.type})`,
      };
    case 'status':
      return {
        title: 'Estado nuevo de las órdenes',
        detail: `${item.name}${item.after ? `, después de "${item.after}"` : ''}${item.notifiesCustomer ? ' · avisa al cliente' : ''}${
          item.final ? ' · cierra la orden' : ''
        }${item.quoteOutcome ? ` · la orden pasa sola acá cuando el cliente ${QUOTE_OUTCOME_TEXT[item.quoteOutcome]}` : ''}`,
      };
    case 'statusQuote':
      return {
        title: 'Estado según el presupuesto',
        detail: `Cuando el cliente ${QUOTE_OUTCOME_TEXT[item.quoteOutcome]}, la orden pasa sola a "${item.name}"`,
      };
  }
}

/** "Hay novedades para tu rubro" (maqueta, pantalla 3): lo nuevo que Oplex
 * sumó a la plantilla. Se elige qué aplicar; aplicar sólo agrega. */
export default function TemplateUpdatesBanner() {
  const queryClient = useQueryClient();
  const updatesQuery = useQuery({ queryKey: ['business-template-updates'], queryFn: businessProfileApi.pendingUpdates });
  const updates = updatesQuery.data;
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [result, setResult] = useState('');

  // Todas tildadas al aparecer: lo habitual es querer las novedades.
  useEffect(() => {
    if (updates) setChecked(new Set(updates.items.map((i) => i.id)));
  }, [updates]);

  function done(message: string) {
    setResult(message);
    void queryClient.invalidateQueries({ queryKey: ['business-template-updates'] });
    void queryClient.invalidateQueries({ queryKey: ['business-profile'] });
    void queryClient.invalidateQueries({ queryKey: ['customer-asset-types'] });
    void queryClient.invalidateQueries({ queryKey: ['work-order-config'] });
  }
  const applyMutation = useMutation({
    mutationFn: () => businessProfileApi.applyUpdates([...checked]),
    onSuccess: ({ applied }) =>
      done(applied > 0 ? `Listo: se sumaron ${applied} novedad(es). Lo que ya tenías quedó igual.` : 'No elegiste ninguna novedad: no se cambió nada.'),
  });
  const dismissMutation = useMutation({
    mutationFn: businessProfileApi.dismissUpdates,
    onSuccess: () => done('No se cambió nada. Si Oplex publica algo más nuevo, te lo mostramos.'),
  });

  if (result) {
    return (
      <p role="status" className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300">
        {result}
      </p>
    );
  }
  if (!updates) return null;

  return (
    <section className="rounded-xl border border-orange-200 bg-orange-50 p-5 dark:border-orange-900 dark:bg-orange-950/30">
      <h2 className="text-base font-semibold text-orange-950 dark:text-orange-200">Hay novedades para tu rubro</h2>
      <p className="mt-1 text-sm text-orange-900 dark:text-orange-300">
        Oplex mejoró la plantilla de &quot;{updates.templateName}&quot;. Elegí qué querés sumar; lo que ya configuraste no se toca.
      </p>
      <div className="mt-3 flex flex-col gap-2">
        {updates.items.map((item) => {
          const { title, detail } = describe(item);
          return (
            <label key={item.id} className="flex min-h-8 cursor-pointer items-start gap-2.5 text-sm text-orange-950 dark:text-orange-100">
              <input
                type="checkbox"
                checked={checked.has(item.id)}
                onChange={(e) =>
                  setChecked((prev) => {
                    const next = new Set(prev);
                    if (e.target.checked) next.add(item.id);
                    else next.delete(item.id);
                    return next;
                  })
                }
                className="mt-0.5 h-4 w-4 shrink-0 accent-indigo-600"
              />
              <span>
                <strong>{title}</strong> — {detail}
              </span>
            </label>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button disabled={applyMutation.isPending || dismissMutation.isPending} onClick={() => applyMutation.mutate()}>
          Aplicar las elegidas
        </Button>
        <Button variant="outline" disabled={applyMutation.isPending || dismissMutation.isPending} onClick={() => dismissMutation.mutate()}>
          Ahora no
        </Button>
      </div>
    </section>
  );
}
