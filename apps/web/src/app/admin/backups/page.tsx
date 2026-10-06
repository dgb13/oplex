'use client';

import {
  adminBackupsApi,
  type BackupSettings,
  type BackupsOverview,
  type BackupStatus,
  type DatabaseBackup,
  type OffsiteRun,
} from '@/lib/admin';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import {
  AlertBanner,
  Box,
  diskTone,
  Dot,
  ErrorLine,
  formatBytes,
  formatWhen,
  Kv,
  Meter,
  StatCard,
  type Tone,
} from '../OpsUi';

const HOUR = 3_600_000;
// Precio publicado de R2 por GB/mes pasada la capa gratis (a revisar en
// cloudflare.com si cambia) - sólo para el "costo estimado" de la tarjeta.
const R2_USD_PER_GB_MONTH = 0.015;
// Argentina no tiene horario de verano: siempre UTC-3.
const AR_OFFSET_HOURS = -3;

const FREQUENCY_OPTIONS = [
  { value: 12, label: 'Cada 12 horas' },
  { value: 24, label: 'Todos los días (recomendado)' },
  { value: 48, label: 'Cada 2 días' },
  { value: 168, label: 'Una vez por semana' },
];
const HOUR_OPTIONS = [21, 22, 23, 0, 1, 2, 3, 4, 5];
const KEEP_LOCAL_OPTIONS = [3, 5, 7, 10];
const KEEP_OFFSITE_OPTIONS = [15, 30, 60, 90];

const STATUS_TONE: Record<BackupStatus, Tone> = { PENDING: 'warn', COMPLETED: 'ok', FAILED: 'bad' };
const STATUS_LABEL: Record<BackupStatus, string> = { PENDING: 'En curso', COMPLETED: 'OK', FAILED: 'Falló' };

function hh(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

/** Próxima copia según la programación (misma regla que BackupSchedulerService). */
function nextBackupAt(settings: BackupSettings, lastOk: DatabaseBackup | undefined): Date | null {
  const hours = settings.frequencyHours === 12 ? [settings.hour, (settings.hour + 12) % 24] : [settings.hour];
  const start = new Date();
  start.setUTCMinutes(0, 0, 0);
  for (let i = 1; i <= 24 * 8; i += 1) {
    const candidate = new Date(start.getTime() + i * HOUR);
    const arHour = (candidate.getUTCHours() + 24 + AR_OFFSET_HOURS) % 24;
    if (!hours.includes(arHour)) continue;
    if (settings.frequencyHours > 24 && lastOk) {
      if (candidate.getTime() - new Date(lastOk.startedAt).getTime() < (settings.frequencyHours - 2) * HOUR) continue;
    }
    return candidate;
  }
  return null;
}

function scheduleHint(s: BackupSettings): { text: string; warn: boolean } {
  const when = {
    12: `a las ${hh(s.hour)} y 12 horas después`,
    24: `todos los días a las ${hh(s.hour)}`,
    48: `cada 2 días a las ${hh(s.hour)}`,
    168: `una vez por semana a las ${hh(s.hour)}`,
  }[s.frequencyHours];
  const lost = { 12: '12 horas', 24: '1 día', 48: '2 días', 168: '7 días' }[s.frequencyHours];
  const localSpan = (s.keepLocal * s.frequencyHours) / 24;
  const localText = localSpan < 1 ? `${s.keepLocal * s.frequencyHours} horas` : `${localSpan.toLocaleString('es-AR')} días`;
  return {
    text: `Copia ${when}. Si se rompe el servidor, como mucho se pierde ${lost} de trabajo. El servidor cubre ${localText} hacia atrás; R2, ${s.keepOffsiteDays} días (unas ${Math.round((s.keepOffsiteDays * 24) / s.frequencyHours)} copias).`,
    warn: s.frequencyHours > 24,
  };
}

function uploadedSummary(run: OffsiteRun): string {
  const dumps = `${run.uploadedDumps} ${run.uploadedDumps === 1 ? 'copia' : 'copias'}`;
  const files = `${run.uploadedFiles} ${run.uploadedFiles === 1 ? 'archivo' : 'archivos'}`;
  return run.movedFiles ? `${dumps} · ${files} · ${run.movedFiles} borrados` : `${dumps} · ${files}`;
}

function basename(path: string | null): string {
  return path ? path.split(/[\\/]/).pop() ?? '' : '';
}

// Sólo lectura sobre los datos - sin botón de "Restaurar backup" (ver
// PROGRESS.md): un restore pisa TODOS los tenants de la plataforma de una.
// El paso a paso para restaurar está en docs/DEPLOY.md.
export default function AdminBackupsPage() {
  const { data: overview, isLoading: loadingOverview } = useQuery({
    queryKey: ['admin-backups-overview'],
    queryFn: adminBackupsApi.overview,
    refetchInterval: 60_000,
  });
  const { data: backups, isLoading: loadingList } = useQuery({
    queryKey: ['admin-backups'],
    queryFn: () => adminBackupsApi.list(30),
  });

  if (loadingOverview || loadingList || !overview || !backups) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-xl font-semibold text-white">Backups</h1>
        <p className="text-sm text-slate-500">Cargando...</p>
      </div>
    );
  }

  return <BackupsView overview={overview} backups={backups} />;
}

