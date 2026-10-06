'use client';

import { adminVisitsApi, type VisitRange, type VisitsRankRow, type VisitsReport } from '@/lib/admin';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { AlertBanner, Box } from '../OpsUi';

const RANGES: Array<{ value: VisitRange; label: string }> = [
  { value: 1, label: 'Hoy' },
  { value: 7, label: '7 días' },
  { value: 30, label: '30 días' },
  { value: 90, label: '90 días' },
];
const RANGE_LABEL: Record<VisitRange, string> = { 1: 'hoy', 7: 'últimos 7 días', 30: 'últimos 30 días', 90: 'últimos 90 días' };
const SERIES = '#818cf8';
const SIGNUP = '#f97316';
const WHATSAPP_HOSTS = ['wa.me', 'l.wl.co', 'web.whatsapp.com', 'api.whatsapp.com', 'whatsapp.com'];
const DEVICE_LABEL: Record<string, string> = { mobile: 'Celular', desktop: 'Computadora', tablet: 'Tablet' };

const fmt = (n: number) => n.toLocaleString('es-AR');
const pct = (n: number) => `${n.toLocaleString('es-AR', { maximumFractionDigits: 1 })} %`;

function countryLabel(code: string): string {
  try {
    return new Intl.DisplayNames(['es'], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

function refererLabel(host: string): string {
  const h = host.replace(/^www\./, '');
  if (!h) return 'Directo (escribieron la dirección)';
  if (typeof window !== 'undefined' && h === window.location.hostname.replace(/^www\./, '')) return 'Desde la misma web';
  if (WHATSAPP_HOSTS.includes(h)) return 'WhatsApp';
  return h;
}

function deviceLabel(key: string): string {
  const [type, browser] = key.split('|');
  const device = DEVICE_LABEL[type] ?? (type || 'Otro');
  return browser ? `${device} · ${browser}` : device;
}

function dayLabel(date: string): string {
  const [, m, d] = date.split('-');
  return `${d}/${m}`;
}

function weekday(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString('es-AR', { weekday: 'short' });
}

/**
 * "Visitas" del panel Admin (boceto aprobado): visitas de la web pública
 * según Cloudflare Web Analytics (estimadas, ver VisitsAnalyticsService)
 * cruzadas con registros, empresas activas y que pagan, de Oplex.
 */
export default function AdminVisitsPage() {
  const [range, setRange] = useState<VisitRange>(30);
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-visits', range],
    queryFn: () => adminVisitsApi.report(range),
    refetchInterval: 15 * 60_000,
  });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Visitas</h1>
          <p className="mt-1 text-sm text-slate-500">
            Quién entra a la web y cuántos terminan usando Oplex. Visitas de Cloudflare (estimadas); registros y pagos, de
            Oplex.
          </p>
        </div>
        <div className="flex gap-1.5" role="group" aria-label="Período">
          {RANGES.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => setRange(r.value)}
              aria-pressed={range === r.value}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                range === r.value ? 'border-indigo-400 bg-indigo-500/20 text-white' : 'border-slate-700 text-slate-400 hover:text-white'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {isError && <AlertBanner tone="bad">No se pudo cargar el reporte. Probá de nuevo en un rato.</AlertBanner>}
      {isLoading || !data ? (
        !isError && <p className="text-sm text-slate-500">Cargando...</p>
      ) : (
        <VisitsView data={data} />
      )}
    </div>
  );
}

