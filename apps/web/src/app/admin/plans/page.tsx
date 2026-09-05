'use client';

import { adminPlansApi, type AdminPlan, type CreatePlanInput, type UpdatePlanInput } from '@/lib/admin';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';

// Same extraction as CompanyFormModal/LoginPage: surface the backend's own
// validation message (e.g. "maxUsers must not be less than 0", "Ya existe
// un plan con key...") instead of a fixed guess that's wrong whenever the
// real cause isn't a duplicate key.
function extractErrorMessage(err: unknown, fallback: string): string {
  const message = (err as AxiosError<{ message?: string | string[] }> | undefined)?.response?.data?.message;
  if (!message) return fallback;
  return Array.isArray(message) ? message.join(', ') : message;
}

const EMPTY_FORM: CreatePlanInput = {
  key: '',
  name: '',
  sortOrder: 0,
  priceMonthly: 0,
  maxUsers: 1,
  maxClients: 10,
  maxMonthlyInvoices: 10,
  debitDiscountPercent: 0,
  isActive: true,
  slaMarkdown: '',
};

export default function AdminPlansPage() {
  const queryClient = useQueryClient();
  const { data: plans, isLoading } = useQuery({ queryKey: ['admin-plans'], queryFn: adminPlansApi.listAll });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const updateMutation = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdatePlanInput }) => adminPlansApi.update(id, dto),
    onSuccess: () => {
      setEditingId(null);
      void queryClient.invalidateQueries({ queryKey: ['admin-plans'] });
    },
  });

  const createMutation = useMutation({
    mutationFn: (dto: CreatePlanInput) => adminPlansApi.create(dto),
    onSuccess: () => {
      setCreating(false);
      void queryClient.invalidateQueries({ queryKey: ['admin-plans'] });
    },
  });

  return (
    <div className="flex max-w-6xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-white">Planes</h1>
        {!creating && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-500"
          >
            + Nuevo plan
          </button>
        )}
      </div>

      {creating && (
        <PlanForm
          initial={EMPTY_FORM}
          showKey
          saving={createMutation.isPending}
          error={createMutation.isError ? extractErrorMessage(createMutation.error, 'No se pudo crear el plan') : null}
          onCancel={() => setCreating(false)}
          onSave={(dto) => createMutation.mutate(dto as CreatePlanInput)}
        />
      )}

      <div className="rounded-xl border border-slate-800 bg-slate-900">
        {isLoading ? (
          <p className="p-6 text-sm text-slate-500">Cargando planes...</p>
        ) : !plans || plans.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">Sin planes cargados.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-left text-xs text-slate-500">
                  <th className="p-3">Key</th>
                  <th className="p-3">Nombre</th>
                  <th className="p-3 text-right">$/mes</th>
                  <th className="p-3 text-right">Usuarios</th>
                  <th className="p-3 text-right">Clientes</th>
                  <th className="p-3 text-right">Facturas/mes</th>
                  <th className="p-3 text-right">Desc. débito</th>
                  <th className="p-3">Activo</th>
                  <th className="p-3">SLA</th>
                  <th className="p-3">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {[...plans]
                  .sort((a, b) => a.sortOrder - b.sortOrder)
                  .map((plan) =>
                    editingId === plan.id ? (
                      <tr key={plan.id} className="border-b border-slate-800/50">
                        <td colSpan={10} className="p-3">
                          <PlanForm
                            initial={plan}
                            saving={updateMutation.isPending}
                            error={
                              updateMutation.isError
                                ? extractErrorMessage(updateMutation.error, 'No se pudo guardar el cambio')
                                : null
                            }
                            onCancel={() => setEditingId(null)}
                            onSave={(dto) => updateMutation.mutate({ id: plan.id, dto })}
                          />
                        </td>
                      </tr>
                    ) : (
                      <tr key={plan.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                        <td className="p-3 font-mono text-xs text-slate-400">{plan.key}</td>
                        <td className="p-3 font-medium text-slate-200">{plan.name}</td>
                        <td className="p-3 text-right text-slate-300">
                          {Number(plan.priceMonthly) === 0 ? 'Gratis' : `$${Number(plan.priceMonthly).toLocaleString('es-AR')}`}
                        </td>
                        <td className="p-3 text-right text-slate-300">{plan.maxUsers}</td>
                        <td className="p-3 text-right text-slate-300">{plan.maxClients}</td>
                        <td className="p-3 text-right text-slate-300">{plan.maxMonthlyInvoices.toLocaleString('es-AR')}</td>
                        <td className="p-3 text-right text-slate-300">{Number(plan.debitDiscountPercent)}%</td>
                        <td className="p-3">
                          <span
                            className={`rounded px-2 py-0.5 text-xs font-medium ${
                              plan.isActive ? 'bg-green-900/50 text-green-300' : 'bg-slate-800 text-slate-500'
                            }`}
                          >
                            {plan.isActive ? 'Sí' : 'No'}
                          </span>
                        </td>
                        <td className="p-3">
                          {plan.slaMarkdown ? (
                            <a
                              href={`/sla/${plan.key}`}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded bg-emerald-900/50 px-2 py-0.5 text-xs font-medium text-emerald-300 hover:underline"
                            >
                              Publicado
                            </a>
                          ) : (
                            <span className="rounded bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-500">
                              Sin publicar
                            </span>
                          )}
                        </td>
                        <td className="p-3">
                          <button
                            type="button"
                            onClick={() => setEditingId(plan.id)}
                            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-slate-800"
                          >
                            Editar
                          </button>
                        </td>
                      </tr>
                    ),
                  )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function PlanForm({
  initial,
  showKey,
  saving,
  error,
  onCancel,
  onSave,
}: {
  initial: AdminPlan | CreatePlanInput;
  showKey?: boolean;
  saving: boolean;
  error: string | null;
  onCancel: () => void;
  onSave: (dto: CreatePlanInput | UpdatePlanInput) => void;
}) {
  const [form, setForm] = useState({
    key: 'key' in initial ? initial.key : '',
    name: initial.name,
    sortOrder: initial.sortOrder ?? 0,
    priceMonthly: Number(initial.priceMonthly),
    maxUsers: initial.maxUsers,
    maxClients: initial.maxClients,
    maxMonthlyInvoices: initial.maxMonthlyInvoices,
    debitDiscountPercent: Number(initial.debitDiscountPercent ?? 0),
    isActive: initial.isActive ?? true,
    slaMarkdown: ('slaMarkdown' in initial ? initial.slaMarkdown : '') ?? '',
    // Texto, no número: "" representa null (función no incluida en este
    // plan) - un <input type="number"> no distingue "vacío" de "0" con la
    // misma claridad.
    aiInvoiceScanMonthlyQuota:
      'aiInvoiceScanMonthlyQuota' in initial && initial.aiInvoiceScanMonthlyQuota != null
        ? String(initial.aiInvoiceScanMonthlyQuota)
        : '',
  });
  const [slaPreview, setSlaPreview] = useState(false);

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {showKey && (
          <Field label="Key">
            <input
              value={form.key}
              onChange={(e) => setForm({ ...form, key: e.target.value.toUpperCase() })}
              className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100"
            />
          </Field>
        )}
        <Field label="Nombre">
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100"
          />
        </Field>
        <Field label="Orden">
          <NumberInput value={form.sortOrder} onChange={(v) => setForm({ ...form, sortOrder: v })} />
        </Field>
        <Field label="$/mes">
          <NumberInput value={form.priceMonthly} onChange={(v) => setForm({ ...form, priceMonthly: v })} />
        </Field>
        <Field label="Máx. usuarios">
          <NumberInput value={form.maxUsers} onChange={(v) => setForm({ ...form, maxUsers: v })} />
        </Field>
        <Field label="Máx. clientes">
          <NumberInput value={form.maxClients} onChange={(v) => setForm({ ...form, maxClients: v })} />
        </Field>
        <Field label="Máx. facturas/mes">
          <NumberInput value={form.maxMonthlyInvoices} onChange={(v) => setForm({ ...form, maxMonthlyInvoices: v })} />
        </Field>
        <Field label="Desc. débito %">
          <NumberInput value={form.debitDiscountPercent} onChange={(v) => setForm({ ...form, debitDiscountPercent: v })} />
        </Field>
        <Field label="Cupo IA/mes (vacío = no incluido)">
          <input
            type="number"
            min={0}
            value={form.aiInvoiceScanMonthlyQuota}
            onChange={(e) => setForm({ ...form, aiInvoiceScanMonthlyQuota: e.target.value })}
            className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100"
          />
        </Field>
        <Field label="Activo">
          <select
            value={form.isActive ? '1' : '0'}
            onChange={(e) => setForm({ ...form, isActive: e.target.value === '1' })}
            className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100"
          >
            <option value="1">Sí</option>
            <option value="0">No</option>
          </select>
        </Field>
      </div>

      <div className="mt-4">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[11px] text-slate-500">SLA (Markdown) — página pública en /sla/{form.key || '(key)'}</span>
          <button
            type="button"
            onClick={() => setSlaPreview((v) => !v)}
            className="rounded px-2 py-0.5 text-[11px] text-indigo-400 hover:text-indigo-300"
          >
            {slaPreview ? 'Editar' : 'Vista previa'}
          </button>
        </div>
        {slaPreview ? (
          <div
            className="max-w-none rounded border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-200
              [&_h1]:mb-2 [&_h1]:text-lg [&_h1]:font-bold [&_h1]:text-slate-100
              [&_h2]:mb-1.5 [&_h2]:mt-3 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-slate-100
              [&_p]:mb-2 [&_ul]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mb-1 [&_strong]:text-slate-100"
          >
            {form.slaMarkdown ? (
              <ReactMarkdown>{form.slaMarkdown}</ReactMarkdown>
            ) : (
              <p className="text-slate-500">Sin contenido todavía.</p>
            )}
          </div>
        ) : (
          <textarea
            value={form.slaMarkdown}
            onChange={(e) => setForm({ ...form, slaMarkdown: e.target.value })}
            rows={10}
            placeholder="# SLA de [nombre del plan]&#10;&#10;Escribí acá el Acuerdo de Nivel de Servicio de este plan, en Markdown..."
            className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-2 font-mono text-xs text-slate-100"
          />
        )}
      </div>

      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          disabled={saving || !form.name || (showKey && !form.key)}
          onClick={() => {
            const aiInvoiceScanMonthlyQuota =
              form.aiInvoiceScanMonthlyQuota === '' ? null : Number(form.aiInvoiceScanMonthlyQuota);
            onSave(
              showKey
                ? { ...form, aiInvoiceScanMonthlyQuota }
                : {
                    name: form.name,
                    sortOrder: form.sortOrder,
                    priceMonthly: form.priceMonthly,
                    maxUsers: form.maxUsers,
                    maxClients: form.maxClients,
                    maxMonthlyInvoices: form.maxMonthlyInvoices,
                    debitDiscountPercent: form.debitDiscountPercent,
                    isActive: form.isActive,
                    slaMarkdown: form.slaMarkdown,
                    aiInvoiceScanMonthlyQuota,
                  },
            );
          }}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
        >
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-3 py-1.5 text-xs text-slate-400 transition hover:text-slate-200"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function NumberInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100"
    />
  );
}
