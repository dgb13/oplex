'use client';

import { adminTenantsApi, type TenantSummary } from '@/lib/admin';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import {
  daysSince,
  formatAgo,
  HealthBadge,
  IntegrationIcons,
  IntegrationLegend,
  PlanPill,
  trialDaysLeft,
} from './TenantUi';

type FilterKey = 'all' | 'trial' | 'noarca' | 'inactive' | 'pastdue' | 'tickets';

const FILTERS: Array<{ key: FilterKey; label: string; match: (t: TenantSummary) => boolean }> = [
  { key: 'all', label: 'Todos', match: () => true },
  {
    key: 'trial',
    label: 'Prueba por vencer',
    match: (t) => {
      const left = trialDaysLeft(t);
      return left !== null && left <= 5;
    },
  },
  { key: 'noarca', label: 'Sin ARCA en producción', match: (t) => t.arcaEnv !== 'PRODUCCION' },
  { key: 'inactive', label: 'Inactivos +7 días', match: (t) => (daysSince(t.lastActivityAt) ?? Infinity) >= 7 },
  { key: 'pastdue', label: 'Pago vencido', match: (t) => t.subscriptionStatus === 'PAST_DUE' || t.subscriptionStatus === 'EXPIRED' },
  { key: 'tickets', label: 'Con consultas abiertas', match: (t) => t.openTickets > 0 },
];

const isPaying = (t: TenantSummary) => t.subscriptionStatus === 'ACTIVE' && (t.planPriceMonthly ?? 0) > 0;

// Embudo de activación: hasta dónde llegó cada tenant (boceto aprobado).
const FUNNEL: Array<{ label: string; match: (t: TenantSummary) => boolean }> = [
  { label: 'Se registraron', match: () => true },
  { label: 'Cargaron artículos', match: (t) => t.articles > 0 },
  { label: 'Hicieron una cotización', match: (t) => t.quotes > 0 },
  { label: 'ARCA en producción', match: (t) => t.arcaEnv === 'PRODUCCION' },
  { label: 'Emitieron una factura', match: (t) => t.firstCaeInvoiceAt !== null },
  { label: 'Pagan un plan', match: isPaying },
];

const nf = new Intl.NumberFormat('es-AR');
const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });

