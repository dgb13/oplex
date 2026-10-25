// Piezas compartidas de la lista de Tenants (/admin) y la ficha
// (/admin/tenants/[id]) - boceto aprobado del panel de Tenants.
import type { TenantHealth, TenantSummary } from '@/lib/admin';
import { AR_TIME_ZONE, Dot, formatDuration } from './OpsUi';

export const SUBSCRIPTION_LABELS: Record<string, { label: string; cls: string }> = {
  TRIALING: { label: 'Prueba', cls: 'bg-indigo-500/15 text-indigo-200' },
  ACTIVE: { label: 'Activa', cls: 'bg-green-900/50 text-green-300' },
  PAST_DUE: { label: 'Pago vencido', cls: 'bg-red-900/50 text-red-300' },
  EXPIRED: { label: 'Vencida', cls: 'bg-red-900/50 text-red-300' },
  CANCELLED: { label: 'Dada de baja', cls: 'bg-slate-800 text-slate-400' },
};

export const HEALTH_LABELS: Record<TenantHealth, string> = { ok: 'Bien', warn: 'Mirar', bad: 'En riesgo' };

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-AR', { timeZone: AR_TIME_ZONE });
}

export function formatAgo(iso: string | null | undefined): string {
  if (!iso) return 'nunca';
  const text = formatDuration(iso);
  return text === '0 min' ? 'recién' : `hace ${text}`;
}

export function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

export function trialDaysLeft(t: Pick<TenantSummary, 'subscriptionStatus' | 'trialEndsAt'>): number | null {
  if (t.subscriptionStatus !== 'TRIALING' || !t.trialEndsAt) return null;
  return Math.ceil((new Date(t.trialEndsAt).getTime() - Date.now()) / 86_400_000);
}

export function PlanPill({ tenant }: { tenant: TenantSummary }) {
  const sub = tenant.subscriptionStatus ? SUBSCRIPTION_LABELS[tenant.subscriptionStatus] : null;
  const left = trialDaysLeft(tenant);
  return (
    <span className={`whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium ${sub?.cls ?? 'bg-slate-800 text-slate-400'}`}>
      {tenant.planName ?? tenant.planKey ?? 'Sin plan'}
      {sub && tenant.subscriptionStatus !== 'ACTIVE' ? ` · ${sub.label}` : ''}
      {left !== null ? ` · ${Math.max(0, left)} d` : ''}
    </span>
  );
}

type IconState = 'on' | 'half' | 'off';

function IntegrationIcon({ label, state, title }: { label: string; state: IconState; title: string }) {
  const cls =
    state === 'on'
      ? 'border-transparent bg-green-900/50 text-green-300'
      : state === 'half'
        ? 'border-transparent bg-amber-900/50 text-amber-300'
        : 'border-slate-700 text-slate-600';
  return (
    <span
      title={title}
      aria-label={title}
      className={`grid h-[22px] w-[26px] place-items-center rounded border font-mono text-[9.5px] font-bold ${cls}`}
    >
      {label}
    </span>
  );
}

export function IntegrationIcons({ tenant }: { tenant: TenantSummary }) {
  return (
    <div className="flex gap-1">
      <IntegrationIcon
        label="AR"
        state={tenant.arcaEnv === 'PRODUCCION' ? 'on' : tenant.arcaEnv === 'HOMOLOGACION' ? 'half' : 'off'}
        title={
          tenant.arcaEnv === 'PRODUCCION'
            ? `ARCA en producción desde ${formatDate(tenant.arcaProductionAt)}`
            : tenant.arcaEnv === 'HOMOLOGACION'
              ? 'ARCA en homologación (pruebas)'
              : 'Sin certificado de ARCA'
        }
      />
      <IntegrationIcon
        label="WA"
        state={tenant.whatsappLinks > 0 ? 'on' : 'off'}
        title={tenant.whatsappLinks > 0 ? `${tenant.whatsappLinks} número(s) de WhatsApp vinculado(s)` : 'Sin WhatsApp'}
      />
      <IntegrationIcon
        label="MP"
        state={tenant.mercadoPagoConnectedAt ? 'on' : 'off'}
        title={
          tenant.mercadoPagoConnectedAt
            ? `Mercado Pago conectado desde ${formatDate(tenant.mercadoPagoConnectedAt)}`
            : 'Sin Mercado Pago'
        }
      />
      <IntegrationIcon
        label="TI"
        state={tenant.storefrontPublished ? 'on' : 'off'}
        title={tenant.storefrontPublished ? 'Tienda online publicada' : 'Sin tienda publicada'}
      />
    </div>
  );
}

export function IntegrationLegend() {
  return (
    <div className="flex flex-wrap gap-3 text-[11.5px] text-slate-500">
      <span className="flex items-center gap-1.5">
        <IntegrationIcon label="AR" state="on" title="" /> ARCA producción
      </span>
      <span className="flex items-center gap-1.5">
        <IntegrationIcon label="AR" state="half" title="" /> homologación
      </span>
      <span className="flex items-center gap-1.5">
        <IntegrationIcon label="WA" state="on" title="" /> WhatsApp
      </span>
      <span className="flex items-center gap-1.5">
        <IntegrationIcon label="MP" state="on" title="" /> Mercado Pago
      </span>
      <span className="flex items-center gap-1.5">
        <IntegrationIcon label="TI" state="on" title="" /> Tienda online
      </span>
      <span>Salud: actividad reciente, pago al día y consultas abiertas (pasá el mouse para ver el motivo)</span>
    </div>
  );
}

export function HealthBadge({ tenant }: { tenant: Pick<TenantSummary, 'health' | 'healthReasons'> }) {
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap" title={tenant.healthReasons.join(' · ') || 'Todo en orden'}>
      <Dot tone={tenant.health} />
      {HEALTH_LABELS[tenant.health]}
    </span>
  );
}
