'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import Select from '@/components/ui/Select';
import { formatCuitInput } from '@/lib/cuit';
import {
  afipCertificateApi,
  tenantInfoApi,
  tenantSettingsApi,
  type AfipFileInspection,
  type ArcaCheckResult,
  type TenantSettings,
  type TenantTaxCondition,
} from '@/lib/tenantSettings';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { Check, ChevronRight, Copy, Download, Upload } from 'lucide-react';
import { useRef, useState } from 'react';

type StepKey = 1 | 2 | 3 | 4;

const TAX_CONDITION_LABELS: Record<TenantTaxCondition, string> = {
  RESPONSABLE_INSCRIPTO: 'Responsable Inscripto',
  MONOTRIBUTO: 'Monotributo',
  EXENTO: 'Exento',
};

function errorMessage(err: unknown, fallback: string): string {
  const message = (err as AxiosError<{ message?: string | string[] }>)?.response?.data?.message;
  if (Array.isArray(message)) return message.join(', ');
  return message ?? fallback;
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('No se pudo leer el archivo'));
    reader.readAsText(file);
  });
}

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('es-AR') : '';
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // El usuario puede seleccionar y copiar a mano.
  }
}

function downloadText(text: string, filename: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/pkcs10' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Preferencias → "Conexión con ARCA": todo lo necesario para emitir con CAE
 * como un asistente de 4 pasos con un resumen de estado arriba (ver el
 * mockup aprobado el 2026-09-26). Reemplaza la tarjeta "Certificado ARCA"
 * vieja (inputs de archivo nativos casi invisibles, guía escondida en un
 * <details>, OpenSSL a mano, selector que filtraba por extensión).
 */
export default function ArcaConnectionCard({ settings }: { settings: TenantSettings }) {
  const queryClient = useQueryClient();
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['tenant-settings'] });

  const companyDone = Boolean(settings.tenantTaxId && settings.ownTaxCondition);
  const keyDone = settings.afipHasPendingKey || settings.afipConfigured;
  const certDone = settings.afipConfigured;
  const authOk = settings.afipLastCheckOk === true;
  const authFailed = settings.afipLastCheckOk === false;
  const notAuthorized = authFailed && /no lo tiene autorizado|notAuthorized/i.test(settings.afipLastCheckMessage ?? '');

  const firstPending: StepKey = !companyDone ? 1 : !keyDone ? 2 : !certDone ? (settings.afipHasPendingKey ? 3 : 4) : !authOk ? 3 : 4;
  const [open, setOpen] = useState<Set<StepKey>>(() => new Set(certDone && authOk ? [] : [firstPending]));
  const step32Ref = useRef<HTMLDivElement>(null);
  const toggle = (step: StepKey) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(step)) next.delete(step);
      else next.add(step);
      return next;
    });
  const showStep32 = () => {
    setOpen((prev) => new Set(prev).add(3));
    setTimeout(() => step32Ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  };

  const alias = settings.afipPendingAlias ?? settings.afipCertAlias ?? 'oplexhomo';
  const isProd = settings.afipEnv === 'PRODUCCION';

  return (
    <div className="flex flex-col gap-4">
      {/* Estado */}
      <Card className="gap-4 px-5 py-5">
        <div className="flex flex-wrap items-start justify-between gap-3 sm:flex-nowrap">
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-semibold">Conexión con ARCA</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Lo necesario para emitir facturas electrónicas con CAE. Seguí los pasos en orden; cada uno queda tildado cuando
              está listo.
            </p>
          </div>
          <span
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
              isProd
                ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400'
                : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400'
            }`}
          >
            ● {isProd ? 'Producción (facturas reales)' : 'Homologación (pruebas)'}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          <StatusCheck
            state={companyDone ? 'ok' : 'pending'}
            title="Datos de la empresa"
            detail={
              companyDone
                ? `CUIT ${settings.tenantTaxId} · ${TAX_CONDITION_LABELS[settings.ownTaxCondition as TenantTaxCondition]}`
                : 'Falta CUIT o condición IVA'
            }
          />
          <StatusCheck
            state={keyDone ? 'ok' : 'pending'}
            title="Clave y pedido (CSR)"
            detail={settings.afipHasPendingKey ? 'Generados' : settings.afipConfigured ? 'Clave cargada' : 'Sin generar'}
          />
          <StatusCheck
            state={certDone ? 'ok' : 'pending'}
            title="Certificado cargado"
            detail={
              certDone
                ? `${settings.afipCertAlias ?? 'Certificado'} · vence ${formatDate(settings.afipCertExpiresAt)}`
                : 'Todavía no'
            }
          />
          <StatusCheck
            state={authOk ? 'ok' : authFailed ? 'bad' : 'pending'}
            title="Autorización a facturar"
            detail={
              authOk
                ? `Verificada el ${formatDate(settings.afipLastCheckAt)}`
                : notAuthorized
                  ? 'Falta autorizar "wsfe"'
                  : authFailed
                    ? 'ARCA rechazó la conexión'
                    : 'Sin probar'
            }
          />
        </div>

        {authFailed && settings.afipLastCheckMessage && (
          <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-red-300 bg-red-50 px-3.5 py-3 text-sm dark:border-red-900 dark:bg-red-950/40">
            <p>
              <span className="font-semibold text-red-700 dark:text-red-400">ARCA rechazó la conexión.</span>{' '}
              {notAuthorized ? (
                <>
                  Falta el paso 3.2: autorizar el certificado <span className="font-mono">{alias}</span> para el servicio de
                  facturación (<span className="font-mono">wsfe</span>).
                </>
              ) : (
                settings.afipLastCheckMessage
              )}
            </p>
            {notAuthorized && (
              <Button type="button" variant="outline" size="sm" onClick={showStep32}>
                Ver cómo hacerlo
              </Button>
            )}
          </div>
        )}
      </Card>

      {/* Pasos */}
      <Card className="gap-0 py-0">
        <Step
          number={1}
          done={companyDone}
          open={open.has(1)}
          onToggle={() => toggle(1)}
          title="Datos de la empresa"
          subtitle="CUIT y condición frente al IVA"
        >
          <CompanyStep settings={settings} onSaved={invalidate} />
        </Step>

        <Step
          number={2}
          done={keyDone}
          open={open.has(2)}
          onToggle={() => toggle(2)}
          title="Clave privada y pedido de certificado"
          subtitle="se generan acá, sin programas"
        >
          <KeyStep settings={settings} onSaved={invalidate} />
        </Step>

        <Step
          number={3}
          done={certDone && authOk}
          open={open.has(3)}
          onToggle={() => toggle(3)}
          title="Obtener el certificado en ARCA"
          subtitle="con tu clave fiscal, en WSASS"
        >
          <ArcaStep settings={settings} alias={alias} step32Ref={step32Ref} highlight32={notAuthorized} />
        </Step>

        <Step
          number={4}
          done={certDone}
          open={open.has(4)}
          onToggle={() => toggle(4)}
          title="Subir el certificado"
          subtitle="y probar la conexión"
          last
        >
          <UploadStep settings={settings} onSaved={invalidate} onShowStep32={showStep32} />
        </Step>
      </Card>
    </div>
  );
}

function StatusCheck({ state, title, detail }: { state: 'ok' | 'bad' | 'pending'; title: string; detail: string }) {
  return (
    <div
      className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 ${
        state === 'bad' ? 'border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/40' : 'bg-muted/40'
      }`}
    >
      <span
        className={`mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-xs font-bold ${
          state === 'ok'
            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400'
            : state === 'bad'
              ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400'
              : 'bg-muted text-muted-foreground'
        }`}
      >
        {state === 'ok' ? '✓' : state === 'bad' ? '!' : '·'}
      </span>
      <div className="min-w-0">
        <p className="text-[13px] font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}