function BackupsView({ overview, backups }: { overview: BackupsOverview; backups: DatabaseBackup[] }) {
  const { settings, offsite, disk, thresholds } = overview;
  const now = Date.now();
  const staleMs = Math.max(26, settings.frequencyHours + 2) * HOUR;

  // --- Copia de la base (servidor)
  const latest = backups[0];
  const lastOk = backups.find((b) => b.status === 'COMPLETED');
  const baseTone: Tone =
    latest?.status === 'FAILED' ? 'bad' : !lastOk || now - new Date(lastOk.startedAt).getTime() > staleMs ? 'warn' : 'ok';
  const basePill = baseTone === 'bad' ? 'Falló' : baseTone === 'warn' ? 'Atrasada' : 'Al día';
  const next = nextBackupAt(settings, lastOk);

  // --- Copia externa (R2)
  const lastRun = offsite.runs[0];
  const lastOkRun = offsite.runs.find((r) => r.ok);
  const offsiteStale = !offsite.lastSuccessAt || now - new Date(offsite.lastSuccessAt).getTime() > staleMs;
  const r2Tone: Tone = !offsite.configured ? 'warn' : offsite.ok === false ? 'bad' : offsiteStale ? 'warn' : 'ok';
  const r2Pill = !offsite.configured ? 'Sin armar' : offsite.ok === false ? 'Falló' : offsiteStale ? 'Sin noticias' : 'Al día';
  const r2Big = !offsite.configured
    ? 'Todavía no corrió'
    : offsite.ok === false
      ? `Falló ${formatWhen(offsite.finishedAt).toLowerCase()}`
      : offsiteStale
        ? `Última: ${formatWhen(offsite.lastSuccessAt)}`
        : formatWhen(offsite.lastSuccessAt);

  // --- Espacio en R2
  const bucket = offsite.bucketBytes ?? 0;
  const freePercent = Math.round((bucket / thresholds.r2FreeTierBytes) * 100);
  const extraGb = Math.max(0, bucket - thresholds.r2FreeTierBytes) / 1024 ** 3;
  const r2UseTone: Tone = bucket > thresholds.r2AlertBytes ? 'warn' : 'ok';
  const dumpsBytes = (offsite.dumps ?? []).reduce((sum, d) => sum + d.sizeBytes, 0);

  // --- Disco
  const dTone = diskTone(disk.usedPercent, thresholds.diskPercent);

  // --- Aviso arriba: el problema más grave + si ya salió el mail.
  const sentFor = (kinds: string[]) => {
    const alert = overview.alerts.find((a) => kinds.includes(a.kind) && now - new Date(a.sentAt).getTime() < 24 * HOUR);
    return alert ? `Email enviado ${formatWhen(alert.sentAt).toLowerCase()}` : undefined;
  };
  let banner: { tone: 'warn' | 'bad'; text: React.ReactNode; aside?: string } | null = null;
  if (offsite.configured && offsite.ok === false) {
    banner = {
      tone: 'bad',
      text: (
        <>
          <b className="text-white">La última subida a R2 falló.</b> La copia de la base está en el servidor, pero no
          salió afuera. Error: {offsite.error ?? 'sin detalle'}.
        </>
      ),
      aside: sentFor(['offsite-failed']),
    };
  } else if (latest?.status === 'FAILED') {
    banner = {
      tone: 'bad',
      text: (
        <>
          <b className="text-white">La última copia de la base falló.</b> {latest.errorMessage ?? ''}
        </>
      ),
      aside: sentFor(['backup-failed']),
    };
  } else if (offsite.configured && offsiteStale) {
    banner = {
      tone: 'warn',
      text: (
        <>
          <b className="text-white">La subida a R2 no corre desde {formatWhen(offsite.lastSuccessAt).toLowerCase()}.</b> No
          hay error porque no arrancó: probablemente se borró la tarea programada del servidor o el servidor estaba
          apagado.
        </>
      ),
      aside: sentFor(['offsite-stale']),
    };
  } else if (dTone !== 'ok') {
    banner = {
      tone: 'warn',
      text: (
        <>
          <b className="text-white">El disco del servidor está al {disk.usedPercent} %.</b> Quedan{' '}
          {formatBytes(disk.freeBytes)}. Si se llena, Oplex deja de guardar fotos, PDFs y la copia de la base.
        </>
      ),
      aside: sentFor(['disk-high']),
    };
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-white">Backups</h1>
        <p className="mt-1 text-sm text-slate-500">
          Copia de la base en el servidor y copia cifrada fuera del servidor, en Cloudflare R2. Horarios en hora de
          Argentina. Para restaurar, ver docs/DEPLOY.md.
        </p>
      </div>

      {banner && (
        <AlertBanner tone={banner.tone} aside={banner.aside}>
          {banner.text}
        </AlertBanner>
      )}

      <section className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]" aria-label="Estado">
        <StatCard title="Copia de la base" tone={baseTone} pill={basePill} big={lastOk ? formatWhen(lastOk.startedAt) : 'Nunca'}>
          {latest?.status === 'FAILED' && latest.errorMessage && <ErrorLine>{latest.errorMessage}</ErrorLine>}
          <Kv
            rows={[
              ['Dónde', 'En el servidor'],
              ['Tamaño', formatBytes(lastOk?.sizeBytes)],
              ['Se guardan', `últimas ${settings.keepLocal}`],
              ['Próxima', next ? formatWhen(next.toISOString()) : '—'],
            ]}
          />
        </StatCard>

        <StatCard title="Copia externa (R2)" tone={r2Tone} pill={r2Pill} big={r2Big}>
          {offsite.ok === false && offsite.error && <ErrorLine>{offsite.error}</ErrorLine>}
          <Kv
            rows={[
              ['Subió', lastOkRun ? uploadedSummary(lastOkRun) : '—'],
              ['Duró', lastRun ? `${lastRun.durationSec} s` : '—'],
              ['Se guardan', `${offsite.keepDays ?? settings.keepOffsiteDays} días`],
              ['Próxima', 'después de la próxima copia'],
            ]}
          />
          {!offsite.configured && (
            <p className="text-xs text-amber-300">
              Este servidor todavía no informó ninguna subida. Ver &quot;Backups&quot; en docs/DEPLOY.md.
            </p>
          )}
        </StatCard>

        <StatCard
          title="Espacio usado en R2"
          tone={r2UseTone}
          pill={extraGb > 0 ? 'Con costo' : 'Sin costo'}
          pillTone={extraGb > 0 ? 'warn' : 'gray'}
          big={formatBytes(offsite.bucketBytes)}
        >
          <Meter
            percent={freePercent}
            tone={r2UseTone}
            left={`${freePercent} % de la capa gratis`}
            right={formatBytes(thresholds.r2FreeTierBytes)}
          />
          <Kv
            rows={[
              ['Copias de la base', `${offsite.dumps?.length ?? 0} · ${formatBytes(dumpsBytes)}`],
              ['Fotos y PDFs', formatBytes(offsite.files?.bytes)],
              [
                'Costo estimado',
                `USD ${(extraGb * R2_USD_PER_GB_MONTH).toLocaleString('es-AR', { maximumFractionDigits: 2 })} / mes`,
              ],
            ]}
          />
        </StatCard>

        <StatCard
          title="Disco del servidor"
          tone={dTone}
          pill={dTone === 'ok' ? 'Sobra lugar' : 'Casi lleno'}
          big={`${formatBytes(disk.freeBytes)} libres`}
        >
          <Meter percent={disk.usedPercent} tone={dTone} left={`${disk.usedPercent} % usado`} right={formatBytes(disk.totalBytes)} />
          <Kv
            rows={[
              ['Base de datos', formatBytes(overview.databaseBytes)],
              ['Fotos y PDFs', formatBytes(offsite.files?.bytes)],
              ['Copias locales', formatBytes(overview.localBackupsBytes)],
            ]}
          />
        </StatCard>
      </section>

      <ScheduleForm settings={settings} />

      <Box title="Últimas copias" hint="Cada fila es una copia: primero la de la base en el servidor, después la subida a R2.">
        <HistoryTable backups={backups} runs={offsite.runs} configured={offsite.configured} />
      </Box>

      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(320px,1fr))]">
        <R2Contents overview={overview} />
        <AlertsBox overview={overview} />
      </div>
    </div>
  );
}

