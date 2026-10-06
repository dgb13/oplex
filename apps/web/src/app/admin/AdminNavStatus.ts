import { adminBackupsApi, adminErrorsApi, adminSystemStatusApi } from '@/lib/admin';
import { useQuery } from '@tanstack/react-query';
import { AR_TIME_ZONE, diskTone, type Tone } from './OpsUi';

export interface NavChip {
  tone: Tone;
  label: string;
}

const HOUR = 3_600_000;
// Argentina no tiene horario de verano: siempre UTC-3.
function arMidnightIso(): string {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: AR_TIME_ZONE });
  return new Date(`${today}T00:00:00-03:00`).toISOString();
}

/**
 * Estados que muestra la barra lateral del admin al lado de cada pantalla
 * (boceto aprobado del menú, opción B). Sale de los mismos endpoints que
 * usan esas pantallas - no hay un endpoint propio. Se refresca cada minuto;
 * si algo falla, ese chip simplemente no aparece.
 */
export function useAdminNavStatus(): Partial<Record<string, NavChip>> {
  const errors = useQuery({
    queryKey: ['admin-nav-errors'],
    queryFn: () => adminErrorsApi.list({ statusCodeMin: 500, from: arMidnightIso(), limit: 500 }),
    refetchInterval: 60_000,
  });
  const config = useQuery({
    queryKey: ['admin-system-status'],
    queryFn: adminSystemStatusApi.getStatus,
    refetchInterval: 60_000,
  });
  const overview = useQuery({
    queryKey: ['admin-backups-overview'],
    queryFn: adminBackupsApi.overview,
    refetchInterval: 60_000,
  });
  const latest = useQuery({
    queryKey: ['admin-nav-latest-backup'],
    queryFn: () => adminBackupsApi.list(1),
    refetchInterval: 60_000,
  });

  const chips: Partial<Record<string, NavChip>> = {};

  if (errors.data) {
    const n = errors.data.length;
    if (n > 0) chips['/admin/errors'] = { tone: n >= 10 ? 'bad' : 'warn', label: `${n >= 500 ? '500+' : n} hoy` };
  }

  if (config.data) {
    const missing = config.data.filter((i) => !i.configured).length;
    if (missing > 0) chips['/admin/system-status'] = { tone: 'warn', label: `${missing} ${missing === 1 ? 'falta' : 'faltan'}` };
  }

  if (overview.data && latest.data) {
    const { offsite, settings, disk, thresholds } = overview.data;
    const staleMs = Math.max(26, settings.frequencyHours + 2) * HOUR;
    const last = latest.data[0];
    const now = Date.now();
    if (last?.status === 'FAILED' || (offsite.configured && offsite.ok === false)) {
      chips['/admin/backups'] = { tone: 'bad', label: 'Falló' };
    } else if (
      !last ||
      now - new Date(last.startedAt).getTime() > staleMs ||
      !offsite.lastSuccessAt ||
      now - new Date(offsite.lastSuccessAt).getTime() > staleMs
    ) {
      chips['/admin/backups'] = { tone: 'warn', label: 'Atrasado' };
    } else {
      chips['/admin/backups'] = { tone: 'ok', label: 'Al día' };
    }
    const dTone = diskTone(disk.usedPercent, thresholds.diskPercent);
    if (dTone !== 'ok') chips['/admin/server'] = { tone: dTone, label: `Disco ${disk.usedPercent} %` };
  }

  return chips;
}
