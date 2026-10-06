'use client';

import { adminServerApi, type ServerMetricPoint, type ServerSnapshot } from '@/lib/admin';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertBanner, AR_TIME_ZONE, Box, diskTone, formatBytes, formatDuration, formatWhen, Kv, Meter, StatCard, type Tone } from '../OpsUi';

// Mismos umbrales que OpsAlertsService (avisos por email).
const CPU_ALERT = 80;
const MEM_ALERT = 85;
const DISK_ALERT = 80;
const SERIES_COLOR = '#818cf8';

function arTime(iso: string, withDay: boolean): string {
  return new Date(iso).toLocaleString('es-AR', {
    timeZone: AR_TIME_ZONE,
    ...(withDay ? { day: '2-digit', month: '2-digit' } : {}),
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
}

/**
 * "Servidor" del panel Admin: lo que informa Ubuntu ahora (cada 30 s) y los
 * gráficos de las mediciones que guarda ServerMetricsService cada 5 minutos.
 * Si el servidor se cae, esta página se cae con él: para eso está el
 * vigilante externo (docs/DEPLOY.md).
 */
export default function AdminServerPage() {
  const [range, setRange] = useState<'24h' | '7d'>('24h');
  const { data: snap, isLoading } = useQuery({
    queryKey: ['admin-server'],
    queryFn: adminServerApi.snapshot,
    refetchInterval: 30_000,
  });
  const { data: history } = useQuery({
    queryKey: ['admin-server-history', range],
    queryFn: () => adminServerApi.history(range),
    refetchInterval: 5 * 60_000,
  });

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-white">Servidor</h1>
        <p className="mt-1 text-sm text-slate-500">
          Lo que informa el servidor en este momento. Se actualiza cada 30 segundos; los gráficos guardan una medición
          cada 5 minutos.
        </p>
      </div>
      {isLoading || !snap ? <p className="text-sm text-slate-500">Cargando...</p> : <ServerView snap={snap} history={history ?? []} />}

      <div className="flex items-center gap-2">
        {(['24h', '7d'] as const).map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRange(r)}
            aria-pressed={range === r}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
              range === r ? 'border-indigo-400 bg-indigo-500/20 text-white' : 'border-slate-700 text-slate-400 hover:text-white'
            }`}
          >
            {r === '24h' ? 'Últimas 24 h' : 'Últimos 7 días'}
          </button>
        ))}
      </div>
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(320px,1fr))]">
        <Box title={`Procesador · ${range === '24h' ? 'últimas 24 h' : 'últimos 7 días'}`} hint="% de uso">
          <MetricChart data={history ?? []} field="cpuPercent" limit={CPU_ALERT} withDay={range === '7d'} />
        </Box>
        <Box title={`Memoria · ${range === '24h' ? 'últimas 24 h' : 'últimos 7 días'}`} hint="% usado">
          <MetricChart data={history ?? []} field="memPercent" limit={MEM_ALERT} withDay={range === '7d'} />
        </Box>
      </div>

      {snap && <Facts snap={snap} />}

      <p className="text-xs text-slate-500">
        Si el servidor se cae, esta página se cae con él: para eso va el vigilante externo (UptimeRobot o Better Stack),
        que avisa por mail o WhatsApp.
      </p>
    </div>
  );
}

function ServerView({ snap, history }: { snap: ServerSnapshot; history: ServerMetricPoint[] }) {
  const today = new Date().toLocaleDateString('es-AR', { timeZone: AR_TIME_ZONE });
  const peak = history
    .filter((p) => new Date(p.takenAt).toLocaleDateString('es-AR', { timeZone: AR_TIME_ZONE }) === today)
    .reduce<ServerMetricPoint | null>((max, p) => (!max || p.cpuPercent > max.cpuPercent ? p : max), null);
  const cpuTone: Tone = snap.cpu.percent >= CPU_ALERT ? 'warn' : 'ok';
  const memTone: Tone = snap.memory.usedPercent >= MEM_ALERT ? 'warn' : 'ok';
  const dTone = diskTone(snap.disk.usedPercent, DISK_ALERT);
  const load15Percent = Math.round((snap.cpu.load15 / snap.cpu.cores) * 100);

  let banner: React.ReactNode = null;
  if (cpuTone !== 'ok' || memTone !== 'ok') {
    banner = (
      <AlertBanner tone="warn">
        <b className="text-white">El servidor está exigido.</b> Procesador al {snap.cpu.percent} % y memoria al{' '}
        {snap.memory.usedPercent} %. Si sigue así, conviene ver qué lo carga (Errores, Actividad) o pasar a un plan más
        grande.
      </AlertBanner>
    );
  } else if (dTone !== 'ok') {
    banner = (
      <AlertBanner tone="warn">
        <b className="text-white">El disco está al {snap.disk.usedPercent} %.</b> Quedan {formatBytes(snap.disk.freeBytes)}.
      </AlertBanner>
    );
  }

  return (
    <>
      {banner}
      <section className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]" aria-label="Estado del servidor">
        <StatCard title="Procesador" tone={cpuTone} pill={cpuTone === 'ok' ? 'Normal' : 'Exigido'} big={`${snap.cpu.percent} %`}>
          <Meter percent={snap.cpu.percent} tone={cpuTone} left="uso actual" right={`${snap.cpu.cores} núcleos`} />
          <Kv
            rows={[
              ['Promedio 15 min', `${Math.min(100, load15Percent)} %`],
              ['Pico de hoy', peak ? `${peak.cpuPercent} % a las ${arTime(peak.takenAt, false)}` : '—'],
            ]}
          />
        </StatCard>
        <StatCard
          title="Memoria"
          tone={memTone}
          pill={memTone === 'ok' ? 'Normal' : 'Exigida'}
          big={`${formatBytes(snap.memory.availableBytes)} libres`}
        >
          <Meter percent={snap.memory.usedPercent} tone={memTone} left={`${snap.memory.usedPercent} % usado`} right={formatBytes(snap.memory.totalBytes)} />
          <Kv
            rows={[
              [
                'Swap en uso',
                snap.memory.swapTotalBytes
                  ? `${formatBytes(snap.memory.swapUsedBytes)} de ${formatBytes(snap.memory.swapTotalBytes)}`
                  : 'sin swap',
              ],
              ['Base de datos', formatBytes(snap.facts.databaseBytes)],
            ]}
          />
        </StatCard>
        <StatCard title="Disco" tone={dTone} pill={dTone === 'ok' ? 'Sobra lugar' : 'Casi lleno'} big={`${formatBytes(snap.disk.freeBytes)} libres`}>
          <Meter percent={snap.disk.usedPercent} tone={dTone} left={`${snap.disk.usedPercent} % usado`} right={formatBytes(snap.disk.totalBytes)} />
          <Kv rows={[['Tamaño', 'leído del servidor']]} />
        </StatCard>
        <StatCard title="Encendido" tone="ok" pill="En línea" big={formatDuration(snap.uptime.serverSince)}>
          <Kv
            rows={[
              ['Servidor prendido desde', formatWhen(snap.uptime.serverSince)],
              ['Oplex corriendo desde', `${formatWhen(snap.uptime.appSince)} (último deploy o reinicio)`],
            ]}
          />
        </StatCard>
      </section>
    </>
  );
}

function MetricChart({
  data,
  field,
  limit,
  withDay,
}: {
  data: ServerMetricPoint[];
  field: 'cpuPercent' | 'memPercent';
  limit: number;
  withDay: boolean;
}) {
  if (data.length < 2) {
    return <p className="p-6 text-sm text-slate-500">Todavía no hay mediciones: se guarda una cada 5 minutos.</p>;
  }
  return (
    <div className="px-2 pb-3 pt-3">
      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
          <CartesianGrid stroke="#1e293b" vertical={false} />
          <XAxis
            dataKey="takenAt"
            tickFormatter={(v: string) => arTime(v, withDay)}
            tick={{ fill: '#64748b', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            minTickGap={40}
          />
          <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tickFormatter={(v: number) => `${v}%`} tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
          <ReferenceLine
            y={limit}
            stroke="#f59e0b"
            strokeDasharray="3 3"
            label={{ value: `aviso ${limit}%`, position: 'insideTopRight', fill: '#64748b', fontSize: 10 }}
          />
          <Tooltip
            contentStyle={{ background: '#020617', border: '1px solid #334155', borderRadius: 6, fontSize: 12 }}
            labelStyle={{ color: '#94a3b8' }}
            itemStyle={{ color: '#fff' }}
            labelFormatter={(v) => arTime(String(v), true)}
            formatter={(v) => [`${v} %`, field === 'cpuPercent' ? 'Procesador' : 'Memoria']}
          />
          <Area type="monotone" dataKey={field} stroke={SERIES_COLOR} strokeWidth={2} fill={SERIES_COLOR} fillOpacity={0.14} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function Facts({ snap }: { snap: ServerSnapshot }) {
  const f = snap.facts;
  const rows: Array<[string, React.ReactNode]> = [
    ['IP pública', f.publicIp ? <span className="font-mono">{f.publicIp}</span> : '—'],
    ['Proveedor y región', f.location ?? '—'],
    ['Sistema', f.os ? `${f.os} · kernel ${f.kernel}` : `kernel ${f.kernel}`],
    ['Nombre', f.hostname ? <span className="font-mono">{f.hostname}</span> : '—'],
    [
      'Núcleos / memoria',
      `${snap.cpu.cores} CPU · ${formatBytes(snap.memory.totalBytes)}${snap.memory.swapTotalBytes ? ` + ${formatBytes(snap.memory.swapTotalBytes)} de swap` : ''}`,
    ],
    ['Versión publicada', f.version ? <span className="font-mono">{f.version}</span> : '—'],
    ['Base de datos', `PostgreSQL · ${formatBytes(f.databaseBytes)}`],
    ['Hora del servidor', f.timeZone === 'UTC' || f.timeZone === 'Etc/UTC' ? 'UTC (Argentina −3 h)' : f.timeZone],
  ];
  return (
    <Box title="Datos del servidor" hint="Para cuando hables con soporte de Vultr">
      <dl className="grid grid-cols-[minmax(140px,auto)_1fr] gap-x-4 gap-y-2 px-4 pb-4 pt-3.5 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-slate-500">{label}</dt>
            <dd className="text-slate-200">{value}</dd>
          </div>
        ))}
      </dl>
    </Box>
  );
}
