'use client';

import { adminArcaPadronApi, type ArcaPadronTestResult, type SystemStatusItem } from '@/lib/admin';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';

const DATE = new Intl.DateTimeFormat('es-AR', { dateStyle: 'short' });
const TIME = new Intl.DateTimeFormat('es-AR', { timeStyle: 'short' });
const DATE_TIME = new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' });

function apiError(err: unknown, fallback: string): string {
  const message = (err as AxiosError<{ message?: string | string[] }>)?.response?.data?.message;
  return Array.isArray(message) ? message.join(', ') : (message ?? fallback);
}

function formatCuit(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 11);
  if (d.length > 10) return `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}`;
  if (d.length > 2) return `${d.slice(0, 2)}-${d.slice(2)}`;
  return d;
}

const btn =
  'shrink-0 rounded-full border border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-300 transition hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40';

/**
 * Padrón de ARCA con el certificado de OPLEX (autocompletar por CUIT en
 * toda la plataforma). A diferencia del resto de las filas, el
 * certificado no vive en el .env sino en PlatformSettings: se sube desde
 * acá. "Probar consulta" va siempre a ARCA (sin caché) y queda registrada
 * como última prueba.
 */
export function ArcaPadronRow({ item }: { item: SystemStatusItem }) {
  const queryClient = useQueryClient();
  const { data: status } = useQuery({ queryKey: ['admin-arca-padron'], queryFn: adminArcaPadronApi.getStatus });
  const [open, setOpen] = useState(false);
  const [testCuit, setTestCuit] = useState('20-20179706-4');
  const [result, setResult] = useState<ArcaPadronTestResult | null>(null);
  const [upload, setUpload] = useState<null | 'replace' | 'production'>(null);

  const test = useMutation({
    mutationFn: () => adminArcaPadronApi.test(testCuit),
    onMutate: () => setResult(null),
    onSuccess: (r) => {
      setResult(r);
      queryClient.invalidateQueries({ queryKey: ['admin-arca-padron'] });
    },
    onError: (err) => setResult({ ok: false, message: apiError(err, 'No se pudo probar la consulta.'), ms: 0, person: null }),
  });

  const configured = status?.configured ?? item.configured;
  const envLabel = status?.env === 'PRODUCCION' ? 'Producción' : 'Homologación';
  const working = configured && status?.lastCheckOk === true;
  const tone = !configured ? 'red' : working ? 'green' : 'amber';

  const subtitle = !configured
    ? 'Falta cargar el certificado de Oplex - sin él, nadie puede autocompletar por CUIT.'
    : status?.lastCheckAt
      ? `Certificado de Oplex cargado · última prueba ${status.lastCheckOk ? 'OK' : 'con error'} (${DATE_TIME.format(new Date(status.lastCheckAt))})${
          status.lastCheckOk ? '' : `: ${status.lastCheckMessage ?? ''}`
        }`
      : 'Certificado de Oplex cargado · todavía sin probar';

  const ticketUntil = status?.ticketExpiresAt ? new Date(status.ticketExpiresAt) : null;
  const ticketValid = ticketUntil && ticketUntil > new Date() ? ticketUntil : null;

  return (
    <div className="flex flex-col gap-2">
      <div
        className={`flex flex-wrap items-center justify-between gap-4 rounded-xl border p-4 ${
          tone === 'red' ? 'border-red-900 bg-red-950/30' : 'border-cyan-900 bg-[#0b1b24]'
        }`}
      >
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={`h-2.5 w-2.5 shrink-0 rounded-full ${tone === 'red' ? 'bg-red-500' : tone === 'amber' ? 'bg-amber-500' : 'bg-green-500'}`}
            aria-hidden
          />
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-200">
              {item.label} <span className="font-normal text-slate-500">(autocompletar por CUIT en toda la plataforma)</span>
            </p>
            <p className={`mt-0.5 text-xs ${tone === 'red' ? 'text-red-300' : 'text-slate-500'}`}>{subtitle}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {configured ? (
            <>
              <button
                type="button"
                className={btn}
                disabled={test.isPending}
                onClick={() => {
                  setOpen(true);
                  test.mutate();
                }}
              >
                {test.isPending ? 'Consultando...' : 'Probar consulta'}
              </button>
              <button type="button" className={btn} onClick={() => setOpen((v) => !v)}>
                {open ? 'Ocultar detalle' : 'Ver detalle'}
              </button>
            </>
          ) : (
            <button
              type="button"
              className={btn}
              onClick={() => {
                setOpen(true);
                setUpload('replace');
              }}
            >
              Cargar certificado
            </button>
          )}
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
              tone === 'red'
                ? 'bg-red-900/50 text-red-300'
                : tone === 'amber'
                  ? 'bg-[#451a03] text-amber-300'
                  : 'bg-green-900/50 text-green-300'
            }`}
          >
            {!configured ? 'Falta configurar' : working ? 'Funcionando' : envLabel}
          </span>
        </div>
      </div>

      {open && (
        <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-800 bg-[#0a0e18] p-3.5 text-sm lg:grid-cols-4">
          {configured && status && (
            <>
              <Detail label="Certificado" mono>{status.certAlias ?? '—'}</Detail>
              <Detail label="Titular" mono>{status.cuit ? `CUIT ${formatCuit(status.cuit)}` : '—'}</Detail>
              <Detail label="Ambiente">{envLabel}</Detail>
              <Detail label="Vence">{status.certExpiresAt ? DATE.format(new Date(status.certExpiresAt)) : '—'}</Detail>
              <Detail label="Servicio autorizado" mono>ws_sr_constancia_inscripcion</Detail>
              <Detail label="Ticket de acceso">
                {ticketValid ? `vigente hasta ${TIME.format(ticketValid)}` : 'se pide en la próxima consulta'}
              </Detail>
              <Detail label="Consultas este mes">
                {status.queriesThisMonth} <span className="font-normal text-slate-500">(caché 30 días por CUIT)</span>
              </Detail>
              <Detail label="Última falla">
                {status.lastCheckOk === false && status.lastCheckAt
                  ? `${DATE_TIME.format(new Date(status.lastCheckAt))} · ${status.lastCheckMessage ?? ''}`
                  : '—'}
              </Detail>

              <div className="col-span-full">
                <small className="text-[11px] uppercase tracking-wider text-slate-500">CUIT de prueba</small>
                <div className="mt-1 flex gap-2">
                  <input
                    value={testCuit}
                    onChange={(e) => setTestCuit(formatCuit(e.target.value))}
                    className="w-full max-w-[200px] rounded-[10px] border border-slate-700 bg-[#0f1320] px-2.5 py-1.5 font-mono text-sm text-slate-200 outline-none focus:border-slate-500"
                  />
                  <button type="button" className={btn} disabled={test.isPending} onClick={() => test.mutate()}>
                    {test.isPending ? 'Consultando...' : 'Consultar'}
                  </button>
                </div>
              </div>
              {(test.isPending || result) && (
                <div className="col-span-full">
                  {test.isPending ? (
                    <div className="rounded-lg bg-[#0f1320] px-3 py-2 text-xs text-slate-400">Consultando ARCA...</div>
                  ) : result?.ok && result.person ? (
                    <div className="rounded-lg border border-green-900 bg-green-950/40 px-3 py-2 text-xs text-green-300">
                      ✓ ARCA respondió en {(result.ms / 1000).toLocaleString('es-AR', { maximumFractionDigits: 1 })} s:{' '}
                      {[result.person.name, result.person.taxConditionLabel, result.person.fiscalAddress].filter(Boolean).join(' · ')}
                      {status.env === 'HOMOLOGACION' && ' (datos ficticios de homologación)'}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-xs text-red-300">✕ {result?.message}</div>
                  )}
                </div>
              )}
              <div className="flex flex-wrap gap-2 col-span-full">
                <button type="button" className={btn} onClick={() => setUpload(upload === 'replace' ? null : 'replace')}>
                  Reemplazar certificado
                </button>
                {status.env === 'HOMOLOGACION' && (
                  <button type="button" className={btn} onClick={() => setUpload(upload === 'production' ? null : 'production')}>
                    Cambiar a Producción
                  </button>
                )}
              </div>
            </>
          )}
          {upload && (
            <CertificateUpload
              production={upload === 'production'}
              onDone={() => {
                setUpload(null);
                setResult(null);
                queryClient.invalidateQueries({ queryKey: ['admin-arca-padron'] });
                queryClient.invalidateQueries({ queryKey: ['admin-system-status'] });
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

function Detail({ label, mono, children }: { label: string; mono?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <small className="block text-[11px] uppercase tracking-wider text-slate-500">{label}</small>
      <b className={`font-medium text-slate-200 ${mono ? 'font-mono' : ''}`}>{children}</b>
    </div>
  );
}

function CertificateUpload({ production, onDone }: { production: boolean; onDone: () => void }) {
  const [certPem, setCertPem] = useState<string | null>(null);
  const [keyPem, setKeyPem] = useState<string | null>(null);
  const [certName, setCertName] = useState('');
  const [keyName, setKeyName] = useState('');
  const mutation = useMutation({
    mutationFn: () => adminArcaPadronApi.uploadCertificate(certPem ?? '', keyPem ?? ''),
    onSuccess: onDone,
  });

  const pick = (setText: (t: string) => void, setName: (n: string) => void) => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setName(file.name);
    setText(await file.text());
  };

  const fileLabel =
    'flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-700 px-3 py-2 text-xs text-slate-300 transition hover:border-slate-500';

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-slate-800 bg-slate-900 p-3 col-span-full">
      <p className="text-xs text-slate-400">
        {production
          ? 'Subí el certificado de PRODUCCIÓN de Oplex y su clave privada. En ARCA (producción) tiene que tener autorizado el servicio ws_sr_constancia_inscripcion. El ambiente se detecta solo por el emisor del certificado.'
          : 'Subí el certificado de Oplex (.crt/.pem) y su clave privada (.key). Tiene que tener autorizado el servicio ws_sr_constancia_inscripcion en WSASS. La clave se guarda cifrada.'}
      </p>
      <div className="flex flex-wrap gap-2">
        <label className={fileLabel}>
          <input type="file" accept=".crt,.pem,.cer" className="hidden" onChange={pick(setCertPem, setCertName)} />
          {certName ? `✓ ${certName}` : 'Elegir certificado (.crt)'}
        </label>
        <label className={fileLabel}>
          <input type="file" accept=".key,.pem,*" className="hidden" onChange={pick(setKeyPem, setKeyName)} />
          {keyName ? `✓ ${keyName}` : 'Elegir clave privada (.key)'}
        </label>
        <button type="button" className={btn} disabled={!certPem || !keyPem || mutation.isPending} onClick={() => mutation.mutate()}>
          {mutation.isPending ? 'Guardando...' : 'Guardar certificado'}
        </button>
      </div>
      {mutation.isError && <p className="text-xs text-red-300">✕ {apiError(mutation.error, 'No se pudo guardar el certificado.')}</p>}
    </div>
  );
}