function VisitsView({ data }: { data: VisitsReport }) {
  const visits = data.visits;
  const conv = visits ? (data.signups / visits) * 100 : null;
  const prevConv = data.previousVisits ? (data.previousSignups / data.previousVisits) * 100 : null;

  return (
    <>
      {!data.cloudflareConfigured && (
        <AlertBanner tone="warn">
          <b className="text-white">Falta conectar Cloudflare.</b> Las visitas aparecen cuando el servidor tenga
          CLOUDFLARE_ACCOUNT_ID y CLOUDFLARE_ANALYTICS_TOKEN (ver docs/DEPLOY.md). Los registros y pagos de Oplex ya se
          muestran.
        </AlertBanner>
      )}
      {data.cloudflareError && (
        <AlertBanner tone="bad">
          <b className="text-white">Cloudflare no respondió:</b> {data.cloudflareError}. Los registros y pagos de Oplex se
          muestran igual.
        </AlertBanner>
      )}

      <section className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]" aria-label="Resumen">
        <Tile label="Visitas" source="Cloudflare" value={visits === null ? '—' : `≈ ${fmt(visits)}`}>
          <Delta now={visits} before={data.previousVisits} />
        </Tile>
        <Tile
          label="Páginas vistas"
          source="Cloudflare"
          value={data.pageViews === null ? '—' : `≈ ${fmt(data.pageViews)}`}
          extra={visits && data.pageViews ? `${(data.pageViews / visits).toLocaleString('es-AR', { maximumFractionDigits: 1 })} por visita` : undefined}
        >
          <span className="text-xs text-slate-500">{RANGE_LABEL[data.range]}</span>
        </Tile>
        <Tile label="Registros nuevos" source="Oplex" value={fmt(data.signups)}>
          <Delta now={data.signups} before={data.previousSignups} />
        </Tile>
        <Tile label="Conversión" source="visitas → registro" value={conv === null ? '—' : pct(conv)}>
          <Delta now={conv} before={prevConv} points />
        </Tile>
      </section>

      <Box title="Visitas por día" hint="Los puntos naranjas son registros nuevos ese día">
        <DaysChart days={data.days} />
        <div className="flex gap-4 px-4 pb-3.5 text-xs text-slate-400">
          <span className="inline-flex items-center gap-1.5">
            <i className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: SERIES }} />
            Visitas
          </span>
          <span className="inline-flex items-center gap-1.5">
            <i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: SIGNUP }} />
            Registros
          </span>
        </div>
      </Box>

      <Box title="Embudo" hint="De la visita al pago, en el período elegido">
        <Funnel data={data} />
      </Box>

      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(320px,1fr))]">
        <Box title="Países" hint="Visitas">
          <Rank rows={data.countries} total={data.visits} label={(k) => countryLabel(k)} code={(k) => k} />
        </Box>
        <Box title="De dónde llegan" hint="Sitio anterior">
          <Rank rows={data.referers} total={data.visits} label={refererLabel} />
        </Box>
        <Box title="Páginas más vistas" hint="Páginas vistas">
          <Rank rows={data.pages} total={data.pageViews} label={(k) => k || '/'} mono />
        </Box>
        <Box title="Dispositivo y navegador" hint="Visitas">
          <Rank rows={data.devices} total={data.visits} label={deviceLabel} />
        </Box>
      </div>

      <p className="text-xs text-slate-500">
        Las visitas son estimadas: Cloudflare guarda una muestra y calcula el total. Sólo se miden las páginas públicas
        (inicio, registro, login y legales), nunca adentro del sistema, y sin cookies. Datos actualizados cada 15 minutos.
        Empresas activas: tuvieron actividad de algún usuario en los últimos 7 días. Pagando: plan pago activo (las que
        están en prueba no cuentan).
      </p>
    </>
  );
}

function Tile({
  label,
  source,
  value,
  extra,
  children,
}: {
  label: string;
  source: string;
  value: string;
  extra?: string;
  children: React.ReactNode;
}) {
  return (
    <article className="flex min-w-0 flex-col gap-1.5 rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="flex justify-between gap-2 text-xs text-slate-400">
        <span>{label}</span>
        <span className="text-[10px] uppercase tracking-wider text-slate-500">{source}</span>
      </div>
      <div className="text-2xl font-semibold tabular-nums text-white">
        {value}
        {extra && <small className="ml-1 text-sm font-medium text-slate-500">{extra}</small>}
      </div>
      {children}
    </article>
  );
}

function Delta({ now, before, points }: { now: number | null; before: number | null; points?: boolean }) {
  if (now === null || before === null || before === 0) {
    return <span className="text-xs text-slate-500">sin datos del período anterior</span>;
  }
  const change = points ? now - before : ((now - before) / before) * 100;
  const up = change >= 0;
  const text = points
    ? `${up ? '+' : ''}${change.toLocaleString('es-AR', { maximumFractionDigits: 1 })} pts`
    : `${up ? '+' : ''}${Math.round(change)} %`;
  return (
    <span className={`text-xs tabular-nums ${up ? 'text-green-300' : 'text-red-300'}`}>
      {up ? '▲' : '▼'} {text} <span className="text-slate-500">vs. período anterior</span>
    </span>
  );
}

