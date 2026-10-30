'use client';

import { adminSubscriptionsApi, adminTenantsApi, type TenantDetail, type TenantStatus } from '@/lib/admin';
import { startImpersonation } from '@/lib/impersonation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import AdminSelect from '../../AdminSelect';
import { formatWhen } from '../../OpsUi';
import { formatAgo, formatDate, HealthBadge, PlanPill } from '../../TenantUi';

const nf = new Intl.NumberFormat('es-AR');

const ROLE_LABELS: Record<string, string> = {
  OWNER: 'Dueño',
  ADMIN: 'Admin',
  SALES: 'Ventas',
  PURCHASES: 'Compras',
  INVENTORY: 'Depósito',
  ACCOUNTANT: 'Contador',
  VIEWER: 'Consulta',
};

function extractErrorMessage(err: unknown, fallback: string): string {
  const message = (err as AxiosError<{ message?: string | string[] }> | undefined)?.response?.data?.message;
  if (!message) return fallback;
  return Array.isArray(message) ? message.join(', ') : message;
}

export default function AdminTenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: t, isLoading, isError } = useQuery({
    queryKey: ['admin-tenant-detail', id],
    queryFn: () => adminTenantsApi.detail(id),
  });

  if (isLoading) return <p className="text-sm text-slate-500">Cargando ficha...</p>;
  if (isError || !t)
    return (
      <div className="flex flex-col gap-3">
        <BackLink />
        <p className="text-sm text-red-400">No se pudo cargar este tenant.</p>
      </div>
    );

  return (
    <div className="flex flex-col gap-4">
      <Header t={t} />

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-slate-800 sm:grid-cols-4">
        <Stat label="Artículos" value={nf.format(t.articles)} />
        <Stat label="Clientes" value={nf.format(t.customers)} />
        <Stat label="Proveedores" value={nf.format(t.suppliers)} />
        <Stat label="Facturas este mes" value={nf.format(t.invoicesThisMonth)} />
        <Stat label="Cotizaciones" value={nf.format(t.quotes)} />
        <Stat label="Facturas en total" value={nf.format(t.usage.invoicesTotal)} />
        <Stat label="Pedidos de la tienda" value={nf.format(t.storefront.ordersTotal)} />
        <Stat label="Cobros MP (30 días)" value={nf.format(t.mercadoPago.paymentsLast30Days)} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <Section title="Línea de tiempo">
          <ol className="flex flex-col">
            {t.milestones.map((m, i) => (
              <li key={m.key} className="relative grid grid-cols-[84px_14px_minmax(0,1fr)] gap-2.5 pb-3">
                {i < t.milestones.length - 1 && (
                  <span className="absolute bottom-0 left-[100px] top-3.5 w-px bg-slate-700" aria-hidden />
                )}
                <time className="pt-px text-right font-mono text-[11.5px] text-slate-500">{m.at ? formatDate(m.at) : '—'}</time>
                <span
                  className={`z-[1] mt-[3px] h-[11px] w-[11px] rounded-full border-2 ${
                    m.at ? 'border-indigo-500 bg-indigo-500' : 'border-slate-600 bg-slate-900'
                  }`}
                  aria-hidden
                />
                <div className="min-w-0">
                  <b className={m.at ? 'font-semibold text-slate-100' : 'font-medium text-slate-500'}>{m.label}</b>
                  <small className="block text-[11.5px] text-slate-500">{m.at ? (m.detail ?? '') : 'todavía no'}</small>
                </div>
              </li>
            ))}
          </ol>
          <p className="text-[11.5px] text-slate-500">
            &quot;ARCA en producción&quot; se registra desde ahora al cargar el certificado. En los tenants anteriores
            es la fecha de su primera factura con CAE.
          </p>
        </Section>

        <div className="flex min-w-0 flex-col gap-4">
          <Section title="Integraciones">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <IntegrationCard
                title="ARCA"
                state={t.arca.env === 'PRODUCCION' ? 'Producción' : t.arca.env === 'HOMOLOGACION' ? 'Homologación' : 'Sin cargar'}
                tone={t.arca.env === 'PRODUCCION' ? 'ok' : t.arca.env ? 'warn' : 'off'}
                lines={[
                  t.arca.certExpiresAt ? `Certificado vence ${formatDate(t.arca.certExpiresAt)}` : null,
                  t.arca.lastCheckAt
                    ? `Último chequeo ${formatWhen(t.arca.lastCheckAt)} · ${t.arca.lastCheckOk ? 'OK' : (t.arca.lastCheckMessage ?? 'con error')}`
                    : null,
                ]}
              />
              <IntegrationCard
                title="WhatsApp"
                state={t.whatsappLinks ? `${t.whatsappLinks} vinculado(s)` : 'No'}
                tone={t.whatsappLinks ? 'ok' : 'off'}
                lines={t.users
                  .filter((u) => u.whatsappPhone)
                  .map((u) => `${u.whatsappPhone} (${u.email}) · ${formatDate(u.whatsappVerifiedAt)}`)}
              />
              <IntegrationCard
                title="Mercado Pago"
                state={t.mercadoPagoConnectedAt ? 'Conectado' : t.mercadoPago.status ? t.mercadoPago.status : 'No'}
                tone={t.mercadoPagoConnectedAt ? 'ok' : t.mercadoPago.status ? 'warn' : 'off'}
                lines={[
                  t.mercadoPago.nickname ? `Cuenta ${t.mercadoPago.nickname}` : null,
                  t.mercadoPago.connectedAt ? `Desde ${formatDate(t.mercadoPago.connectedAt)}` : null,
                  t.mercadoPago.lastErrorMessage ? `Último error: ${t.mercadoPago.lastErrorMessage}` : null,
                ]}
              />
              <IntegrationCard
                title="Tienda online"
                state={t.storefront.published ? 'Publicada' : t.storefront.subdomain ? 'Sin publicar' : 'No'}
                tone={t.storefront.published ? 'ok' : t.storefront.subdomain ? 'warn' : 'off'}
                lines={[
                  t.storefront.subdomain ? `${t.storefront.subdomain}.oplex.com.ar` : null,
                  t.storefront.template ? `Plantilla ${t.storefront.template}` : null,
                  t.email.mode !== 'SHARED'
                    ? `Correo propio: ${t.email.customDomain ?? '—'} (${t.email.domainStatus ?? 'sin verificar'})`
                    : 'Correo: el compartido de Oplex',
                ]}
              />
            </div>
          </Section>

          <Section title="Usuarios">
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="border-b border-slate-800 text-left text-[11.5px] text-slate-500">
                    <th className="py-2 pr-3 font-medium">Usuario</th>
                    <th className="py-2 pr-3 font-medium">Rol</th>
                    <th className="py-2 pr-3 font-medium">Último ingreso</th>
                    <th className="py-2 font-medium">WhatsApp</th>
                  </tr>
                </thead>
                <tbody>
                  {t.users.map((u) => (
                    <tr key={u.id} className="border-b border-slate-800/50">
                      <td className="py-2 pr-3 text-slate-200">
                        {u.email}
                        {u.name && <span className="block text-[11px] text-slate-500">{u.name}</span>}
                      </td>
                      <td className="py-2 pr-3 text-slate-400">{u.roles.map((r) => ROLE_LABELS[r] ?? r).join(', ')}</td>
                      <td className="py-2 pr-3 text-slate-400">{u.lastLoginAt ? formatAgo(u.lastLoginAt) : 'nunca'}</td>
                      <td className="py-2 text-slate-400">{u.whatsappPhone ? '✓' : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="Consumo y salud (últimos 30 días)">
            <dl className="grid grid-cols-[140px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[12.5px]">
              <dt className="text-slate-500">Salud</dt>
              <dd className="text-slate-200">
                {t.healthReasons.length ? t.healthReasons.join(' · ') : 'Todo en orden'}
              </dd>
              <dt className="text-slate-500">Asistente de IA</dt>
              <dd className="text-slate-200">{nf.format(t.usage.assistantMessagesLast30Days)} preguntas</dd>
              <dt className="text-slate-500">Otras funciones IA</dt>
              <dd className="text-slate-200">{nf.format(t.usage.aiEventsLast30Days)} usos (escaneo, padrón, etc.)</dd>
              <dt className="text-slate-500">Errores del sistema</dt>
              <dd className="text-slate-200">
                {t.usage.errorsLast30Days}{' '}
                {t.usage.errorsLast30Days > 0 && (
                  <Link href="/admin/errors" className="text-indigo-300 hover:underline">
                    ver en Errores
                  </Link>
                )}
              </dd>
              <dt className="text-slate-500">Suscripción</dt>
              <dd className="text-slate-200">
                {t.trialEndsAt && t.subscriptionStatus === 'TRIALING'
                  ? `Prueba hasta ${formatDate(t.trialEndsAt)}`
                  : (t.subscriptionStatus ?? 'sin suscripción')}{' '}
                <Link href="/admin/subscriptions" className="text-indigo-300 hover:underline">
                  ver pagos
                </Link>
              </dd>
              <dt className="text-slate-500">Consultas</dt>
              <dd className="text-slate-200">
                {t.openTickets} abiertas · {t.usage.resolvedTickets} resueltas{' '}
                {t.openTickets + t.usage.resolvedTickets > 0 && (
                  <Link href={`/admin/support?tenant=${t.id}`} className="text-indigo-300 hover:underline">
                    ver en Soporte
                  </Link>
                )}
              </dd>
            </dl>
          </Section>

          <NoteEditor tenantId={t.id} note={t.note} />
        </div>
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/admin" className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-slate-800">
      ← Volver
    </Link>
  );
}

function Header({ t }: { t: TenantDetail }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [mode, setMode] = useState<'idle' | 'status' | 'impersonate' | 'trial'>('idle');
  const [userId, setUserId] = useState('');
  const [days, setDays] = useState('7');
  const nextStatus: TenantStatus = t.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';

  const refresh = () => {
    setMode('idle');
    void queryClient.invalidateQueries({ queryKey: ['admin-tenant-detail', t.id] });
    void queryClient.invalidateQueries({ queryKey: ['admin-tenants'] });
  };
  const status = useMutation({ mutationFn: () => adminTenantsApi.updateStatus(t.id, nextStatus), onSuccess: refresh });
  const trial = useMutation({ mutationFn: () => adminSubscriptionsApi.extendTrial(t.id, Number(days)), onSuccess: refresh });
  const impersonate = useMutation({
    mutationFn: () => adminTenantsApi.impersonate(t.id, userId),
    onSuccess: (r) => startImpersonation(queryClient, router, t.id, r.accessToken, r.expiresAt),
  });
  const error = status.error ?? trial.error ?? impersonate.error;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold text-white">{t.name}</h1>
            <PlanPill tenant={t} />
            {t.status === 'SUSPENDED' && (
              <span className="rounded bg-red-900/50 px-2 py-0.5 text-xs font-medium text-red-300">Suspendido</span>
            )}
            <HealthBadge tenant={t} />
          </div>
          <p className="mt-0.5 font-mono text-[12px] text-slate-500">
            {t.taxId ?? 'sin CUIT'} · alta {formatDate(t.createdAt)} · última actividad {formatAgo(t.lastActivityAt)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <BackLink />
          <button
            type="button"
            onClick={() => setMode('impersonate')}
            className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-500"
          >
            Impersonar
          </button>
          {t.subscriptionStatus === 'TRIALING' || t.subscriptionStatus === 'EXPIRED' ? (
            <button
              type="button"
              onClick={() => setMode('trial')}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 transition hover:bg-slate-800"
            >
              Extender prueba
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setMode('status')}
            className={`rounded-lg border px-3 py-1.5 text-xs transition ${
              t.status === 'ACTIVE' ? 'border-red-800 text-red-400 hover:bg-red-950' : 'border-green-800 text-green-400 hover:bg-green-950'
            }`}
          >
            {t.status === 'ACTIVE' ? 'Suspender' : 'Activar'}
          </button>
        </div>
      </div>

      {mode !== 'idle' && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 p-3 text-xs">
          {mode === 'status' && (
            <>
              <span className="text-amber-400">
                {nextStatus === 'SUSPENDED'
                  ? '¿Confirmás suspender este tenant? No van a poder loguearse.'
                  : '¿Confirmás reactivar este tenant?'}
              </span>
              <ConfirmButton onClick={() => status.mutate()} pending={status.isPending} danger />
            </>
          )}
          {mode === 'impersonate' && (
            <>
              <AdminSelect
                className="min-w-56"
                buttonClassName="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200"
                value={userId}
                onChange={setUserId}
                placeholder="Elegí un usuario"
                options={t.users.map((u) => ({ value: u.id, label: `${u.email} (${u.roles.map((r) => ROLE_LABELS[r] ?? r).join(', ')})` }))}
              />
              <ConfirmButton onClick={() => userId && impersonate.mutate()} pending={impersonate.isPending} disabled={!userId} />
            </>
          )}
          {mode === 'trial' && (
            <>
              <label htmlFor="trial-days" className="text-slate-300">
                Sumar días de prueba
              </label>
              <input
                id="trial-days"
                type="number"
                min={1}
                max={90}
                value={days}
                onChange={(e) => setDays(e.target.value)}
                className="w-20 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-slate-200"
              />
              <ConfirmButton
                onClick={() => trial.mutate()}
                pending={trial.isPending}
                disabled={!(Number(days) >= 1 && Number(days) <= 90)}
              />
            </>
          )}
          <button type="button" onClick={() => setMode('idle')} className="px-2 py-1.5 text-slate-400 hover:text-slate-200">
            Volver
          </button>
          {error && <span className="text-red-400">{extractErrorMessage(error, 'No se pudo aplicar el cambio')}</span>}
        </div>
      )}
    </div>
  );
}

function ConfirmButton({ onClick, pending, disabled, danger }: { onClick: () => void; pending: boolean; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending || disabled}
      className={`rounded-lg px-3 py-1.5 font-semibold text-white transition disabled:opacity-50 ${
        danger ? 'bg-red-600 hover:bg-red-500' : 'bg-indigo-600 hover:bg-indigo-500'
      }`}
    >
      {pending ? 'Aplicando...' : 'Confirmar'}
    </button>
  );
}

function NoteEditor({ tenantId, note }: { tenantId: string; note: TenantDetail['note'] }) {
  const queryClient = useQueryClient();
  const [body, setBody] = useState(note?.body ?? '');
  useEffect(() => setBody(note?.body ?? ''), [note?.body]);
  const save = useMutation({
    mutationFn: () => adminTenantsApi.saveNote(tenantId, body),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['admin-tenant-detail', tenantId] }),
  });
  const dirty = body !== (note?.body ?? '');

  return (
    <Section title="Notas internas (sólo admins)">
      <textarea
        id="tenant-note"
        rows={3}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={5000}
        placeholder="Llamadas, acuerdos, lo que convenga recordar de este cliente."
        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-[13px] text-slate-200 placeholder:text-slate-600"
      />
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-slate-500">
        <span>
          {save.isError
            ? 'No se pudo guardar la nota.'
            : note
              ? `Guardada ${formatWhen(note.updatedAt)}${note.updatedByEmail ? ` por ${note.updatedByEmail}` : ''}`
              : 'Sin notas todavía.'}
        </span>
        <button
          type="button"
          onClick={() => save.mutate()}
          disabled={!dirty || save.isPending}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-40"
        >
          {save.isPending ? 'Guardando...' : 'Guardar nota'}
        </button>
      </div>
    </Section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-2.5 rounded-xl border border-slate-800 bg-slate-900 p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</h2>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-900 p-3">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className="text-lg font-semibold tabular-nums text-white">{value}</p>
    </div>
  );
}

function IntegrationCard({
  title,
  state,
  tone,
  lines,
}: {
  title: string;
  state: string;
  tone: 'ok' | 'warn' | 'off';
  lines: Array<string | null>;
}) {
  const cls =
    tone === 'ok' ? 'bg-green-900/50 text-green-300' : tone === 'warn' ? 'bg-amber-900/50 text-amber-300' : 'bg-slate-800 text-slate-400';
  const shown = lines.filter(Boolean) as string[];
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg border border-slate-800 p-2.5 text-xs">
      <div className="flex items-center justify-between gap-2 text-[12.5px] font-semibold text-slate-100">
        {title}
        <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${cls}`}>{state}</span>
      </div>
      {shown.length ? (
        shown.map((l) => (
          <span key={l} className="break-words text-slate-500">
            {l}
          </span>
        ))
      ) : (
        <span className="text-slate-600">—</span>
      )}
    </div>
  );
}
