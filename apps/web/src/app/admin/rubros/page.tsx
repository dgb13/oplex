'use client';

import {
  adminBusinessTemplatesApi,
  BUSINESS_FAMILIES,
  BUSINESS_MODULES,
  type BusinessTemplate,
  type BusinessTemplateConfig,
  type BusinessTemplateInput,
  type BusinessTemplateRequest,
} from '@/lib/businessModules';
import { BUSINESS_TEMPLATE_ICONS, BusinessTemplateIcon } from '@/lib/businessTemplateIcons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useMemo, useState } from 'react';
import AdminSelect from '../AdminSelect';
import TemplateStructureEditor from './TemplateStructureEditor';

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

const STATUS_LABEL: Record<string, string> = { available: '', upcoming: 'Próximamente', later: 'Más adelante' };
const REQUEST_STATUS: { value: BusinessTemplateRequest['status']; label: string }[] = [
  { value: 'NEW', label: 'Nuevo' },
  { value: 'DONE', label: 'Agregado' },
  { value: 'DISCARDED', label: 'Descartado' },
];

interface FormState {
  name: string;
  family: string;
  iconKey: string;
  isActive: boolean;
  modules: string[];
  categories: string;
  defaultWarranty: string;
  notice: string;
  assetType: BusinessTemplateConfig['assetType'] | null;
  workOrder: BusinessTemplateConfig['workOrder'] | null;
}

function toForm(t: BusinessTemplate | null): FormState {
  return {
    name: t?.name ?? '',
    family: t?.family ?? 'Comercio',
    iconKey: t?.iconKey ?? 'Store',
    isActive: t?.isActive ?? true,
    modules: t?.config.modules ?? [],
    categories: (t?.config.suggestedCategories ?? []).join(', '),
    defaultWarranty: t?.config.defaultWarranty ?? '',
    notice: t?.config.notice ?? '',
    assetType: t?.config.assetType ?? null,
    workOrder: t?.config.workOrder ?? null,
  };
}

function toInput(form: FormState): BusinessTemplateInput {
  return {
    name: form.name.trim(),
    family: form.family,
    iconKey: form.iconKey,
    isActive: form.isActive,
    config: {
      modules: form.modules,
      suggestedCategories: form.categories
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean),
      ...(form.defaultWarranty.trim() ? { defaultWarranty: form.defaultWarranty.trim() } : {}),
      ...(form.notice.trim() ? { notice: form.notice.trim() } : {}),
      assetType: form.assetType
        ? {
            ...form.assetType,
            fields: form.assetType.fields.map((f) => ({
              ...f,
              ...(f.type === 'SELECT' ? { options: (f.options ?? []).map((o) => o.trim()).filter(Boolean) } : { options: undefined }),
              vehicleKind: f.type === 'VEHICLE_BRAND' ? (f.vehicleKind ?? 'AUTO') : undefined,
            })),
          }
        : null,
      workOrder: form.workOrder,
    },
  };
}

/** /admin/rubros: catálogo de rubros que ven los negocios al registrarse.
 * Cada cambio de módulos/categorías/textos publica una versión nueva; los
 * negocios que ya eligieron el rubro no se tocan (tienen su copia). */