function DaysChart({ days }: { days: VisitsReport['days'] }) {
  const [hover, setHover] = useState<number | null>(null);
  if (days.length === 0) return <p className="p-6 text-sm text-slate-500">Sin datos todavía.</p>;

  const W = 1000;
  const H = 220;
  const L = 40;
  const R = 10;
  const T = 12;
  const B = 26;
  const maxV = Math.max(...days.map((d) => d.visits), 1);
  const top = Math.max(10, Math.ceil(maxV / 10) * 10);
  const n = days.length;
  const slot = (W - L - R) / n;
  const bw = Math.max(2, slot - 2);
  const x = (i: number) => L + i * slot + (slot - bw) / 2;
  const y = (v: number) => T + (1 - v / top) * (H - T - B);
  const every = Math.ceil(n / 8);
  const hovered = hover === null ? null : days[hover];

  return (
    <div className="relative px-3 pb-3 pt-2">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full"
        role="img"
        aria-label="Visitas por día"
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const i = Math.floor((((e.clientX - r.left) * W) / r.width - L) / slot);
          setHover(i >= 0 && i < n ? i : null);
        }}
        onPointerLeave={() => setHover(null)}
      >
        {[0, top / 2, top].map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="#1e293b" />
            <text x={L - 6} y={y(t) + 3} textAnchor="end" fill="#64748b" fontSize={10}>
              {fmt(t)}
            </text>
          </g>
        ))}
        {days.map((d, i) => {
          const last = i === n - 1;
          return (
            <g key={d.date}>
              <rect
                x={x(i)}
                y={y(d.visits)}
                width={bw}
                height={y(0) - y(d.visits)}
                rx={Math.min(4, bw / 2)}
                fill={last ? '#a5b4fc' : SERIES}
                opacity={hover === null || hover === i ? 1 : 0.55}
              />
              {d.signups > 0 && (
                <circle cx={x(i) + bw / 2} cy={y(d.visits) - 9} r={Math.min(6, 3 + d.signups)} fill={SIGNUP} stroke="#0f172a" strokeWidth={2} />
              )}
              {(i % every === 0 || last) && (
                <text x={x(i) + bw / 2} y={H - 8} textAnchor="middle" fill="#64748b" fontSize={10}>
                  {last ? 'hoy' : dayLabel(d.date)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hovered && hover !== null && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs leading-relaxed text-slate-200 tabular-nums"
          style={{ left: `${((x(hover) + bw / 2) / W) * 100}%`, top: `${(y(hovered.visits) / H) * 100}%` }}
        >
          {weekday(hovered.date)} {dayLabel(hovered.date)}
          <br />
          Visitas <b className="text-white">≈ {fmt(hovered.visits)}</b>
          <br />
          Registros <b className="text-white">{hovered.signups}</b>
        </div>
      )}
    </div>
  );
}

function Funnel({ data }: { data: VisitsReport }) {
  const steps: Array<[string, string, number | null]> = [
    ['Visitas', 'personas que entraron a la web', data.visits],
    ['Registros', 'crearon su empresa en Oplex', data.signups],
    ['Empresas activas', 'usaron Oplex en los últimos 7 días', data.activeCompanies],
    ['Pagando', 'con plan pago activo', data.payingCompanies],
  ];
  // Sin visitas (Cloudflare sin conectar), el embudo arranca en registros.
  const base = data.visits ?? data.signups;
  return (
    <div className="flex flex-col gap-1 p-4">
      {steps.map(([name, detail, value], i) => {
        const v = value ?? 0;
        // Raíz cuadrada: con escala lineal los últimos pasos no se verían.
        const width = base ? Math.max(3, Math.sqrt(v / base) * 100) : 3;
        const next = steps[i + 1];
        return (
          <div key={name}>
            <div className="grid grid-cols-[minmax(120px,200px)_1fr_90px] items-center gap-3">
              <div className="text-sm text-slate-200">
                {name}
                <small className="block text-[11px] text-slate-500">{detail}</small>
              </div>
              <div className="h-[26px] overflow-hidden rounded-md bg-slate-800/50">
                {value !== null && (
                  <div
                    className="flex h-full min-w-[34px] items-center rounded-md pl-2 text-xs font-semibold tabular-nums text-indigo-950"
                    style={{ width: `${width}%`, background: SERIES }}
                  >
                    {base ? pct((v / base) * 100) : '—'}
                  </div>
                )}
              </div>
              <div className="text-right text-[15px] font-semibold tabular-nums text-white">
                {value === null ? '—' : `${i === 0 ? '≈ ' : ''}${fmt(v)}`}
              </div>
            </div>
            {next && (
              <div className="py-0.5 pl-[212px] text-[11px] tabular-nums text-slate-500 max-sm:pl-0">
                ↓ <b className="font-semibold text-slate-400">{value && next[2] !== null ? pct((next[2] / value) * 100) : '—'}</b> pasa al
                siguiente paso
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Rank({
  rows,
  total: periodTotal,
  label,
  code,
  mono,
}: {
  rows: VisitsRankRow[];
  /** Total del período (visitas o páginas vistas): el % es sobre eso, no sobre las filas que se muestran. */
  total: number | null;
  label: (key: string) => string;
  code?: (key: string) => string;
  mono?: boolean;
}) {
  if (rows.length === 0) return <p className="px-4 py-4 text-sm text-slate-500">Sin datos en este período.</p>;
  const total = periodTotal || rows.reduce((s, r) => s + r.value, 0);
  const top = rows[0].value;
  return (
    <ul className="flex flex-col gap-2.5 px-4 pb-3.5 pt-2.5">
      {rows.map((r) => (
        <li key={r.key} className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm">
          <span className="flex min-w-0 items-center gap-2">
            {code && (
              <span className="shrink-0 rounded bg-slate-800 px-1.5 py-px font-mono text-[10px] text-slate-400">{code(r.key)}</span>
            )}
            <span className={`truncate text-slate-200 ${mono ? 'font-mono text-xs' : ''}`}>{label(r.key)}</span>
          </span>
          <span className="text-right tabular-nums text-slate-200">
            {fmt(r.value)}
            <small className="ml-1.5 text-slate-500">{Math.round((r.value / total) * 100)} %</small>
          </span>
          <span className="col-span-2 h-1 overflow-hidden rounded-full bg-slate-800/50">
            <span className="block h-full rounded-full" style={{ width: `${(r.value / top) * 100}%`, background: SERIES }} />
          </span>
        </li>
      ))}
    </ul>
  );
}
