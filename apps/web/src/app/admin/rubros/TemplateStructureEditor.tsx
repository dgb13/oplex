'use client';

import type { BusinessTemplateConfig, TemplateAssetField, TemplateStatus } from '@/lib/businessModules';
import { ArrowDown, ArrowUp } from 'lucide-react';

type AssetType = NonNullable<BusinessTemplateConfig['assetType']>;
type WorkOrder = NonNullable<BusinessTemplateConfig['workOrder']>;

const FIELD_TYPES: { value: TemplateAssetField['type']; label: string }[] = [
  { value: 'TEXT', label: 'Texto' },
  { value: 'NUMBER', label: 'Número' },
  { value: 'DATE', label: 'Fecha' },
  { value: 'SELECT', label: 'Lista' },
  { value: 'BOOLEAN', label: 'Sí / No' },
];

const input = 'w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-100 placeholder:text-slate-500';
const small = 'text-xs text-slate-400 hover:text-slate-200';

function move<T>(list: T[], i: number, delta: number): T[] {
  const copy = [...list];
  const [item] = copy.splice(i, 1);
  copy.splice(i + delta, 0, item);
  return copy;
}

/** Ficha y estados de las órdenes de un rubro, en /admin/rubros. Los
 * negocios que ya lo usan reciben lo nuevo como "novedades" (sólo agregar). */