function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// CSV con ";" (lo que abre bien Excel en castellano) y BOM para los acentos.
function downloadCsv(rows: TenantSummary[]) {
  const header = [
    'Tenant', 'CUIT', 'Plan', 'Suscripción', 'Alta', 'ARCA', 'ARCA producción desde', 'WhatsApp', 'Mercado Pago',
    'Tienda', 'Artículos', 'Clientes', 'Proveedores', 'Cotizaciones', 'Facturas del mes', 'Usuarios',
    'Última actividad', 'Consultas abiertas', 'Salud', 'Motivo',
  ];
  const lines = rows.map((t) =>
    [
      t.name, t.taxId, t.planName ?? t.planKey, t.subscriptionStatus, t.createdAt.slice(0, 10),
      t.arcaEnv ?? 'Sin certificado', t.arcaProductionAt?.slice(0, 10), t.whatsappLinks,
      t.mercadoPagoConnectedAt ? 'Sí' : 'No', t.storefrontPublished ? 'Publicada' : 'No', t.articles, t.customers,
      t.suppliers, t.quotes, t.invoicesThisMonth, t.activeUsers, t.lastActivityAt?.slice(0, 10), t.openTickets,
      t.health, t.healthReasons.join(' · '),
    ]
      .map(csvCell)
      .join(';'),
  );
  const blob = new Blob(['﻿' + [header.join(';'), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tenants-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AdminTenantsPage() {
  const router = useRouter();
  const { data: tenants, isLoading, isError } = useQuery({ queryKey: ['admin-tenants'], queryFn: adminTenantsApi.list });
  const [filter, setFilter] = useState<FilterKey>('all');
  const [query, setQuery] = useState('');

  const all = useMemo(
    () => [...(tenants ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [tenants],
  );
  const shown = useMemo(() => {
    const match = (FILTERS.find((f) => f.key === filter) ?? FILTERS[0]).match;
    const q = query.trim().toLowerCase();
    return all.filter((t) => match(t) && (!q || `${t.name} ${t.taxId ?? ''}`.toLowerCase().includes(q)));
  }, [all, filter, query]);

  const now = new Date();
  const thisMonth = all.filter((t) => {
    const d = new Date(t.createdAt);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }).length;
  const trialSoon = all.filter(FILTERS[1].match);
  const paying = all.filter(isPaying);
  const arcaProd = all.filter((t) => t.arcaEnv === 'PRODUCCION').length;
  const mp = all.filter((t) => t.mercadoPagoConnectedAt).length;
  const wa = all.filter((t) => t.whatsappLinks > 0).length;
  const inactive = all.filter(FILTERS[3].match).length;
  const pct = (n: number) => (all.length ? Math.round((n / all.length) * 100) : 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-white">Tenants</h1>
        <button
          type="button"
          onClick={() => downloadCsv(shown)}
          disabled={!shown.length}
          className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 transition hover:bg-slate-800 disabled:opacity-50"
        >
          Exportar a Excel
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Tenants" value={all.length} hint={`+${thisMonth} este mes`} />
        <Kpi
          label="Prueba vence ≤ 5 días"
          value={trialSoon.length}
          hint={trialSoon.map((t) => t.name).join(', ') || 'ninguno'}
          warn={trialSoon.length > 0}
        />
        <Kpi
          label="Pagan plan"
          value={paying.length}
          hint={`${money.format(paying.reduce((s, t) => s + (t.planPriceMonthly ?? 0), 0))} / mes`}
        />
        <Kpi label="ARCA en producción" value={arcaProd} hint={`${pct(arcaProd)} % del total`} />
        <Kpi label="Mercado Pago conectado" value={mp} hint={`WhatsApp: ${wa}`} />
        <Kpi label="Inactivos +7 días" value={inactive} hint="posible abandono" warn={inactive > 0} />
      </div>

      {all.length > 0 && (
        <section className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-medium text-slate-400">Embudo de activación: hasta dónde llegó cada tenant</h2>
            <span className="text-xs text-slate-500">sobre {all.length} registrados</span>
          </div>
          <div className="flex flex-col gap-1.5">
            {FUNNEL.map((step) => {
              const n = all.filter(step.match).length;
              return (
                <div
                  key={step.label}
                  className="grid grid-cols-[110px_minmax(0,1fr)_64px] items-center gap-2.5 text-[12.5px] sm:grid-cols-[180px_minmax(0,1fr)_72px]"
                >
                  <span className="text-slate-300">{step.label}</span>
                  <div className="h-4 overflow-hidden rounded bg-slate-800">
                    <span className="block h-full rounded bg-indigo-500" style={{ width: `${pct(n)}%` }} />
                  </div>
                  <span className="text-right font-mono text-xs tabular-nums text-slate-400">
                    {n} · {pct(n)}%
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="rounded-xl border border-slate-800 bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 p-3.5">
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={`rounded-full border px-2.5 py-1 text-xs transition ${
                  filter === f.key
                    ? 'border-indigo-500 bg-indigo-500/15 text-white'
                    : 'border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <input
            id="tenant-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar nombre o CUIT"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-200 placeholder:text-slate-600 sm:w-56"
          />
        </div>

        {isLoading ? (
          <p className="p-6 text-sm text-slate-500">Cargando tenants...</p>
        ) : isError ? (
          <p className="p-6 text-sm text-red-400">No se pudo cargar la lista de tenants.</p>
        ) : shown.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">
            {all.length === 0 ? 'Sin tenants todavía.' : 'Ningún tenant cumple este filtro.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-slate-800 text-left text-[11.5px] text-slate-500">
                  <th className="p-2.5 font-medium">Tenant</th>
                  <th className="p-2.5 font-medium">Plan</th>
                  <th className="p-2.5 font-medium">Integraciones</th>
                  <th className="p-2.5 text-right font-medium">Artículos</th>
                  <th className="p-2.5 text-right font-medium">Clientes</th>
                  <th className="p-2.5 text-right font-medium">Proveed.</th>
                  <th className="p-2.5 text-right font-medium">Fact./mes</th>
                  <th className="p-2.5 text-right font-medium">Usuarios</th>
                  <th className="p-2.5 font-medium">Última actividad</th>
                  <th className="p-2.5 font-medium">Salud</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((t) => {
                  const idle = daysSince(t.lastActivityAt);
                  return (
                    <tr
                      key={t.id}
                      onClick={() => router.push(`/admin/tenants/${t.id}`)}
                      onKeyDown={(e) => e.key === 'Enter' && router.push(`/admin/tenants/${t.id}`)}
                      tabIndex={0}
                      className="cursor-pointer border-b border-slate-800/50 outline-none hover:bg-slate-800/30 focus-visible:bg-slate-800/40"
                    >
                      <td className="p-2.5">
                        <span className="flex flex-wrap items-center gap-1.5 font-semibold text-white">
                          {t.name}
                          {t.status === 'SUSPENDED' && (
                            <span className="rounded bg-red-900/50 px-1.5 text-[11px] font-medium text-red-300">Suspendido</span>
                          )}
                          {t.openTickets > 0 && (
                            <span className="rounded bg-red-900/50 px-1.5 text-[11px] font-medium text-red-300">
                              {t.openTickets} consulta{t.openTickets > 1 ? 's' : ''}
                            </span>
                          )}
                        </span>
                        <span className="font-mono text-[11px] text-slate-500">{t.taxId ?? 'sin CUIT'}</span>
                      </td>
                      <td className="p-2.5">
                        <PlanPill tenant={t} />
                      </td>
                      <td className="p-2.5">
                        <IntegrationIcons tenant={t} />
                      </td>
                      <td className="p-2.5 text-right font-mono tabular-nums">{nf.format(t.articles)}</td>
                      <td className="p-2.5 text-right font-mono tabular-nums">{nf.format(t.customers)}</td>
                      <td className="p-2.5 text-right font-mono tabular-nums">{nf.format(t.suppliers)}</td>
                      <td className="p-2.5 text-right font-mono tabular-nums">{nf.format(t.invoicesThisMonth)}</td>
                      <td className="p-2.5 text-right font-mono tabular-nums">{t.activeUsers}</td>
                      <td className={`whitespace-nowrap p-2.5 ${idle !== null && idle < 7 ? 'text-slate-400' : 'text-amber-300'}`}>
                        {formatAgo(t.lastActivityAt)}
                      </td>
                      <td className="p-2.5">
                        <HealthBadge tenant={t} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="p-3.5">
          <IntegrationLegend />
        </div>
      </section>
    </div>
  );
}

function Kpi({ label, value, hint, warn }: { label: string; value: number; hint: string; warn?: boolean }) {
  return (
    <div className={`min-w-0 rounded-xl border p-3 ${warn ? 'border-amber-900 bg-amber-950/30' : 'border-slate-800 bg-slate-900'}`}>
      <p className="text-[11.5px] text-slate-400">{label}</p>
      <p className={`mt-0.5 text-2xl font-bold tabular-nums ${warn ? 'text-amber-300' : 'text-white'}`}>{value}</p>
      <p className="truncate text-[11px] text-slate-500" title={hint}>
        {hint}
      </p>
    </div>
  );
}