export default function AdminRubrosPage() {
  const queryClient = useQueryClient();
  const { data: templates, isLoading } = useQuery({
    queryKey: ['admin-business-templates'],
    queryFn: adminBusinessTemplatesApi.list,
  });
  const { data: requests } = useQuery({
    queryKey: ['admin-business-template-requests'],
    queryFn: adminBusinessTemplatesApi.listRequests,
  });
  const [tab, setTab] = useState<'catalog' | 'requests'>('catalog');
  const [query, setQuery] = useState('');
  // null = nuevo rubro; undefined = todavía no se eligió nada.
  const [selectedId, setSelectedId] = useState<string | null | undefined>(undefined);
  const [form, setForm] = useState<FormState>(toForm(null));
  const [showIcons, setShowIcons] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const selected = templates?.find((t) => t.id === selectedId) ?? null;
  const editing = selectedId !== undefined;
  const newRequests = (requests ?? []).filter((r) => r.status === 'NEW').length;

  const groups = useMemo(() => {
    const words = normalize(query).split(/\s+/).filter(Boolean);
    const filtered = (templates ?? []).filter((t) => words.every((w) => normalize(`${t.name} ${t.family}`).includes(w)));
    return BUSINESS_FAMILIES.map((family) => ({ family, items: filtered.filter((t) => t.family === family) })).filter(
      (g) => g.items.length > 0,
    );
  }, [templates, query]);

  function pick(template: BusinessTemplate | null) {
    setSelectedId(template ? template.id : null);
    setForm(toForm(template));
    setShowIcons(false);
    setMessage('');
    setError('');
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const input = toInput(form);
      return selected ? adminBusinessTemplatesApi.update(selected.id, input) : adminBusinessTemplatesApi.create(input);
    },
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ['admin-business-templates'] });
      setSelectedId(saved.id);
      setForm(toForm(saved));
      setError('');
      setMessage(
        selected && saved.version === selected.version
          ? 'Guardado. No cambió la configuración, así que sigue en la misma versión.'
          : `Publicada la versión ${saved.version}. Los negocios que ya usan este rubro no cambian.`,
      );
    },
    onError: (err) => setError(extractErrorMessage(err, 'No se pudo guardar el rubro')),
  });

  const requestMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: BusinessTemplateRequest['status'] }) =>
      adminBusinessTemplatesApi.updateRequest(id, status),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['admin-business-template-requests'] }),
  });

  function toggleModule(key: string) {
    setForm((f) => ({
      ...f,
      modules: f.modules.includes(key) ? f.modules.filter((m) => m !== key) : [...f.modules, key],
    }));
  }

  const inputClass =
    'w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500';

  return (
    <div className="flex max-w-7xl flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Rubros</h1>
          <p className="text-sm text-slate-400">
            Lo que ve un negocio al registrarse. Cada uno recibe una copia: cambiar acá no les pisa nada.
          </p>
        </div>
        <div role="tablist" className="flex gap-1 rounded-lg border border-slate-800 bg-slate-900 p-1">
          <button
            role="tab"
            aria-selected={tab === 'catalog'}
            onClick={() => setTab('catalog')}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold ${tab === 'catalog' ? 'bg-slate-700 text-white' : 'text-slate-400'}`}
          >
            Catálogo ({templates?.length ?? 0})
          </button>
          <button
            role="tab"
            aria-selected={tab === 'requests'}
            onClick={() => setTab('requests')}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold ${tab === 'requests' ? 'bg-slate-700 text-white' : 'text-slate-400'}`}
          >
            Pedidos{newRequests > 0 ? ` (${newRequests} nuevos)` : ''}
          </button>
        </div>
      </div>

      {tab === 'requests' ? (
        <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900">
          {!requests || requests.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">Nadie pidió un rubro nuevo todavía.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-left text-xs text-slate-500">
                  <th className="p-3">Rubro pedido</th>
                  <th className="p-3">Negocio</th>
                  <th className="p-3">Fecha</th>
                  <th className="p-3">Estado</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id} className="border-b border-slate-800/50">
                    <td className="p-3 text-slate-100">{r.text}</td>
                    <td className="p-3 text-slate-400">{r.tenantName ?? '—'}</td>
                    <td className="p-3 text-slate-400">{new Date(r.createdAt).toLocaleDateString('es-AR')}</td>
                    <td className="p-3">
                      <AdminSelect
                        value={r.status}
                        onChange={(status) =>
                          requestMutation.mutate({ id: r.id, status: status as BusinessTemplateRequest['status'] })
                        }
                        options={REQUEST_STATUS}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap gap-5">
          <aside className="min-w-0 flex-[1_1_280px] self-start rounded-xl border border-slate-800 bg-slate-900 p-4">
            <label htmlFor="rubro-q" className="mb-1 block text-xs font-semibold text-slate-400">
              Buscar
            </label>
            <input
              id="rubro-q"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ej.: taller, farmacia…"
              className={inputClass}
            />
            <button
              type="button"
              onClick={() => pick(null)}
              className="mt-2 w-full rounded-lg border border-dashed border-indigo-500/60 py-2 text-sm font-semibold text-indigo-300 hover:bg-indigo-500/10"
            >
              + Nuevo rubro
            </button>
            <div className="mt-2 max-h-[70vh] overflow-y-auto pr-1">
              {isLoading && <p className="p-2 text-sm text-slate-500">Cargando…</p>}
              {groups.map((g) => (
                <div key={g.family} className="mt-3">
                  <p className="px-1.5 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    {g.family} · {g.items.length}
                  </p>
                  {g.items.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => pick(t)}
                      aria-current={t.id === selectedId ? 'true' : undefined}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm ${
                        t.id === selectedId ? 'bg-indigo-500/15 text-white' : 'text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-800">
                        <BusinessTemplateIcon iconKey={t.iconKey} className="h-4 w-4 text-indigo-300" />
                      </span>
                      <span className="min-w-0 flex-1 truncate">{t.name}</span>
                      {!t.isActive && <span className="text-[10px] font-semibold text-amber-400">Inactivo</span>}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </aside>

          <section className="min-w-0 flex-[999_1_560px]">
            {!editing ? (
              <p className="rounded-xl border border-slate-800 bg-slate-900 p-6 text-sm text-slate-400">
                Elegí un rubro de la lista o creá uno nuevo.
              </p>
            ) : (
              <form
                className="flex flex-col gap-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  setMessage('');
                  if (form.name.trim().length < 2) {
                    setError('El nombre es obligatorio');
                    return;
                  }
                  saveMutation.mutate();
                }}
              >
                <div className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-800 bg-slate-900 p-4">
                  <button
                    type="button"
                    onClick={() => setShowIcons((v) => !v)}
                    aria-label="Cambiar ícono"
                    className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-indigo-500/15 hover:bg-indigo-500/25"
                  >
                    <BusinessTemplateIcon iconKey={form.iconKey} className="h-8 w-8 text-indigo-300" />
                  </button>
                  <div className="min-w-0 flex-[1_1_220px]">
                    <label htmlFor="rubro-name" className="text-xs font-semibold text-slate-400">
                      Nombre
                    </label>
                    <input
                      id="rubro-name"
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      className={inputClass}
                    />
                  </div>
                  <div className="min-w-0 flex-[1_1_200px]">
                    <p className="text-xs font-semibold text-slate-400">Familia</p>
                    <AdminSelect
                      value={form.family}
                      onChange={(family) => setForm((f) => ({ ...f, family }))}
                      options={BUSINESS_FAMILIES.map((f) => ({ value: f, label: f }))}
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm text-slate-300">
                    <input
                      type="checkbox"
                      checked={form.isActive}
                      onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                      className="h-4 w-4 accent-indigo-500"
                    />
                    Activo (aparece en el alta)
                  </label>
                  {selected && (
                    <p className="w-full text-xs text-slate-500">
                      Clave {selected.key} · versión {selected.version} publicada
                    </p>
                  )}
                  {showIcons && (
                    <div className="w-full border-t border-slate-800 pt-3">
                      <p className="mb-2 text-xs font-semibold text-slate-400">Elegí el ícono</p>
                      <div className="flex flex-wrap gap-1.5">
                        {Object.keys(BUSINESS_TEMPLATE_ICONS).map((key) => (
                          <button
                            key={key}
                            type="button"
                            title={key}
                            aria-label={`Ícono ${key}`}
                            aria-pressed={key === form.iconKey}
                            onClick={() => setForm((f) => ({ ...f, iconKey: key }))}
                            className={`flex h-10 w-10 items-center justify-center rounded-lg border ${
                              key === form.iconKey ? 'border-indigo-400 bg-indigo-500/20' : 'border-slate-800 hover:bg-slate-800'
                            }`}
                          >
                            <BusinessTemplateIcon iconKey={key} className="h-5 w-5 text-slate-200" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                  <h2 className="text-sm font-semibold text-white">Módulos que vienen prendidos</h2>
                  <p className="mb-3 text-xs text-slate-400">
                    Artículos, Compras, Facturación y Clientes van siempre. El negocio puede cambiar estos después.
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {BUSINESS_MODULES.map((m) => (
                      <label
                        key={m.key}
                        className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-slate-800 px-3 py-2 hover:bg-slate-800/50"
                      >
                        <input
                          type="checkbox"
                          checked={form.modules.includes(m.key)}
                          onChange={() => toggleModule(m.key)}
                          className="mt-0.5 h-4 w-4 accent-indigo-500"
                        />
                        <span className="min-w-0">
                          <span className="flex flex-wrap items-center gap-1.5 text-sm text-slate-100">
                            {m.label}
                            {STATUS_LABEL[m.status] && (
                              <span className="rounded-full bg-slate-800 px-1.5 text-[10px] font-semibold text-slate-400">
                                {STATUS_LABEL[m.status]}
                              </span>
                            )}
                          </span>
                          <span className="block text-xs text-slate-500">{m.description}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="grid gap-4 rounded-xl border border-slate-800 bg-slate-900 p-4 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <label htmlFor="rubro-cats" className="text-xs font-semibold text-slate-400">
                      Categorías de artículos sugeridas (separadas por coma)
                    </label>
                    <input
                      id="rubro-cats"
                      value={form.categories}
                      onChange={(e) => setForm((f) => ({ ...f, categories: e.target.value }))}
                      placeholder="Repuestos, Lubricantes, Mano de obra"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label htmlFor="rubro-warranty" className="text-xs font-semibold text-slate-400">
                      Garantía por defecto en cotizaciones
                    </label>
                    <input
                      id="rubro-warranty"
                      value={form.defaultWarranty}
                      onChange={(e) => setForm((f) => ({ ...f, defaultWarranty: e.target.value }))}
                      maxLength={200}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label htmlFor="rubro-notice" className="text-xs font-semibold text-slate-400">
                      Aviso para el negocio
                    </label>
                    <input
                      id="rubro-notice"
                      value={form.notice}
                      onChange={(e) => setForm((f) => ({ ...f, notice: e.target.value }))}
                      maxLength={300}
                      placeholder="Ej.: Obras sociales: más adelante"
                      className={inputClass}
                    />
                  </div>
                </div>

                <TemplateStructureEditor
                  assetType={form.assetType ?? null}
                  workOrder={form.workOrder ?? null}
                  onAssetType={(assetType) => setForm((f) => ({ ...f, assetType }))}
                  onWorkOrder={(workOrder) => setForm((f) => ({ ...f, workOrder }))}
                />

                {error && <p className="text-sm text-red-400">{error}</p>}
                {message && (
                  <p role="status" className="text-sm text-emerald-400">
                    {message}
                  </p>
                )}
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={saveMutation.isPending}
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-60"
                  >
                    {saveMutation.isPending ? 'Guardando…' : selected ? 'Guardar y publicar' : 'Crear rubro'}
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