export default function TemplateStructureEditor({
  assetType,
  workOrder,
  onAssetType,
  onWorkOrder,
}: {
  assetType: AssetType | null;
  workOrder: WorkOrder | null;
  onAssetType: (value: AssetType | null) => void;
  onWorkOrder: (value: WorkOrder | null) => void;
}) {
  function setField(i: number, patch: Partial<TemplateAssetField>) {
    if (!assetType) return;
    onAssetType({ ...assetType, fields: assetType.fields.map((f, j) => (j === i ? { ...f, ...patch } : f)) });
  }
  function setStatus(i: number, patch: Partial<TemplateStatus>) {
    if (!workOrder) return;
    onWorkOrder({ ...workOrder, statuses: workOrder.statuses.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-white">Ficha del cliente</h2>
          {assetType ? (
            <button type="button" className={small} onClick={() => onAssetType(null)}>
              Sin ficha
            </button>
          ) : (
            <button
              type="button"
              className="text-xs font-semibold text-indigo-300 hover:underline"
              onClick={() =>
                onAssetType({ name: '', fields: [{ key: '', label: 'Identificación', type: 'TEXT', isIdentifier: true, required: true }] })
              }
            >
              + Agregar ficha
            </button>
          )}
        </div>
        {!assetType ? (
          <p className="mt-2 text-xs text-slate-500">Este rubro no usa fichas (vende directo al cliente).</p>
        ) : (
          <>
            <label className="mt-3 block text-xs font-semibold text-slate-400" htmlFor="tpl-asset-name">
              ¿Sobre qué trabaja? (Vehículo, Equipo, Mascota…)
            </label>
            <input id="tpl-asset-name" className={input} value={assetType.name} onChange={(e) => onAssetType({ ...assetType, name: e.target.value })} />
            <label className="mt-2 block text-xs font-semibold text-slate-400" htmlFor="tpl-asset-notice">
              Aviso (opcional)
            </label>
            <input
              id="tpl-asset-notice"
              className={input}
              value={assetType.notice ?? ''}
              onChange={(e) => onAssetType({ ...assetType, notice: e.target.value || undefined })}
            />
            <ul className="mt-3 flex flex-col gap-2">
              {assetType.fields.map((f, i) => (
                <li key={`${f.key}-${i}`} className="rounded-lg border border-slate-800 p-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <input aria-label="Nombre del campo" className={`${input} min-w-0 flex-[1_1_140px]`} value={f.label} onChange={(e) => setField(i, { label: e.target.value })} />
                    <select
                      aria-label="Tipo"
                      className={`${input} w-28`}
                      value={f.type}
                      onChange={(e) => setField(i, { type: e.target.value as TemplateAssetField['type'] })}
                    >
                      {FIELD_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {f.type === 'SELECT' && (
                    <input
                      aria-label="Opciones"
                      className={`${input} mt-1.5 text-xs`}
                      placeholder="Opciones separadas por coma"
                      value={(f.options ?? []).join(', ')}
                      onChange={(e) => setField(i, { options: e.target.value.split(',').map((o) => o.trimStart()) })}
                    />
                  )}
                  <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-slate-300">
                    <label className="flex items-center gap-1.5">
                      <input
                        type="radio"
                        name="tpl-identifier"
                        checked={Boolean(f.isIdentifier)}
                        onChange={() => onAssetType({ ...assetType, fields: assetType.fields.map((x, j) => ({ ...x, isIdentifier: j === i })) })}
                        className="accent-indigo-500"
                      />
                      Dato principal (para buscar)
                    </label>
                    <label className="flex items-center gap-1.5">
                      <input type="checkbox" checked={Boolean(f.required || f.isIdentifier)} disabled={f.isIdentifier} onChange={(e) => setField(i, { required: e.target.checked })} className="accent-indigo-500" />
                      Obligatorio
                    </label>
                    <span className="ml-auto flex gap-1">
                      <button type="button" aria-label="Subir" disabled={i === 0} onClick={() => onAssetType({ ...assetType, fields: move(assetType.fields, i, -1) })} className="rounded p-0.5 hover:bg-slate-800 disabled:opacity-30">
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" aria-label="Bajar" disabled={i === assetType.fields.length - 1} onClick={() => onAssetType({ ...assetType, fields: move(assetType.fields, i, 1) })} className="rounded p-0.5 hover:bg-slate-800 disabled:opacity-30">
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                      {!f.isIdentifier && (
                        <button type="button" className={small} onClick={() => onAssetType({ ...assetType, fields: assetType.fields.filter((_, j) => j !== i) })}>
                          Quitar
                        </button>
                      )}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="mt-2 text-xs font-semibold text-indigo-300 hover:underline"
              onClick={() => onAssetType({ ...assetType, fields: [...assetType.fields, { key: '', label: '', type: 'TEXT' }] })}
            >
              + Agregar campo
            </button>
            <p className="mt-2 text-xs text-slate-500">
              A los negocios que ya usan el rubro, un campo nuevo les llega como novedad. Quitar uno acá no se lo saca a nadie.
            </p>
          </>
        )}
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-white">Órdenes de trabajo</h2>
          {workOrder ? (
            <button type="button" className={small} onClick={() => onWorkOrder(null)}>
              Sin órdenes
            </button>
          ) : (
            <button
              type="button"
              className="text-xs font-semibold text-indigo-300 hover:underline"
              onClick={() =>
                onWorkOrder({
                  docName: 'Orden de trabajo',
                  statuses: [{ name: 'Recibido' }, { name: 'En proceso' }, { name: 'Listo para retirar', notifiesCustomer: true }, { name: 'Entregado', final: true }],
                })
              }
            >
              + Agregar órdenes
            </button>
          )}
        </div>
        {!workOrder ? (
          <p className="mt-2 text-xs text-slate-500">Este rubro no usa órdenes de trabajo.</p>
        ) : (
          <>
            <label className="mt-3 block text-xs font-semibold text-slate-400" htmlFor="tpl-doc">
              Cómo se llama el documento
            </label>
            <input id="tpl-doc" className={input} value={workOrder.docName} onChange={(e) => onWorkOrder({ ...workOrder, docName: e.target.value })} />
            <ul className="mt-3 flex flex-col gap-1.5">
              {workOrder.statuses.map((s, i) => (
                <li key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 p-2">
                  <span className="w-5 text-center text-xs text-slate-500">{i + 1}</span>
                  <input aria-label="Nombre del estado" className={`${input} min-w-0 flex-[1_1_140px]`} value={s.name} onChange={(e) => setStatus(i, { name: e.target.value })} />
                  <label className="flex items-center gap-1 text-xs text-slate-300">
                    <input type="checkbox" checked={Boolean(s.notifiesCustomer)} onChange={(e) => setStatus(i, { notifiesCustomer: e.target.checked })} className="accent-indigo-500" />
                    Avisa
                  </label>
                  <label className="flex items-center gap-1 text-xs text-slate-300">
                    <input type="checkbox" checked={Boolean(s.final)} onChange={(e) => setStatus(i, { final: e.target.checked })} className="accent-indigo-500" />
                    Cierra
                  </label>
                  <span className="flex gap-1">
                    <button type="button" aria-label="Subir" disabled={i === 0} onClick={() => onWorkOrder({ ...workOrder, statuses: move(workOrder.statuses, i, -1) })} className="rounded p-0.5 hover:bg-slate-800 disabled:opacity-30">
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" aria-label="Bajar" disabled={i === workOrder.statuses.length - 1} onClick={() => onWorkOrder({ ...workOrder, statuses: move(workOrder.statuses, i, 1) })} className="rounded p-0.5 hover:bg-slate-800 disabled:opacity-30">
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" className={small} onClick={() => onWorkOrder({ ...workOrder, statuses: workOrder.statuses.filter((_, j) => j !== i) })}>
                      Quitar
                    </button>
                  </span>
                </li>
              ))}
            </ul>
            <button type="button" className="mt-2 text-xs font-semibold text-indigo-300 hover:underline" onClick={() => onWorkOrder({ ...workOrder, statuses: [...workOrder.statuses, { name: '' }] })}>
              + Agregar estado
            </button>
            <p className="mt-2 text-xs text-slate-500">
              Un estado nuevo les llega a los negocios como novedad, en el lugar que ocupa acá.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