function ScheduleForm({ settings }: { settings: BackupSettings }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(settings);
  const [saved, setSaved] = useState(false);
  useEffect(() => setDraft(settings), [settings]);

  const mutation = useMutation({
    mutationFn: adminBackupsApi.updateSettings,
    onSuccess: () => {
      setSaved(true);
      void queryClient.invalidateQueries({ queryKey: ['admin-backups-overview'] });
    },
  });
  const change = (patch: Partial<BackupSettings>) => {
    setSaved(false);
    setDraft((d) => ({ ...d, ...patch }));
  };
  const hint = scheduleHint(draft);
  const selectCls =
    'rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none';
  const labelCls = 'flex flex-col gap-1.5 text-xs text-slate-500';

  return (
    <Box title="Programación" hint="La subida a R2 sigue sola a cada copia, dentro de la hora siguiente.">
      <form
        className="flex flex-wrap items-end gap-x-4 gap-y-3 px-4 pb-2 pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate(draft);
        }}
      >
        <label className={labelCls} htmlFor="backup-frequency">
          Frecuencia
          <select
            id="backup-frequency"
            className={selectCls}
            value={draft.frequencyHours}
            onChange={(e) => change({ frequencyHours: Number(e.target.value) })}
          >
            {FREQUENCY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className={labelCls} htmlFor="backup-hour">
          Hora
          <select id="backup-hour" className={selectCls} value={draft.hour} onChange={(e) => change({ hour: Number(e.target.value) })}>
            {(HOUR_OPTIONS.includes(draft.hour) ? HOUR_OPTIONS : [draft.hour, ...HOUR_OPTIONS]).map((h) => (
              <option key={h} value={h}>
                {hh(h)}
              </option>
            ))}
          </select>
        </label>
        <label className={labelCls} htmlFor="backup-keep-local">
          En el servidor guardar
          <select
            id="backup-keep-local"
            className={selectCls}
            value={draft.keepLocal}
            onChange={(e) => change({ keepLocal: Number(e.target.value) })}
          >
            {(KEEP_LOCAL_OPTIONS.includes(draft.keepLocal) ? KEEP_LOCAL_OPTIONS : [draft.keepLocal, ...KEEP_LOCAL_OPTIONS]).map(
              (n) => (
                <option key={n} value={n}>
                  {n} copias
                </option>
              ),
            )}
          </select>
        </label>
        <label className={labelCls} htmlFor="backup-keep-offsite">
          En R2 guardar
          <select
            id="backup-keep-offsite"
            className={selectCls}
            value={draft.keepOffsiteDays}
            onChange={(e) => change({ keepOffsiteDays: Number(e.target.value) })}
          >
            {(KEEP_OFFSITE_OPTIONS.includes(draft.keepOffsiteDays)
              ? KEEP_OFFSITE_OPTIONS
              : [draft.keepOffsiteDays, ...KEEP_OFFSITE_OPTIONS]
            ).map((n) => (
              <option key={n} value={n}>
                {n} días
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={mutation.isPending}
          className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:opacity-50"
        >
          {mutation.isPending ? 'Guardando...' : 'Guardar'}
        </button>
      </form>
      <p className={`px-4 pb-4 pt-1 text-xs ${hint.warn ? 'text-amber-300' : 'text-slate-400'}`}>
        {mutation.isError ? <span className="text-red-300">No se pudo guardar. Probá de nuevo. </span> : null}
        {saved ? 'Guardado. ' : ''}
        {hint.text}
      </p>
    </Box>
  );
}

function HistoryTable({ backups, runs, configured }: { backups: DatabaseBackup[]; runs: OffsiteRun[]; configured: boolean }) {
  if (backups.length === 0) {
    return <p className="p-6 text-sm text-slate-500">Todavía no corrió ninguna copia.</p>;
  }
  // runs viene de la más nueva a la más vieja: la primera subida de cada dump
  // es la última coincidencia.
  const firstUpload = (dump: string) => [...runs].reverse().find((r) => r.ok && r.dump === dump && r.uploadedDumps > 0);
  const lastAttempt = (dump: string) => runs.find((r) => r.dump === dump);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-800 text-left text-xs text-slate-500">
            <th className="whitespace-nowrap p-3 font-medium">Copia</th>
            <th className="whitespace-nowrap p-3 font-medium">Copia de la base</th>
            <th className="whitespace-nowrap p-3 text-right font-medium">Tamaño</th>
            <th className="whitespace-nowrap p-3 font-medium">Subida a R2</th>
            <th className="whitespace-nowrap p-3 font-medium">Qué subió</th>
            <th className="whitespace-nowrap p-3 font-medium">Detalle</th>
          </tr>
        </thead>
        <tbody>
          {backups.map((b) => {
            const dump = basename(b.filePath);
            const upload = b.status === 'COMPLETED' && dump ? firstUpload(dump) : undefined;
            const attempt = !upload && dump ? lastAttempt(dump) : undefined;
            let r2: React.ReactNode = <span className="text-slate-600">—</span>;
            if (upload) {
              r2 = (
                <span className="inline-flex items-center gap-1.5">
                  <Dot tone="ok" />
                  OK <small className="text-xs text-slate-500">{formatWhen(upload.at)} · {upload.durationSec} s</small>
                </span>
              );
            } else if (attempt && !attempt.ok) {
              r2 = (
                <span className="inline-flex items-center gap-1.5">
                  <Dot tone="bad" />
                  Falló <small className="text-xs text-slate-500">{formatWhen(attempt.at)}</small>
                </span>
              );
            } else if (b.status === 'COMPLETED' && configured) {
              r2 = (
                <span className="inline-flex items-center gap-1.5">
                  <Dot tone="warn" />
                  Pendiente
                </span>
              );
            }
            const detail = b.errorMessage ?? (attempt && !attempt.ok ? attempt.error : null);
            return (
              <tr key={b.id} className="border-b border-slate-800/50 last:border-0 hover:bg-slate-800/30">
                <td className="whitespace-nowrap p-3 tabular-nums text-slate-300">{formatWhen(b.startedAt)}</td>
                <td className="whitespace-nowrap p-3">
                  <span className="inline-flex items-center gap-1.5">
                    <Dot tone={STATUS_TONE[b.status]} />
                    {STATUS_LABEL[b.status]}
                  </span>
                </td>
                <td className="whitespace-nowrap p-3 text-right tabular-nums text-slate-300">{formatBytes(b.sizeBytes)}</td>
                <td className="whitespace-nowrap p-3">{r2}</td>
                <td className="whitespace-nowrap p-3 text-slate-300">{upload ? uploadedSummary(upload) : '—'}</td>
                <td className={`p-3 text-xs ${detail ? 'text-amber-300' : 'text-slate-600'}`}>{detail ?? '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function R2Contents({ overview }: { overview: BackupsOverview }) {
  const [showAll, setShowAll] = useState(false);
  const { offsite } = overview;
  const keepDays = offsite.keepDays ?? overview.settings.keepOffsiteDays;
  const dumps = offsite.dumps ?? [];
  const visible = showAll ? dumps : dumps.slice(0, 3);
  const deleteOn = (iso: string) =>
    new Date(new Date(iso).getTime() + keepDays * 24 * HOUR).toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
    });

  return (
    <Box title="Qué hay en R2" hint="Bucket oplex-backups · cifrado">
      {!offsite.configured ? (
        <p className="p-4 text-sm text-slate-500">Todavía no hay información de R2 en este servidor.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-left text-xs text-slate-500">
                  <th className="p-3 font-medium">Copia de la base</th>
                  <th className="p-3 text-right font-medium">Tamaño</th>
                  <th className="p-3 font-medium">Se borra el</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((d) => (
                  <tr key={d.name} className="border-b border-slate-800/50">
                    <td className="whitespace-nowrap p-3 tabular-nums text-slate-300">{formatWhen(d.modifiedAt)}</td>
                    <td className="whitespace-nowrap p-3 text-right tabular-nums text-slate-300">{formatBytes(d.sizeBytes)}</td>
                    <td className="whitespace-nowrap p-3 tabular-nums text-slate-400">{deleteOn(d.modifiedAt)}</td>
                  </tr>
                ))}
                {dumps.length > 3 && (
                  <tr>
                    <td colSpan={3} className="p-3">
                      <button type="button" onClick={() => setShowAll((v) => !v)} className="text-xs text-slate-400 underline hover:text-slate-200">
                        {showAll
                          ? 'Ver menos'
                          : `… y ${dumps.length - 3} copias más (desde el ${formatWhen(dumps[dumps.length - 1].modifiedAt)})`}
                      </button>
                    </td>
                  </tr>
                )}
                {dumps.length === 0 && (
                  <tr>
                    <td colSpan={3} className="p-3 text-xs text-slate-500">
                      {offsite.ok === false ? 'La última subida falló: el detalle vuelve con la próxima subida buena.' : 'Sin copias todavía.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="border-t border-slate-800 px-4 pb-4 pt-3">
            <Kv
              rows={[
                [
                  'Fotos y PDFs (espejo)',
                  offsite.files ? `${offsite.files.count.toLocaleString('es-AR')} archivos · ${formatBytes(offsite.files.bytes)}` : '—',
                ],
                [
                  `Borrados que se guardan ${keepDays} días`,
                  offsite.deletedFiles
                    ? `${offsite.deletedFiles.count.toLocaleString('es-AR')} archivos · ${formatBytes(offsite.deletedFiles.bytes)}`
                    : '—',
                ],
              ]}
            />
          </div>
        </>
      )}
    </Box>
  );
}

function AlertsBox({ overview }: { overview: BackupsOverview }) {
  const { thresholds } = overview;
  const rules = [
    ['La copia de la base falló', 'o no se hizo en el tiempo programado'],
    ['La subida a R2 falló', 'o no corrió en el tiempo programado'],
    [`Disco del servidor por encima del ${thresholds.diskPercent} %`, 'un aviso por día mientras siga así'],
    [`R2 por encima de ${formatBytes(thresholds.r2AlertBytes)}`, 'cerca de dejar la capa gratis'],
    [
      `Procesador o memoria altos media hora seguida`,
      `más de ${thresholds.cpuPercent} % de procesador o ${thresholds.memoryPercent} % de memoria`,
    ],
  ];
  const last = overview.alerts[0];

  return (
    <Box title="Avisos por email" hint="Se revisa todos los días a la 01:00">
      <p className="px-4 pt-3.5 text-sm text-slate-400">
        Se envían a los admins de la plataforma:{' '}
        {overview.recipients.length ? (
          overview.recipients.map((r) => (
            <code key={r} className="mr-1 rounded bg-slate-800 px-1.5 py-0.5 font-mono text-slate-200">
              {r}
            </code>
          ))
        ) : (
          <span className="text-amber-300">nadie (falta PLATFORM_ADMIN_EMAILS)</span>
        )}
      </p>
      <ul className="flex flex-col px-4 pb-4 pt-2">
        {rules.map(([title, detail]) => (
          <li key={title} className="flex items-center justify-between gap-3 border-b border-slate-800/50 py-2.5 text-sm last:border-0">
            <span className="text-slate-200">
              {title}
              <small className="mt-0.5 block text-xs text-slate-500">{detail}</small>
            </span>
            <span className="relative h-5 w-[34px] shrink-0 rounded-full bg-green-500" role="img" aria-label="activado">
              <span className="absolute right-[3px] top-[3px] h-3.5 w-3.5 rounded-full bg-white" />
            </span>
          </li>
        ))}
      </ul>
      {last && (
        <div className="mx-4 mb-4 rounded-lg border border-slate-800 bg-slate-50 p-4 text-sm leading-relaxed text-slate-900">
          <div className="mb-2 text-[11px] text-slate-500">
            Último aviso enviado · {formatWhen(last.sentAt)}
          </div>
          <h3 className="mb-2 text-[15px] font-semibold">{last.subject}</h3>
          <p>{last.message}</p>
        </div>
      )}
    </Box>
  );
}
