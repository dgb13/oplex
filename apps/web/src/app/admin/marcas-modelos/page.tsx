'use client';

import type { VehicleKind } from '@/lib/customerAssets';
import { adminVehicleCatalogApi, type AdminVehicleBrand, type VehicleSuggestion } from '@/lib/vehicleCatalog';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import AdminSelect from '../AdminSelect';

function extractErrorMessage(err: unknown, fallback: string): string {
  const message = (err as AxiosError<{ message?: string | string[] }> | undefined)?.response?.data?.message;
  if (!message) return fallback;
  return Array.isArray(message) ? message.join(', ') : message;
}

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

const KIND_LABEL: Record<VehicleKind, string> = { AUTO: 'Autos', MOTO: 'Motos' };
const input =
  'w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500';
const linkButton = 'text-xs font-semibold text-indigo-300 hover:text-indigo-200 disabled:opacity-50';
const ghostButton = 'text-xs font-semibold text-slate-400 hover:text-slate-200 disabled:opacity-50';

function ReviewBadge() {
  return <span className="rounded-full bg-orange-500/15 px-2 py-0.5 text-[11px] font-semibold text-orange-300">A revisar</span>;
}

function HiddenBadge() {
  return <span className="rounded-full bg-slate-700 px-2 py-0.5 text-[11px] font-semibold text-slate-300">Oculta</span>;
}

/**
 * /admin › Marcas y modelos: la lista que ven los rubros con vehículos al
 * cargar una ficha, y lo que los negocios escribieron a mano ("Otra, no
 * está en la lista"). Renombrar, ocultar o unir no toca las fichas ya
 * cargadas: guardan el texto.
 */