function Step({
  number,
  done,
  open,
  onToggle,
  title,
  subtitle,
  last,
  children,
}: {
  number: StepKey;
  done: boolean;
  open: boolean;
  onToggle: () => void;
  title: string;
  subtitle: string;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={`grid grid-cols-[44px_minmax(0,1fr)] gap-x-3.5 px-5 py-4.5 ${last ? '' : 'border-b'}`}>
      <span
        className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
          done ? 'bg-emerald-600 text-white dark:bg-emerald-500' : 'bg-primary text-primary-foreground'
        }`}
      >
        {done ? '✓' : number}
      </span>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex min-h-8 items-center justify-between gap-2.5 text-left"
      >
        <span className="text-base font-semibold">
          {title} <span className="ml-1.5 text-[13px] font-medium text-muted-foreground">{subtitle}</span>
        </span>
        <ChevronRight className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && <div className="col-start-2 mt-3 flex flex-col gap-3.5">{children}</div>}
    </section>
  );
}

function CompanyStep({ settings, onSaved }: { settings: TenantSettings; onSaved: () => void }) {
  const [taxId, setTaxId] = useState(settings.tenantTaxId ?? '');
  const [condition, setCondition] = useState<TenantTaxCondition | ''>(settings.ownTaxCondition ?? '');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const mutation = useMutation({
    mutationFn: async () => {
      if (taxId.trim() && taxId !== settings.tenantTaxId) await tenantInfoApi.update(taxId);
      if (condition && condition !== settings.ownTaxCondition) {
        await tenantSettingsApi.update({ ownTaxCondition: condition });
      }
    },
    onSuccess: () => {
      setError('');
      setSaved(true);
      onSaved();
    },
    onError: (err) => setError(errorMessage(err, 'No se pudo guardar')),
  });

  return (
    <>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[12.5px] text-muted-foreground">
          CUIT de la empresa
          <Input
            className="w-48 font-mono"
            value={taxId}
            onChange={(e) => {
              setTaxId(formatCuitInput(e.target.value));
              setSaved(false);
            }}
            placeholder="20-12345678-9"
          />
        </label>
        <label className="flex flex-col gap-1 text-[12.5px] text-muted-foreground">
          Condición frente al IVA
          <Select
            className="w-56"
            value={condition}
            onChange={(v) => {
              setCondition(v as TenantTaxCondition);
              setSaved(false);
            }}
            placeholder="Elegir..."
            options={(Object.keys(TAX_CONDITION_LABELS) as TenantTaxCondition[]).map((value) => ({
              value,
              label: TAX_CONDITION_LABELS[value],
            }))}
          />
        </label>
        <Button type="button" variant="outline" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          {mutation.isPending ? 'Guardando...' : 'Guardar'}
        </Button>
        {saved && <span className="text-[12.5px] font-semibold text-emerald-600 dark:text-emerald-400">✓ Guardado</span>}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <p className="text-xs text-muted-foreground">
        Monotributo emite siempre Factura C. Responsable Inscripto emite A o B según el cliente.
      </p>
    </>
  );
}

function KeyStep({ settings, onSaved }: { settings: TenantSettings; onSaved: () => void }) {
  const [mode, setMode] = useState<'oplex' | 'own'>('oplex');
  const [alias, setAlias] = useState(settings.afipPendingAlias ?? (settings.afipEnv === 'PRODUCCION' ? 'oplex' : 'oplexhomo'));
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const mutation = useMutation({
    mutationFn: () => afipCertificateApi.generateCsr(alias.trim() || undefined),
    onSuccess: () => {
      setError('');
      onSaved();
    },
    onError: (err) => setError(errorMessage(err, 'No se pudo generar el pedido')),
  });
  const csr = settings.afipPendingCsr;
  const csrAlias = settings.afipPendingAlias ?? alias;

  return (
    <>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <ChoiceCard
          active={mode === 'oplex'}
          onClick={() => setMode('oplex')}
          title="Generarlos con Oplex"
          tag="recomendado"
          text="Un clic. La clave privada queda guardada cifrada en Oplex y nunca sale de acá. Descargás sólo el pedido (CSR) para llevar a ARCA."
        />
        <ChoiceCard
          active={mode === 'own'}
          onClick={() => setMode('own')}
          title="Ya tengo mis archivos"
          text="Los generaste vos (por ejemplo con OpenSSL). Subís el certificado y la clave en el paso 4."
        />
      </div>

      {mode === 'oplex' && (
        <>
          <div className="flex flex-wrap items-end gap-2.5">
            <label className="flex flex-col gap-1 text-[12.5px] text-muted-foreground">
              Nombre del certificado (el que vas a usar en WSASS)
              <Input
                className="w-56 font-mono"
                value={alias}
                onChange={(e) => setAlias(e.target.value.replace(/[^a-zA-Z0-9]/g, ''))}
              />
            </label>
            <Button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
              {mutation.isPending ? 'Generando...' : csr ? 'Generar de nuevo' : 'Generar clave y pedido'}
            </Button>
            {csr && (
              <>
                <Button type="button" variant="outline" onClick={() => downloadText(csr, `${csrAlias}.csr`)}>
                  <Download className="mr-1.5 h-4 w-4" />
                  Descargar pedido ({csrAlias}.csr)
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={async () => {
                    await copyText(csr);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                >
                  <Copy className="mr-1.5 h-4 w-4" />
                  {copied ? 'Copiado' : 'Copiar pedido'}
                </Button>
              </>
            )}
          </div>
          {csr && settings.afipConfigured && (
            <p className="text-xs text-muted-foreground">
              El certificado que ya está cargado sigue funcionando: la clave nueva se usa recién cuando subas el certificado
              que ARCA emita para este pedido.
            </p>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </>
      )}
    </>
  );
}

function ChoiceCard({
  active,
  onClick,
  title,
  tag,
  text,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  tag?: string;
  text: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`flex flex-col gap-1 rounded-xl border-[1.5px] px-3.5 py-3 text-left transition ${
        active ? 'border-primary bg-primary/10' : 'bg-card hover:border-primary/40'
      }`}
    >
      <span className="text-[13.5px] font-semibold">
        {title}
        {tag && (
          <span className="ml-1.5 rounded-full bg-emerald-100 px-1.5 py-px text-[11px] font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
            {tag}
          </span>
        )}
      </span>
      <span className="text-[12.5px] text-muted-foreground">{text}</span>
    </button>
  );
}

function CopyChip({ text, label = 'Copiar' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await copyText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="ml-1 rounded-md border bg-card px-2 py-0.5 text-xs font-medium hover:bg-muted"
    >
      {copied ? 'Copiado' : label}
    </button>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">{children}</code>;
}

function ArcaStep({
  settings,
  alias,
  step32Ref,
  highlight32,
}: {
  settings: TenantSettings;
  alias: string;
  step32Ref: React.RefObject<HTMLDivElement | null>;
  highlight32: boolean;
}) {
  const cuit = (settings.tenantTaxId ?? '').replace(/\D/g, '');
  const csr = settings.afipPendingCsr;
  const csrPreview = csr
    ? `${csr.split('\n').slice(0, 2).join('\n').slice(0, 70)}…\n-----END CERTIFICATE REQUEST-----`
    : '-----BEGIN CERTIFICATE REQUEST-----\nMIICnjCCAYYCAQAwWTELMAkGA1UEBhMCQVIx…\n-----END CERTIFICATE REQUEST-----';

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div>
          <h3 className="mb-1 text-sm font-semibold">3.1 · Crear el certificado</h3>
          <ol className="ml-4 flex list-decimal flex-col gap-1 text-[13px] text-muted-foreground">
            <li>
              Entrá a ARCA con tu clave fiscal y abrí{' '}
              <b className="text-foreground">WSASS - Autogestión Certificados Homologación</b>. Si no aparece, adheríte en
              &quot;Administrador de Relaciones de Clave Fiscal&quot;.
            </li>
            <li>
              Tocá <b className="text-foreground">&quot;Nuevo certificado&quot;</b>.
            </li>
            <li>
              En <b className="text-foreground">Nombre simbólico</b> poné <Code>{alias}</Code>
              <CopyChip text={alias} />
            </li>
            <li>
              En <b className="text-foreground">Solicitud de certificado</b> pegá el pedido del paso 2
              {csr && <CopyChip text={csr} label="Copiar pedido" />}
            </li>
            <li>
              Tocá <b className="text-foreground">&quot;Crear DN y obtener certificado&quot;</b> y guardá lo que te muestra
              como <Code>{alias}.crt</Code>.
            </li>
          </ol>
        </div>
        <ExampleShot title="WSASS · Nuevo certificado" heading="Agregar alias / certificado">
          <ShotField label="Nombre simbólico del DN" pin={1}>
            {alias}
          </ShotField>
          <ShotField label="CUIT del contribuyente">{cuit || '20XXXXXXXXX'}</ShotField>
          <ShotField label="Solicitud de certificado en formato PKCS#10" pin={2} big>
            {csrPreview}
          </ShotField>
          <ShotButton pin={3}>Crear DN y obtener certificado</ShotButton>
        </ExampleShot>
      </div>

      <div ref={step32Ref} className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div>
          <h3 className="mb-1 text-sm font-semibold">
            3.2 · Autorizarlo a facturar
            {highlight32 && (
              <span className="ml-1.5 rounded-full bg-red-100 px-1.5 py-px text-[11px] font-bold text-red-700 dark:bg-red-950 dark:text-red-400">
                te falta este
              </span>
            )}
          </h3>
          <ol className="ml-4 flex list-decimal flex-col gap-1 text-[13px] text-muted-foreground">
            <li>
              En WSASS tocá <b className="text-foreground">&quot;Crear autorización de acceso&quot;</b>.
            </li>
            <li>
              En <b className="text-foreground">Nombre simbólico del DN</b> elegí <Code>{alias}</Code>.
            </li>
            <li>
              En <b className="text-foreground">Servicio</b> elegí <b className="text-foreground">wsfe - Facturación Electrónica</b>.
              Ojo: la lista trae muchos servicios parecidos.
            </li>
            <li>
              En <b className="text-foreground">CUIT representada</b> dejá la tuya: <Code>{cuit || 'tu CUIT'}</Code>.
            </li>
            <li>
              Tocá <b className="text-foreground">&quot;Crear autorización&quot;</b>. El mensaje de ARCA tiene que decir{' '}
              <Code>SERVICIO=ws://wsfe</Code>. Después volvé acá y tocá <b className="text-foreground">&quot;Probar conexión&quot;</b>.
            </li>
          </ol>
        </div>
        <ExampleShot title="WSASS · Crear autorización de acceso" heading="Autorización de acceso a web service">
          <ShotField label="Nombre simbólico del DN a autorizar" pin={1}>
            {alias} ▾
          </ShotField>
          <ShotField label="CUIT representada">{cuit || '20XXXXXXXXX'}</ShotField>
          <ShotField label="Servicio al que desea acceder" pin={2}>
            wsfe - Facturación Electrónica ▾
          </ShotField>
          <ShotButton pin={3}>Crear autorización</ShotButton>
        </ExampleShot>
      </div>
    </div>
  );
}

function ExampleShot({ title, heading, children }: { title: string; heading: string; children: React.ReactNode }) {
  return (
    <figure className="m-0 overflow-hidden rounded-lg border bg-muted/30 text-[11.5px]">
      <div className="flex items-center gap-1.5 bg-muted px-2.5 py-1.5 text-[11px] text-muted-foreground">
        <span className="h-2 w-2 rounded-full bg-border" />
        <span className="h-2 w-2 rounded-full bg-border" />
        <span className="h-2 w-2 rounded-full bg-border" />
        <span className="ml-1">{title}</span>
      </div>
      <div className="flex flex-col gap-2 p-3">
        <p className="text-[12.5px] font-bold">{heading}</p>
        {children}
      </div>
      <figcaption className="border-t px-2.5 py-1.5 text-[11px] text-muted-foreground">
        Pantalla de ejemplo simplificada. Puede verse distinta en ARCA.
      </figcaption>
    </figure>
  );
}

function Pin({ n }: { n: number }) {
  return (
    <span className="absolute -top-2.5 -right-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-[11px] font-extrabold text-amber-950">
      {n}
    </span>
  );
}

function ShotField({ label, pin, big, children }: { label: string; pin?: number; big?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <small className="text-muted-foreground">{label}</small>
      <div
        className={`relative rounded-md border bg-card px-2 py-1 text-muted-foreground ${
          big ? 'min-h-[52px] font-mono text-[10.5px] leading-snug whitespace-pre-wrap break-all' : ''
        } ${pin ? 'outline-[2.5px] outline-offset-2 outline-amber-400 outline-solid' : ''}`}
      >
        {pin && <Pin n={pin} />}
        {children}
      </div>
    </div>
  );
}

function ShotButton({ pin, children }: { pin: number; children: React.ReactNode }) {
  return (
    <span className="relative self-start rounded-md border bg-muted px-2.5 py-1 font-semibold outline-[2.5px] outline-offset-2 outline-amber-400 outline-solid">
      <Pin n={pin} />
      {children}
    </span>
  );
}

function UploadStep({
  settings,
  onSaved,
  onShowStep32,
}: {
  settings: TenantSettings;
  onSaved: () => void;
  onShowStep32: () => void;
}) {
  const [certPem, setCertPem] = useState('');
  const [certName, setCertName] = useState('');
  const [inspection, setInspection] = useState<AfipFileInspection | null>(null);
  const [keyPem, setKeyPem] = useState('');
  const [keyName, setKeyName] = useState('');
  const [fileError, setFileError] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [checkResult, setCheckResult] = useState<ArcaCheckResult | null>(null);

  const usePendingKey = settings.afipHasPendingKey;

  async function handleCert(file: File) {
    setSaved(false);
    setError('');
    const text = await readFileAsText(file);
    try {
      const result = await afipCertificateApi.inspect(text);
      if (result.kind === 'CSR') {
        setFileError(
          'Ese archivo es el pedido (CSR), no el certificado. El certificado es lo que te devuelve ARCA en el paso 3.1.',
        );
        setCertPem('');
        setInspection(null);
        return;
      }
      if (result.kind === 'PRIVATE_KEY') {
        setFileError('Ese archivo es la clave privada. Acá va el certificado que te dio ARCA.');
        setCertPem('');
        setInspection(null);
        return;
      }
      if (result.kind !== 'CERTIFICATE') {
        setFileError('No reconocemos ese archivo como un certificado de ARCA.');
        setCertPem('');
        setInspection(null);
        return;
      }
      setFileError('');
      setCertPem(text);
      setCertName(file.name);
      setInspection(result);
    } catch (err) {
      setFileError(errorMessage(err, 'No se pudo leer el archivo'));
    }
  }

  async function handleKey(file: File) {
    setSaved(false);
    const text = await readFileAsText(file);
    if (!/-----BEGIN (RSA |ENCRYPTED )?PRIVATE KEY-----/.test(text)) {
      setFileError('Ese archivo no es una clave privada (tiene que empezar con "-----BEGIN PRIVATE KEY-----").');
      return;
    }
    setFileError('');
    setKeyPem(text);
    setKeyName(file.name);
  }

  const upload = useMutation({
    mutationFn: () => afipCertificateApi.upload({ certPem, keyPem: usePendingKey && !keyPem ? undefined : keyPem }),
    onSuccess: () => {
      setError('');
      setSaved(true);
      setCertPem('');
      setInspection(null);
      setKeyPem('');
      onSaved();
    },
    onError: (err) => setError(errorMessage(err, 'No se pudo guardar el certificado')),
  });

  const check = useMutation({
    mutationFn: afipCertificateApi.check,
    onSuccess: (result) => {
      setCheckResult(result);
      onSaved();
    },
    onError: (err) =>
      setCheckResult({
        ok: false,
        problem: 'OTHER',
        message: errorMessage(err, 'No se pudo probar la conexión'),
        pointOfSale: null,
        documentLetter: null,
        lastNumber: null,
        checkedAt: new Date().toISOString(),
      }),
  });

  const remove = useMutation({
    mutationFn: afipCertificateApi.remove,
    onSuccess: onSaved,
  });

  const cert = inspection?.certificate;
  const canSave = Boolean(certPem) && (usePendingKey || Boolean(keyPem));

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <DropZone
          title="Certificado de ARCA"
          ok={Boolean(certPem)}
          okDetail={certName}
          okHint={
            certName && !/\.(crt|pem|cer)$/i.test(certName) ? `Reconocido como certificado aunque tenga otra extensión` : undefined
          }
          onFile={handleCert}
        />
        {usePendingKey ? (
          <div className="flex flex-col items-center gap-1.5 rounded-2xl border-2 border-emerald-500/50 bg-emerald-50 p-4.5 text-center dark:bg-emerald-950/30">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white">
              <Check className="h-5 w-5" />
            </span>
            <b className="text-sm">Clave privada</b>
            <span className="text-[12.5px] text-muted-foreground">Guardada en Oplex (generada en el paso 2)</span>
          </div>
        ) : (
          <DropZone title="Clave privada (.key)" ok={Boolean(keyPem)} okDetail={keyName} onFile={handleKey} />
        )}
      </div>

      {fileError && <p className="text-sm text-destructive">{fileError}</p>}

      {cert && (
        <div className="grid grid-cols-2 gap-2.5 rounded-xl border px-3.5 py-3 text-[12.5px] lg:grid-cols-4">
          <CertInfo label="Titular">
            <span className="font-mono">CUIT {cert.cuit}</span>{' '}
            {cert.cuitMatches === false ? (
              <span className="text-destructive">✕ no coincide</span>
            ) : (
              <span className="text-emerald-600 dark:text-emerald-400">✓ coincide</span>
            )}
          </CertInfo>
          <CertInfo label="Ambiente">
            {cert.env === 'PRODUCCION' ? 'Producción' : 'Homologación'}{' '}
            <span className={cert.env === 'PRODUCCION' ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}>
              {cert.env === 'PRODUCCION' ? '⚠ facturas reales' : '✓ pruebas'}
            </span>
          </CertInfo>
          <CertInfo label="Nombre">
            <span className="font-mono">{cert.alias}</span>
          </CertInfo>
          <CertInfo label="Vence">{formatDate(cert.expiresAt)}</CertInfo>
          {usePendingKey && cert.matchesPendingKey === false && (
            <p className="col-span-full text-destructive">
              Este certificado no corresponde al pedido que generó Oplex. Usá el pedido del paso 2 en WSASS, o elegí
              &quot;Ya tengo mis archivos&quot; y subí también tu clave.
            </p>
          )}
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
      {saved && <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">✓ Certificado guardado. Ahora probá la conexión.</p>}

      <div className="flex flex-wrap items-center gap-2.5">
        <Button type="button" onClick={() => upload.mutate()} disabled={!canSave || upload.isPending}>
          <Upload className="mr-1.5 h-4 w-4" />
          {upload.isPending ? 'Guardando...' : 'Guardar certificado'}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => check.mutate()}
          disabled={!settings.afipConfigured || check.isPending}
        >
          {check.isPending ? 'Probando con ARCA...' : 'Probar conexión con ARCA'}
        </Button>
        {settings.afipConfigured && (
          <button
            type="button"
            onClick={() => remove.mutate()}
            disabled={remove.isPending}
            className="ml-auto text-xs text-muted-foreground hover:text-destructive"
          >
            {remove.isPending ? 'Quitando...' : 'Quitar certificado cargado'}
          </button>
        )}
      </div>

      {checkResult && (
        <div
          className={`rounded-xl px-3.5 py-3 text-[13px] ${
            checkResult.ok
              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
              : 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400'
          }`}
        >
          <b>{checkResult.ok ? '✓ Conexión correcta.' : checkResult.problem === 'NOT_AUTHORIZED' ? '✕ Sin autorización para facturar.' : '✕ No se pudo conectar.'}</b>{' '}
          {checkResult.ok
            ? `${checkResult.message.replace(/^Conexión correcta\.\s*/, '')} Ya podés facturar.`
            : checkResult.problem === 'NOT_AUTHORIZED'
              ? 'ARCA reconoce el certificado pero no lo tiene autorizado para "wsfe". Hacé el paso 3.2 y volvé a probar.'
              : checkResult.message}
          {checkResult.problem === 'NOT_AUTHORIZED' && (
            <button type="button" onClick={onShowStep32} className="ml-1.5 font-semibold underline">
              Ver paso 3.2
            </button>
          )}
        </div>
      )}
    </>
  );
}

function CertInfo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <small className="block text-[11px] tracking-wide text-muted-foreground uppercase">{label}</small>
      <b className="text-[13px] font-semibold">{children}</b>
    </div>
  );
}

function DropZone({
  title,
  ok,
  okDetail,
  okHint,
  onFile,
}: {
  title: string;
  ok: boolean;
  okDetail?: string;
  okHint?: string;
  onFile: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) onFile(file);
      }}
      className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-2xl border-2 p-4.5 text-center transition ${
        ok
          ? 'border-emerald-500/50 bg-emerald-50 dark:bg-emerald-950/30'
          : dragging
            ? 'border-dashed border-primary bg-primary/10'
            : 'border-dashed bg-muted/40 hover:border-primary hover:bg-primary/10'
      }`}
    >
      {/* Sin "accept": ARCA no fija la extensión y un certificado guardado
          como .csr/.txt no aparecía en el selector. Se reconoce por contenido. */}
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = '';
        }}
      />
      <span
        className={`flex h-10 w-10 items-center justify-center rounded-xl ${
          ok ? 'bg-emerald-600 text-white' : 'bg-primary/10 text-primary'
        }`}
      >
        {ok ? <Check className="h-5 w-5" /> : <Upload className="h-5 w-5" />}
      </span>
      <b className="text-sm">{title}</b>
      {ok ? (
        <>
          <span className="font-mono text-[12.5px]">{okDetail}</span>
          {okHint && <span className="text-xs text-muted-foreground">{okHint}</span>}
          <span className="text-xs text-muted-foreground">Clic para elegir otro</span>
        </>
      ) : (
        <>
          <span className="text-[12.5px] text-muted-foreground">Arrastralo acá o hacé clic para elegirlo</span>
          <span className="text-xs text-muted-foreground">
            Sirve cualquier nombre o extensión (.crt, .pem, .txt…): Oplex lo reconoce por su contenido
          </span>
          <span className="mt-1 rounded-lg bg-primary/10 px-3.5 py-1.5 text-[13px] font-semibold text-primary">
            Elegir archivo
          </span>
        </>
      )}
    </div>
  );
}