export default function AdminVehicleCatalogPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<VehicleKind | 'suggestions'>('AUTO');
  const kind: VehicleKind = tab === 'MOTO' ? 'MOTO' : 'AUTO';
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newBrand, setNewBrand] = useState('');
  const [newModel, setNewModel] = useState('');
  const [editing, setEditing] = useState<{ id: string; value: string; kind: 'brand' | 'model' } | null>(null);
  const [error, setError] = useState('');

  const autosQuery = useQuery({ queryKey: ['admin-vehicle-catalog', 'AUTO'], queryFn: () => adminVehicleCatalogApi.list('AUTO') });
  const motosQuery = useQuery({ queryKey: ['admin-vehicle-catalog', 'MOTO'], queryFn: () => adminVehicleCatalogApi.list('MOTO') });
  const suggestionsQuery = useQuery({ queryKey: ['admin-vehicle-suggestions'], queryFn: adminVehicleCatalogApi.suggestions });
  const catalogs: Record<VehicleKind, AdminVehicleBrand[]> = { AUTO: autosQuery.data ?? [], MOTO: motosQuery.data ?? [] };
  const brands = catalogs[kind];
  const suggestions = suggestionsQuery.data ?? [];

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    return brands.filter((b) => !q || normalize(b.name).includes(q));
  }, [brands, query]);
  const selected = brands.find((b) => b.id === selectedId) ?? filtered[0] ?? null;
  const toReview = [...catalogs.AUTO, ...catalogs.MOTO].reduce(
    (n, b) => n + (b.reviewed ? 0 : 1) + b.models.filter((m) => !m.reviewed).length,
    0,
  );

  function refresh() {
    setError('');
    void queryClient.invalidateQueries({ queryKey: ['admin-vehicle-catalog'] });
    void queryClient.invalidateQueries({ queryKey: ['admin-vehicle-suggestions'] });
    // La misma pestaña puede tener abierta la carga de una ficha.
    void queryClient.invalidateQueries({ queryKey: ['vehicle-catalog'] });
  }
  const onError = (err: unknown) => setError(extractErrorMessage(err, 'No se pudo guardar'));

  const brandMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { name?: string; active?: boolean; reviewed?: boolean } }) =>
      adminVehicleCatalogApi.updateBrand(id, patch),
    onSuccess: () => {
      setEditing(null);
      refresh();
    },
    onError,
  });
  const modelMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { name?: string; active?: boolean; reviewed?: boolean } }) =>
      adminVehicleCatalogApi.updateModel(id, patch),
    onSuccess: () => {
      setEditing(null);
      refresh();
    },
    onError,
  });
  const createBrandMutation = useMutation({
    mutationFn: () => adminVehicleCatalogApi.createBrand(kind, newBrand.trim()),
    onSuccess: (created: { id: string }) => {
      setNewBrand('');
      setSelectedId(created.id);
      setQuery('');
      refresh();
    },
    onError,
  });
  const createModelMutation = useMutation({
    mutationFn: (brandId: string) => adminVehicleCatalogApi.createModel(brandId, newModel.trim()),
    onSuccess: () => {
      setNewModel('');
      refresh();
    },
    onError,
  });
  // Marca revisada = la marca y todos sus modelos.
  const reviewAllMutation = useMutation({
    mutationFn: async (brand: AdminVehicleBrand) => {
      if (!brand.reviewed) await adminVehicleCatalogApi.updateBrand(brand.id, { reviewed: true });
      for (const m of brand.models.filter((x) => !x.reviewed)) await adminVehicleCatalogApi.updateModel(m.id, { reviewed: true });
    },
    onSuccess: refresh,
    onError,
  });

  function saveEdit() {
    if (!editing || !editing.value.trim()) return;
    if (editing.kind === 'brand') brandMutation.mutate({ id: editing.id, patch: { name: editing.value.trim() } });
    else modelMutation.mutate({ id: editing.id, patch: { name: editing.value.trim() } });
  }

  const tabButton = (value: typeof tab, label: string) => (
    <button
      role="tab"
      aria-selected={tab === value}
      onClick={() => {
        setTab(value);
        setSelectedId(null);
        setQuery('');
        setError('');
      }}
      className={`rounded-md px-3 py-1.5 text-xs font-semibold ${tab === value ? 'bg-slate-700 text-white' : 'text-slate-400'}`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex max-w-7xl flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Marcas y modelos de vehículos</h1>
          <p className="text-sm text-slate-400">
            La lista que ven los rubros con vehículos (taller, gomería, lubricentro, motos…) al cargar una ficha.
          </p>
        </div>
        <div role="tablist" className="flex gap-1 rounded-lg border border-slate-800 bg-slate-900 p-1">
          {tabButton('AUTO', `Autos (${catalogs.AUTO.length})`)}
          {tabButton('MOTO', `Motos (${catalogs.MOTO.length})`)}
          {tabButton('suggestions', `Escritas a mano${suggestions.length > 0 ? ` (${suggestions.length})` : ''}`)}
        </div>
      </div>

      {toReview > 0 && (
        <div className="flex gap-2.5 rounded-xl border border-orange-500/30 bg-orange-500/10 px-4 py-3 text-sm text-orange-100">
          <TriangleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-orange-300" />
          <p>
            <b>Lista inicial armada por Oplex, sin verificar contra una fuente oficial.</b> Quedan {toReview} marcas y modelos{' '}
            <b>A revisar</b>: corregí lo que haga falta y tocá &quot;Marcar como revisada&quot; en cada marca.
          </p>
        </div>
      )}

      {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}

      {tab === 'suggestions' ? (
        <SuggestionsTable suggestions={suggestions} catalogs={catalogs} onDone={refresh} onError={onError} />
      ) : (
        <div className="flex flex-wrap gap-5">
          <section aria-label="Marcas" className="min-w-0 flex-[1_1_280px] self-start rounded-xl border border-slate-800 bg-slate-900 p-4">
            <label htmlFor="marca-q" className="mb-1 block text-xs font-semibold text-slate-400">
              Buscar marca
            </label>
            <input id="marca-q" value={query} onChange={(e) => setQuery(e.target.value)} className={input} />
            <form
              className="mt-2 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (newBrand.trim()) createBrandMutation.mutate();
              }}
            >
              <input
                aria-label="Marca nueva"
                value={newBrand}
                onChange={(e) => setNewBrand(e.target.value)}
                placeholder={`Marca nueva de ${KIND_LABEL[kind].toLowerCase()}`}
                className={input}
              />
              <button
                type="submit"
                disabled={!newBrand.trim() || createBrandMutation.isPending}
                className="shrink-0 rounded-lg bg-indigo-600 px-3 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                Agregar
              </button>
            </form>
            <div className="mt-3 max-h-[65vh] overflow-y-auto pr-1">
              {(autosQuery.isLoading || motosQuery.isLoading) && <p className="p-2 text-sm text-slate-500">Cargando…</p>}
              {filtered.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(b.id);
                    setEditing(null);
                    setError('');
                  }}
                  className={`flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm ${
                    selected?.id === b.id ? 'bg-indigo-500/15 font-semibold text-white' : 'text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  <span className={b.active ? '' : 'text-slate-500 line-through'}>{b.name}</span>
                  <span className="flex shrink-0 items-center gap-2 text-xs text-slate-500">
                    {b.models.length} modelos
                    {!b.active && <HiddenBadge />}
                    {(!b.reviewed || b.models.some((m) => !m.reviewed)) && <ReviewBadge />}
                  </span>
                </button>
              ))}
            </div>
          </section>

          {selected && (
            <section aria-label="Modelos" className="min-w-0 flex-[2_1_420px] self-start rounded-xl border border-slate-800 bg-slate-900 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                {editing?.kind === 'brand' && editing.id === selected.id ? (
                  <form
                    className="flex flex-[1_1_240px] gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      saveEdit();
                    }}
                  >
                    <input
                      aria-label="Nombre de la marca"
                      value={editing.value}
                      onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                      className={input}
                      autoFocus
                    />
                    <button type="submit" className={linkButton}>
                      Guardar
                    </button>
                    <button type="button" onClick={() => setEditing(null)} className={ghostButton}>
                      Cancelar
                    </button>
                  </form>
                ) : (
                  <h2 className="text-base font-semibold text-white">
                    Modelos de {selected.name} {!selected.active && <HiddenBadge />}
                  </h2>
                )}
                <div className="flex flex-wrap items-center gap-3">
                  {(!selected.reviewed || selected.models.some((m) => !m.reviewed)) && (
                    <button
                      type="button"
                      onClick={() => reviewAllMutation.mutate(selected)}
                      disabled={reviewAllMutation.isPending}
                      className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                    >
                      Marcar como revisada
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setEditing({ id: selected.id, value: selected.name, kind: 'brand' })}
                    className={linkButton}
                  >
                    Renombrar marca
                  </button>
                  <button
                    type="button"
                    onClick={() => brandMutation.mutate({ id: selected.id, patch: { active: !selected.active } })}
                    className={ghostButton}
                  >
                    {selected.active ? 'Ocultar marca' : 'Volver a mostrar'}
                  </button>
                </div>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Renombrar u ocultar no cambia las fichas ya cargadas: guardan el texto tal como se eligió.
              </p>

              <ul className="mt-3 divide-y divide-slate-800">
                {selected.models.map((m) => (
                  <li key={m.id} className="flex min-h-11 flex-wrap items-center justify-between gap-2 py-1.5 text-sm">
                    {editing?.kind === 'model' && editing.id === m.id ? (
                      <form
                        className="flex flex-[1_1_240px] gap-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          saveEdit();
                        }}
                      >
                        <input
                          aria-label="Nombre del modelo"
                          value={editing.value}
                          onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                          className={input}
                          autoFocus
                        />
                        <button type="submit" className={linkButton}>
                          Guardar
                        </button>
                        <button type="button" onClick={() => setEditing(null)} className={ghostButton}>
                          Cancelar
                        </button>
                      </form>
                    ) : (
                      <>
                        <span className={`flex items-center gap-2 ${m.active ? 'text-slate-100' : 'text-slate-500 line-through'}`}>
                          {m.name}
                          {!m.reviewed && <ReviewBadge />}
                        </span>
                        <span className="flex items-center gap-3">
                          <button type="button" onClick={() => setEditing({ id: m.id, value: m.name, kind: 'model' })} className={linkButton}>
                            Renombrar
                          </button>
                          <button
                            type="button"
                            onClick={() => modelMutation.mutate({ id: m.id, patch: { active: !m.active } })}
                            className={ghostButton}
                          >
                            {m.active ? 'Ocultar' : 'Mostrar'}
                          </button>
                        </span>
                      </>
                    )}
                  </li>
                ))}
                {selected.models.length === 0 && <li className="py-3 text-sm text-slate-500">Todavía no tiene modelos.</li>}
              </ul>
              <form
                className="mt-3 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (newModel.trim()) createModelMutation.mutate(selected.id);
                }}
              >
                <input
                  aria-label="Modelo nuevo"
                  value={newModel}
                  onChange={(e) => setNewModel(e.target.value)}
                  placeholder={`Modelo nuevo de ${selected.name}`}
                  className={input}
                />
                <button
                  type="submit"
                  disabled={!newModel.trim() || createModelMutation.isPending}
                  className="shrink-0 rounded-lg bg-indigo-600 px-3 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  Agregar
                </button>
              </form>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

/** Lo que los negocios eligieron como "Otra / Otro, no está en la lista". */
function SuggestionsTable({
  suggestions,
  catalogs,
  onDone,
  onError,
}: {
  suggestions: VehicleSuggestion[];
  catalogs: Record<VehicleKind, AdminVehicleBrand[]>;
  onDone: () => void;
  onError: (err: unknown) => void;
}) {
  const [mergeTarget, setMergeTarget] = useState<Record<string, string>>({});
  const addMutation = useMutation({ mutationFn: adminVehicleCatalogApi.addSuggestion, onSuccess: onDone, onError });
  const mergeMutation = useMutation({
    mutationFn: ({ id, targetId }: { id: string; targetId: string }) => adminVehicleCatalogApi.mergeSuggestion(id, targetId),
    onSuccess: onDone,
    onError,
  });
  const discardMutation = useMutation({ mutationFn: adminVehicleCatalogApi.discardSuggestion, onSuccess: onDone, onError });

  function targets(s: VehicleSuggestion) {
    const brands = catalogs[s.vehicleKind];
    if (s.field === 'BRAND') return brands.map((b) => ({ value: b.id, label: b.name }));
    return (brands.find((b) => b.id === s.brandId)?.models ?? []).map((m) => ({ value: m.id, label: m.name }));
  }

  if (suggestions.length === 0) {
    return (
      <p className="rounded-xl border border-slate-800 bg-slate-900 p-6 text-sm text-slate-500">
        No hay nada escrito a mano para revisar. Acá aparece lo que los negocios cargan con &quot;Otra / Otro, no está en la
        lista&quot;.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900">
      <p className="border-b border-slate-800 p-3 text-xs text-slate-400">
        Sumalo a la lista, unilo con uno que ya existe (si está mal escrito) o descartalo. Las fichas ya cargadas no se tocan.
      </p>
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="border-b border-slate-800 text-left text-xs text-slate-500">
            <th className="p-3">Escrito</th>
            <th className="p-3">Qué es</th>
            <th className="p-3">Negocios</th>
            <th className="p-3 text-right">Qué hacer</th>
          </tr>
        </thead>
        <tbody>
          {suggestions.map((s) => {
            const options = targets(s);
            const needsBrand = s.field === 'MODEL' && !s.brandId;
            return (
              <tr key={s.id} className="border-b border-slate-800/50 align-top">
                <td className="p-3 font-semibold text-slate-100">{s.text}</td>
                <td className="p-3 text-slate-400">
                  {s.field === 'BRAND'
                    ? `Marca de ${KIND_LABEL[s.vehicleKind].toLowerCase()}`
                    : `Modelo de ${s.brandName ?? '—'}`}
                  {needsBrand && <span className="block text-xs text-orange-300">La marca tampoco está en la lista</span>}
                </td>
                <td className="p-3 text-slate-400">{s.tenants}</td>
                <td className="p-3">
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => addMutation.mutate(s.id)}
                      disabled={needsBrand || addMutation.isPending}
                      title={needsBrand ? `Primero sumá la marca "${s.brandName}"` : undefined}
                      className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-40"
                    >
                      Sumar a la lista
                    </button>
                    {options.length > 0 && (
                      <>
                        <AdminSelect
                          value={mergeTarget[s.id] ?? ''}
                          onChange={(v) => setMergeTarget((m) => ({ ...m, [s.id]: v }))}
                          options={options}
                          placeholder="Es igual a…"
                          className="w-44"
                        />
                        <button
                          type="button"
                          disabled={!mergeTarget[s.id] || mergeMutation.isPending}
                          onClick={() => mergeMutation.mutate({ id: s.id, targetId: mergeTarget[s.id] })}
                          className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-40"
                        >
                          Unir
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => discardMutation.mutate(s.id)}
                      disabled={discardMutation.isPending}
                      className="px-2 py-1.5 text-xs font-semibold text-slate-400 hover:text-slate-200"
                    >
                      Descartar
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
