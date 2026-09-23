'use client';

import { activityLogApi, type TenantActivityEntry } from '@/lib/activityLog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import Select from '@/components/ui/Select';
import { formatCuitInput } from '@/lib/cuit';
import { INVOICE_PDF_FORMATS, invoicingPreferencesApi, type InvoicePdfFormat } from '@/lib/invoicing';
import { inventoryApi, type AutoReplenishmentResult } from '@/lib/inventory';
import {
  afipCertificateApi,
  emailDomainApi,
  tenantInfoApi,
  tenantSettingsApi,
  type AfipEnvironment,
  type DomainRecord,
  type EmailSenderMode,
  type ReminderTone,
  type TenantSettings,
  type TenantTaxCondition,
} from '@/lib/tenantSettings';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';
import CurrencySettings from './CurrencySettings';
import MercadoPagoCard from './MercadoPagoCard';

function pillClass(active: boolean): string {
  return `rounded-lg px-3 py-1.5 text-xs font-medium transition ${
    active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
  }`;
}

function statusPillClass(status: string | null): string {
  if (status === 'verified') {
    return 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400';
  }
  if (status === 'failed' || status === 'partially_failed') {
    return 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400';
  }
  return 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400';
}

function statusLabel(status: string | null): string {
  switch (status) {
    case 'verified':
      return 'Verificado';
    case 'pending':
      return 'Pendiente';
    case 'failed':
      return 'Falló';
    case 'partially_verified':
      return 'Parcialmente verificado';
    case 'partially_failed':
      return 'Parcialmente fallido';
    case 'not_started':
      return 'Sin iniciar';
    default:
      return 'Sin registrar';
  }
}

function errorMessage(err: AxiosError<{ message?: string | string[] }>, fallback: string): string {
  const message = err.response?.data?.message ?? fallback;
  return Array.isArray(message) ? message.join(', ') : message;
}

const TONE_PREVIEWS: Record<ReminderTone, { label: string; preview: string }> = {
  FRIENDLY: {
    label: 'Amigable',
    preview:
      '"¡Hola! Te escribimos para recordarte que la factura venció y todavía figura un saldo pendiente..."',
  },
  NEUTRAL: {
    label: 'Neutral',
    preview: '"Tu factura está vencida desde el {fecha}. Saldo pendiente: ${monto}..."',
  },
  FIRM: {
    label: 'Firme',
    preview: '"Te pedimos que regularices el pago a la brevedad para evitar inconvenientes..."',
  },
};

export default function PreferencesPage() {
  const { data: settings, isLoading } = useQuery({
    queryKey: ['tenant-settings'],
    queryFn: tenantSettingsApi.get,
  });

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <h1 className="text-xl font-semibold">Preferencias</h1>
      {isLoading || !settings ? (
        <p className="text-sm text-muted-foreground">Cargando...</p>
      ) : (
        <>
          <EmailSettingsCard settings={settings} />
          <CurrencySettings />
          <AfipCertificateCard settings={settings} />
          <MercadoPagoCard />
          <InvoicePdfCard settings={settings} />
          <WithholdingAgentCard settings={settings} />
          <InventoryPricingCard settings={settings} />
          <ReplenishmentCard />
        </>
      )}
      <ActivityLogCard />
    </div>
  );
}

function formatChanges(changes: TenantActivityEntry['changes']): string {
  if (!changes || Object.keys(changes).length === 0) return '—';
  return Object.entries(changes)
    .map(([field, { from, to }]) => `${field}: ${from ?? '—'} → ${to ?? '—'}`)
    .join(', ');
}

function ActivityLogCard() {
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const { data, isLoading } = useQuery({
    queryKey: ['activity-log', page],
    queryFn: () => activityLogApi.getTenant({ page, pageSize }),
  });

  return (
    <Card>
      <CardContent>
        <h2 className="mb-4 text-sm font-medium text-muted-foreground">Actividad del tenant</h2>
        {isLoading || !data ? (
          <p className="text-sm text-muted-foreground">Cargando...</p>
        ) : data.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay actividad registrada.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="pb-2 pr-4">Fecha/hora</th>
                    <th className="pb-2 pr-4">Usuario</th>
                    <th className="pb-2 pr-4">Entidad</th>
                    <th className="pb-2 pr-4">Cambios</th>
                    <th className="pb-2">IP</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((entry) => (
                    <tr key={entry.id} className="border-t">
                      <td className="py-2 pr-4 whitespace-nowrap">
                        {new Date(entry.occurredAt).toLocaleString('es-AR')}
                      </td>
                      <td className="py-2 pr-4">{entry.userName ?? entry.userEmail ?? '—'}</td>
                      <td className="py-2 pr-4">
                        {entry.entityTypeLabel ?? '—'}
                        {entry.entityLabel ? ` ${entry.entityLabel}` : ''}
                      </td>
                      <td className="py-2 pr-4 font-mono break-all">{formatChanges(entry.changes)}</td>
                      <td className="py-2">{entry.ip ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                Anterior
              </Button>
              <span className="text-xs text-muted-foreground">Página {page}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={data.items.length < pageSize}
              >
                Siguiente
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** Lee un input[type=file] como texto plano (FileReader, no upload a
 * disco) - el certificado/clave viajan como PEM en el body del POST y se
 * cifran recién en el backend (ver TenantSettingsService.
 * uploadAfipCertificate). Nunca tocan almacenamiento propio. */
function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('No se pudo leer el archivo'));
    reader.readAsText(file);
  });
}

function daysUntil(iso: string): number {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

/** Certificado/clave AFIP del tenant - reemplaza lo que antes eran
 * variables de entorno del proceso (un solo CUIT para toda la instancia,
 * ver companies.module.ts). Se pegan/suben como archivos .crt/.key, viajan
 * como texto y el backend los cifra (AES-256-GCM) antes de guardarlos; acá
 * nunca se ve ni se guarda el contenido descifrado más que en memoria
 * mientras se arma el POST. */
function AfipCertificateCard({ settings }: { settings: TenantSettings }) {
  const queryClient = useQueryClient();
  const [env, setEnv] = useState<AfipEnvironment>(settings.afipEnv);
  const [certPem, setCertPem] = useState('');
  const [keyPem, setKeyPem] = useState('');
  const [certFileName, setCertFileName] = useState('');
  const [keyFileName, setKeyFileName] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [taxId, setTaxId] = useState(settings.tenantTaxId ?? '');
  const [taxIdMessage, setTaxIdMessage] = useState('');
  const [taxIdError, setTaxIdError] = useState('');
  const [ownTaxCondition, setOwnTaxCondition] = useState<TenantTaxCondition | ''>(
    settings.ownTaxCondition ?? '',
  );
  const [ownTaxConditionMessage, setOwnTaxConditionMessage] = useState('');

  function invalidateSettings() {
    void queryClient.invalidateQueries({ queryKey: ['tenant-settings'] });
  }

  const taxIdMutation = useMutation({
    mutationFn: () => tenantInfoApi.update(taxId),
    onSuccess: () => {
      setTaxIdError('');
      setTaxIdMessage('Guardado');
      invalidateSettings();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      setTaxIdMessage('');
      setTaxIdError(errorMessage(err, 'No se pudo guardar el CUIT'));
    },
  });

  const ownTaxConditionMutation = useMutation({
    mutationFn: (value: TenantTaxCondition) => tenantSettingsApi.update({ ownTaxCondition: value }),
    onSuccess: () => {
      setOwnTaxConditionMessage('Guardado');
      invalidateSettings();
    },
  });

  const uploadMutation = useMutation({
    mutationFn: () => afipCertificateApi.upload({ certPem, keyPem, env }),
    onSuccess: () => {
      setError('');
      setMessage('Certificado guardado');
      setCertPem('');
      setKeyPem('');
      setCertFileName('');
      setKeyFileName('');
      invalidateSettings();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      setMessage('');
      setError(errorMessage(err, 'No se pudo guardar el certificado'));
    },
  });

  const removeMutation = useMutation({
    mutationFn: () => afipCertificateApi.remove(),
    onSuccess: () => {
      setError('');
      setMessage('Certificado eliminado');
      invalidateSettings();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      setError(errorMessage(err, 'No se pudo eliminar el certificado'));
    },
  });

  async function handleCertFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCertPem(await readFileAsText(file));
    setCertFileName(file.name);
  }

  async function handleKeyFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setKeyPem(await readFileAsText(file));
    setKeyFileName(file.name);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    uploadMutation.mutate();
  }

  const expiresInDays = settings.afipCertExpiresAt ? daysUntil(settings.afipCertExpiresAt) : null;

  return (
    <Card>
      <CardContent>
        <h2 className="mb-1 text-sm font-medium text-muted-foreground">
          Certificado AFIP (facturación electrónica)
        </h2>
        <p className="mb-4 text-xs text-muted-foreground">
          Certificado digital (.crt) y clave privada (.key) propios de esta empresa, autorizados para
          WSFE en el Administrador de Relaciones de Clave Fiscal de AFIP. El Punto de Venta se define
          por sucursal (ver &quot;Sucursales&quot; en el menú principal).
        </p>

        <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border p-4">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            CUIT de la empresa
            <Input
              type="text"
              value={taxId}
              onChange={(e) => setTaxId(formatCuitInput(e.target.value))}
              placeholder="30-71659554-9"
              className="w-40"
            />
          </label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setTaxIdMessage('');
              taxIdMutation.mutate();
            }}
            disabled={!taxId.trim() || taxIdMutation.isPending}
          >
            {taxIdMutation.isPending ? 'Guardando...' : 'Guardar CUIT'}
          </Button>
          {taxIdError && <p className="text-xs text-destructive">{taxIdError}</p>}
          {taxIdMessage && <p className="text-xs text-green-600 dark:text-green-400">{taxIdMessage}</p>}
          {!settings.tenantTaxId && (
            <p className="w-full text-xs text-amber-600 dark:text-amber-400">
              El certificado AFIP se registra a nombre de este CUIT - sin él, el certificado no queda
              realmente configurado aunque lo hayas subido.
            </p>
          )}
        </div>

        <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border p-4">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Condición IVA propia
            <Select
              value={ownTaxCondition}
              onChange={(value) => setOwnTaxCondition(value as TenantTaxCondition)}
              placeholder="Sin configurar"
              className="w-56"
              options={[
                { value: 'RESPONSABLE_INSCRIPTO', label: 'Responsable Inscripto' },
                { value: 'MONOTRIBUTO', label: 'Monotributo' },
                { value: 'EXENTO', label: 'Exento' },
              ]}
            />
          </label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setOwnTaxConditionMessage('');
              if (ownTaxCondition) ownTaxConditionMutation.mutate(ownTaxCondition);
            }}
            disabled={!ownTaxCondition || ownTaxConditionMutation.isPending}
          >
            {ownTaxConditionMutation.isPending ? 'Guardando...' : 'Guardar condición IVA'}
          </Button>
          {ownTaxConditionMessage && (
            <p className="text-xs text-green-600 dark:text-green-400">{ownTaxConditionMessage}</p>
          )}
          <p className="w-full text-xs text-muted-foreground">
            Determina qué letra de comprobante corresponde emitir (A/B/C) - Nueva factura la sugiere o
            la fuerza automáticamente en base a esto y a la condición IVA del cliente.
          </p>
        </div>

        <details className="mb-4 rounded-lg border p-4 text-xs text-muted-foreground">
          <summary className="cursor-pointer text-sm font-medium text-foreground">
            ¿Cómo consigo el certificado AFIP? (guía paso a paso)
          </summary>
          <div className="mt-3 flex flex-col gap-4">
            <div>
              <p className="mb-1 font-medium text-foreground">
                1. Generá la clave privada y el pedido de certificado (CSR)
              </p>
              <p className="mb-2">
                Con OpenSSL, en cualquier terminal (reemplazá el CUIT y el nombre):
              </p>
              <pre className="overflow-x-auto rounded-md bg-muted p-2 font-mono text-[11px]">
{`openssl req -new -newkey rsa:2048 -nodes \\
  -keyout empresa.key -out empresa.csr \\
  -subj "/C=AR/O=Nombre Empresa/CN=empresa/serialNumber=CUIT 20XXXXXXXXX"`}
              </pre>
              <p className="mt-1">
                Esto genera dos archivos: <span className="font-mono">empresa.key</span> (clave
                privada - nunca se sube a AFIP, sólo acá) y{' '}
                <span className="font-mono">empresa.csr</span> (pedido de certificado, ese sí va a
                AFIP).
              </p>
            </div>
            <div>
              <p className="mb-1 font-medium text-foreground">
                2. Para probar primero (Homologación - recomendado)
              </p>
              <ol className="ml-4 list-decimal">
                <li>Entrá a AFIP con Clave Fiscal → &quot;Administrador de Relaciones de Clave Fiscal&quot;.</li>
                <li>
                  Buscá el servicio &quot;WSASS&quot; (Administración de Certificados Digitales),
                  sección de testing/homologación.
                </li>
                <li>
                  Subí el <span className="font-mono">.csr</span> del paso 1 y descargá el{' '}
                  <span className="font-mono">.crt</span> (se emite al toque, sin trámite adicional).
                </li>
                <li>Asociá ese certificado al web service &quot;wsfe&quot; para tu CUIT.</li>
                <li>
                  Subí acá abajo el <span className="font-mono">.crt</span> descargado y el{' '}
                  <span className="font-mono">.key</span> del paso 1, ambiente
                  &quot;Homologación&quot;.
                </li>
              </ol>
            </div>
            <div>
              <p className="mb-1 font-medium text-foreground">
                3. Para facturar de verdad (Producción)
              </p>
              <ol className="ml-4 list-decimal">
                <li>
                  En &quot;Administrador de Relaciones de Clave Fiscal&quot; → &quot;Nueva
                  Relación&quot; → servicio &quot;wsfe&quot; (Facturación Electrónica), representado
                  tu propio CUIT.
                </li>
                <li>
                  En esa relación, adjuntá el certificado de producción (mismo{' '}
                  <span className="font-mono">.csr</span>, o generá uno nuevo con el comando de
                  arriba).
                </li>
                <li>
                  Subí acá el <span className="font-mono">.crt</span> de producción y su{' '}
                  <span className="font-mono">.key</span>, ambiente &quot;Producción&quot;.
                </li>
              </ol>
            </div>
            <p className="italic text-muted-foreground">
              Homologación y Producción son certificados y trámites separados - no sirve el mismo
              certificado para los dos ambientes.
            </p>
          </div>
        </details>

        {settings.afipConfigured ? (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border p-4">
            <span className="rounded-full bg-green-100 dark:bg-green-900/40 px-2 py-0.5 text-xs font-medium text-green-700 dark:text-green-400">
              Certificado cargado
            </span>
            <span className="text-xs text-muted-foreground">
              Ambiente: {settings.afipEnv === 'PRODUCCION' ? 'Producción' : 'Homologación'}
            </span>
            {settings.afipCertExpiresAt && (
              <span className="text-xs text-muted-foreground">
                Vence el {new Date(settings.afipCertExpiresAt).toLocaleDateString('es-AR')}
                {expiresInDays !== null && expiresInDays <= 30 && (
                  <span className="ml-1 font-medium text-amber-600 dark:text-amber-400">
                    ({expiresInDays <= 0 ? 'vencido' : `en ${expiresInDays} días`})
                  </span>
                )}
              </span>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => removeMutation.mutate()}
              disabled={removeMutation.isPending}
            >
              {removeMutation.isPending ? 'Quitando...' : 'Quitar certificado'}
            </Button>
          </div>
        ) : (
          <p className="mb-4 text-xs text-amber-600 dark:text-amber-400">
            Todavía no hay un certificado cargado - la emisión de comprobantes con CAE real no va a
            funcionar hasta que subas uno.
          </p>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setEnv('HOMOLOGACION')}
              className={pillClass(env === 'HOMOLOGACION')}
            >
              Homologación (sandbox)
            </button>
            <button
              type="button"
              onClick={() => setEnv('PRODUCCION')}
              className={pillClass(env === 'PRODUCCION')}
            >
              Producción
            </button>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Certificado (.crt / .pem)
              <input type="file" accept=".crt,.pem,.cer" onChange={handleCertFile} className="text-xs" />
              {certFileName && <span className="text-muted-foreground">{certFileName}</span>}
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Clave privada (.key)
              <input type="file" accept=".key,.pem" onChange={handleKeyFile} className="text-xs" />
              {keyFileName && <span className="text-muted-foreground">{keyFileName}</span>}
            </label>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          {message && <p className="text-sm text-green-600 dark:text-green-400">{message}</p>}
          <Button type="submit" className="self-start" disabled={!certPem || !keyPem || uploadMutation.isPending}>
            {uploadMutation.isPending ? 'Guardando...' : 'Guardar certificado'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

/** El fisco (AFIP/ARBA/etc.) es quien otorga el carácter de agente de
 * retención, no es algo que se active solo - por eso estos 3 flags son un
 * checkbox explícito, no un default en true. Gatillan si puede
 * crearse/aplicarse un WithholdingRegime de ese taxType (ver /taxes ->
 * Retenciones y el formulario de pago en Compras). */
function WithholdingAgentCard({ settings }: { settings: TenantSettings }) {
  const queryClient = useQueryClient();
  const [incomeTax, setIncomeTax] = useState(settings.withholdingAgentIncomeTax);
  const [vat, setVat] = useState(settings.withholdingAgentVat);
  const [grossIncome, setGrossIncome] = useState(settings.withholdingAgentGrossIncome);
  const [message, setMessage] = useState('');

  const mutation = useMutation({
    mutationFn: (patch: Partial<{ withholdingAgentIncomeTax: boolean; withholdingAgentVat: boolean; withholdingAgentGrossIncome: boolean }>) =>
      tenantSettingsApi.update(patch),
    onSuccess: () => {
      setMessage('Guardado');
      void queryClient.invalidateQueries({ queryKey: ['tenant-settings'] });
    },
  });

  function toggle(
    field: 'withholdingAgentIncomeTax' | 'withholdingAgentVat' | 'withholdingAgentGrossIncome',
    current: boolean,
    setter: (v: boolean) => void,
  ) {
    setter(!current);
    setMessage('');
    mutation.mutate({ [field]: !current });
  }

  return (
    <Card>
      <CardContent>
        <h2 className="mb-1 text-sm font-medium text-muted-foreground">Retenciones a proveedores</h2>
        <p className="mb-4 text-xs text-muted-foreground">
          Marcá sólo los impuestos para los que AFIP/ARBA (u otro organismo provincial) ya te otorgó el
          carácter de agente de retención. Habilita el catálogo de regímenes en Impuestos → Retenciones
          y la opción de retener al registrar un pago en Compras.
        </p>
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={incomeTax}
              onChange={() => toggle('withholdingAgentIncomeTax', incomeTax, setIncomeTax)}
            />
            Somos agentes de retención de Ganancias
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={vat} onChange={() => toggle('withholdingAgentVat', vat, setVat)} />
            Somos agentes de retención de IVA
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={grossIncome}
              onChange={() => toggle('withholdingAgentGrossIncome', grossIncome, setGrossIncome)}
            />
            Somos agentes de retención de Ingresos Brutos (IIBB)
          </label>
        </div>
        {message && <p className="mt-3 text-xs text-green-600 dark:text-green-400">{message}</p>}
      </CardContent>
    </Card>
  );
}

/** Datos fiscales del emisor que van en el PDF de Facturación (ver
 * @plexo/invoicing/pdf) - CUIT/razón social ya se cargan en otro lado
 * (tenantInfoApi/Tenant.name), acá sólo lo que faltaba. El formato de
 * papel por defecto es una preferencia del USUARIO (User.invoicePdfFormat,
 * no TenantSettings) - mismo criterio que purchaseDocumentPdfStyle - por
 * eso usa su propia mutation/query en vez de tenantSettingsApi. */
function InvoicePdfCard({ settings }: { settings: TenantSettings }) {
  const queryClient = useQueryClient();
  const [fiscalAddress, setFiscalAddress] = useState(settings.fiscalAddress ?? '');
  const [grossIncomeNumber, setGrossIncomeNumber] = useState(settings.grossIncomeNumber ?? '');
  const [activityStartDate, setActivityStartDate] = useState(
    settings.activityStartDate ? settings.activityStartDate.slice(0, 10) : '',
  );
  const [message, setMessage] = useState('');

  const { data: preferences } = useQuery({
    queryKey: ['invoicing-preferences'],
    queryFn: invoicingPreferencesApi.get,
  });

  const saveFiscalDataMutation = useMutation({
    mutationFn: () =>
      tenantSettingsApi.update({
        fiscalAddress: fiscalAddress.trim() === '' ? null : fiscalAddress.trim(),
        grossIncomeNumber: grossIncomeNumber.trim() === '' ? null : grossIncomeNumber.trim(),
        activityStartDate: activityStartDate === '' ? null : activityStartDate,
      }),
    onSuccess: () => {
      setMessage('Guardado');
      void queryClient.invalidateQueries({ queryKey: ['tenant-settings'] });
    },
  });

  const formatMutation = useMutation({
    mutationFn: (invoicePdfFormat: InvoicePdfFormat) => invoicingPreferencesApi.update(invoicePdfFormat),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['invoicing-preferences'] }),
  });

  return (
    <Card>
      <CardContent>
        <h2 className="mb-1 text-sm font-medium text-muted-foreground">Datos fiscales para la Factura</h2>
        <p className="mb-4 text-xs text-muted-foreground">
          Domicilio, Ingresos Brutos e inicio de actividades del emisor - se imprimen en el PDF de
          Facturación (CUIT y razón social ya se cargan arriba, en Certificado AFIP).
        </p>
        <div className="grid grid-cols-2 gap-4">
          <label className="col-span-2 flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Domicilio fiscal</span>
            <Input
              value={fiscalAddress}
              onChange={(e) => setFiscalAddress(e.target.value)}
              placeholder="Av. Siempre Viva 123, CABA"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Ingresos Brutos</span>
            <Input value={grossIncomeNumber} onChange={(e) => setGrossIncomeNumber(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Inicio de actividades</span>
            <Input type="date" value={activityStartDate} onChange={(e) => setActivityStartDate(e.target.value)} />
          </label>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setMessage('');
              saveFiscalDataMutation.mutate();
            }}
            disabled={saveFiscalDataMutation.isPending}
          >
            {saveFiscalDataMutation.isPending ? 'Guardando...' : 'Guardar'}
          </Button>
          {message && <p className="text-xs text-green-600 dark:text-green-400">{message}</p>}
        </div>

        {preferences && (
          <div className="mt-6 flex items-center gap-3 border-t pt-4">
            <span className="text-xs text-muted-foreground">Formato de PDF por defecto</span>
            <Select
              value={preferences.invoicePdfFormat}
              onChange={(value) => formatMutation.mutate(value as InvoicePdfFormat)}
              options={INVOICE_PDF_FORMATS}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function InventoryPricingCard({ settings }: { settings: TenantSettings }) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState(settings.defaultMarkupPercent?.toString() ?? '');
  const [message, setMessage] = useState('');

  const mutation = useMutation({
    mutationFn: (defaultMarkupPercent: number | null) => tenantSettingsApi.update({ defaultMarkupPercent }),
    onSuccess: () => {
      setMessage('Guardado');
      void queryClient.invalidateQueries({ queryKey: ['tenant-settings'] });
    },
  });

  function handleSave() {
    setMessage('');
    mutation.mutate(value.trim() === '' ? null : Number(value));
  }

  return (
    <Card>
      <CardContent>
        <h2 className="mb-1 text-sm font-medium text-muted-foreground">Precios de Inventario</h2>
        <p className="mb-4 text-xs text-muted-foreground">
          % de remarca sugerido por defecto para artículos que no tengan uno propio configurado (Inventario
          → editar artículo). Sólo pre-completa el precio de venta al cargar/editar - nunca lo cambia solo
          después.
        </p>
        <div className="flex items-center gap-3">
          <Input
            type="number"
            min={0}
            step="any"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="p. ej. 40"
            className="w-32"
          />
          <span className="text-sm text-muted-foreground">%</span>
          <Button type="button" size="sm" onClick={handleSave} disabled={mutation.isPending}>
            {mutation.isPending ? 'Guardando...' : 'Guardar'}
          </Button>
        </div>
        {message && <p className="mt-3 text-xs text-green-600 dark:text-green-400">{message}</p>}
      </CardContent>
    </Card>
  );
}

/** Dispara a mano el mismo barrido que corre solo todos los días a las
 * 2am (InventoryReplenishmentSchedulerService) para las variantes con
 * "Automático" tildado en Inventario → Alertas de stock - útil para no
 * esperar hasta la próxima corrida después de activar el flag en alguna. */
function ReplenishmentCard() {
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: inventoryApi.runReplenishmentNow,
    onSuccess: (result: AutoReplenishmentResult) => {
      setError('');
      setMessage(
        result.created === 0 && result.skippedAlreadyToday === 0
          ? 'Sin novedades: ningún artículo con reposición automática activada está bajo su mínimo ahora mismo'
          : `${result.created} pedido(s) de cotización creado(s)` +
              (result.skippedAlreadyToday > 0
                ? `, ${result.skippedAlreadyToday} proveedor(es) ya tenían uno generado hoy`
                : ''),
      );
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      setMessage('');
      setError(errorMessage(err, 'No se pudo ejecutar la reposición automática'));
    },
  });

  return (
    <Card>
      <CardContent>
        <h2 className="mb-1 text-sm font-medium text-muted-foreground">Reposición automática de stock</h2>
        <p className="mb-4 text-xs text-muted-foreground">
          Corre sola todos los días a la madrugada y genera un Pedido de Cotización por proveedor para
          las variantes marcadas &quot;Automático&quot; en Inventario → Alertas de stock. Usá este botón
          para ejecutarla ahora mismo en vez de esperar a la próxima corrida.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setMessage('');
            setError('');
            mutation.mutate();
          }}
          disabled={mutation.isPending}
        >
          {mutation.isPending ? 'Ejecutando...' : 'Ejecutar reposición ahora'}
        </Button>
        {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
        {message && <p className="mt-3 text-xs text-muted-foreground">{message}</p>}
      </CardContent>
    </Card>
  );
}

function EmailSettingsCard({ settings }: { settings: TenantSettings }) {
  const queryClient = useQueryClient();

  const [emailSenderMode, setEmailSenderMode] = useState<EmailSenderMode>(settings.emailSenderMode);
  const [emailFromName, setEmailFromName] = useState(settings.emailFromName ?? '');
  const [emailFromLocalPart, setEmailFromLocalPart] = useState(settings.emailFromLocalPart ?? '');
  const [reminderTone, setReminderTone] = useState<ReminderTone>(settings.reminderTone);
  const [reminderCcEmail, setReminderCcEmail] = useState(settings.reminderCcEmail ?? '');
  const [domain, setDomain] = useState(settings.emailCustomDomain ?? '');

  const [records, setRecords] = useState<DomainRecord[] | null>(null);
  const [saveError, setSaveError] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [domainError, setDomainError] = useState('');

  function invalidateSettings() {
    void queryClient.invalidateQueries({ queryKey: ['tenant-settings'] });
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      tenantSettingsApi.update({
        emailSenderMode,
        emailFromName,
        emailFromLocalPart,
        reminderTone,
        reminderCcEmail: reminderCcEmail.trim() || null,
      }),
    onSuccess: () => {
      setSaveError('');
      setSaveMessage('Guardado');
      invalidateSettings();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      setSaveMessage('');
      setSaveError(errorMessage(err, 'No se pudo guardar la preferencia'));
    },
  });

  const registerMutation = useMutation({
    mutationFn: () => emailDomainApi.register(domain),
    onSuccess: (result) => {
      setDomainError('');
      setRecords(result.records);
      invalidateSettings();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      setRecords(null);
      setDomainError(errorMessage(err, 'No se pudo registrar el dominio'));
    },
  });

  const verifyMutation = useMutation({
    mutationFn: () => emailDomainApi.verify(),
    onSuccess: (result) => {
      setDomainError('');
      setRecords(result.records);
      invalidateSettings();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      setDomainError(errorMessage(err, 'No se pudo verificar el dominio'));
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaveMessage('');
    setSaveError('');
    saveMutation.mutate();
  }

  const previewAddress = `${emailFromLocalPart || 'usuario'}@${domain || 'tudominio.com'}`;
  const previewFrom = emailFromName ? `${emailFromName} <${previewAddress}>` : previewAddress;
  const isPendingVerification =
    emailSenderMode === 'CUSTOM_DOMAIN' && settings.domainStatus !== 'verified';

  return (
    <Card>
      <CardContent>
        <h2 className="mb-4 text-sm font-medium text-muted-foreground">Remitente de emails a clientes</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setEmailSenderMode('CUSTOM_DOMAIN')}
              className={pillClass(emailSenderMode === 'CUSTOM_DOMAIN')}
            >
              Dominio propio (recomendado)
            </button>
            <button
              type="button"
              onClick={() => setEmailSenderMode('SHARED')}
              className={pillClass(emailSenderMode === 'SHARED')}
            >
              Compartido Oplex
            </button>
          </div>

          {emailSenderMode === 'CUSTOM_DOMAIN' && (
            <div className="flex flex-col gap-3 rounded-lg border p-4">
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Dominio
                  <Input
                    type="text"
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                    placeholder="tuempresa.com"
                    className="w-48"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Usuario
                  <Input
                    type="text"
                    value={emailFromLocalPart}
                    onChange={(e) => setEmailFromLocalPart(e.target.value)}
                    placeholder="facturas"
                    className="w-32"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Nombre para mostrar
                  <Input
                    type="text"
                    value={emailFromName}
                    onChange={(e) => setEmailFromName(e.target.value)}
                    placeholder="Facturación Tu Empresa"
                    className="w-56"
                  />
                </label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => registerMutation.mutate()}
                  disabled={!domain.trim() || registerMutation.isPending}
                >
                  {registerMutation.isPending ? 'Generando...' : 'Generar registros DNS'}
                </Button>
                {settings.emailCustomDomain && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => verifyMutation.mutate()}
                    disabled={verifyMutation.isPending}
                  >
                    {verifyMutation.isPending ? 'Verificando...' : 'Verificar ahora'}
                  </Button>
                )}
              </div>

              <p className="text-xs text-muted-foreground">
                Remitente final: <span className="font-mono">{previewFrom}</span>
              </p>

              {settings.emailCustomDomain && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Estado del dominio:</span>
                  <span className={`rounded-full px-2 py-0.5 font-medium ${statusPillClass(settings.domainStatus)}`}>
                    {statusLabel(settings.domainStatus)}
                  </span>
                </div>
              )}

              {isPendingVerification && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Mientras el dominio no esté verificado, los emails a clientes se siguen enviando
                  desde el remitente compartido de Oplex.
                </p>
              )}

              {domainError && <p className="text-xs text-destructive">{domainError}</p>}

              {records && records.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="text-muted-foreground">
                        <th className="pb-2 pr-4">Tipo</th>
                        <th className="pb-2 pr-4">Nombre</th>
                        <th className="pb-2 pr-4">Valor</th>
                        <th className="pb-2">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {records.map((record, i) => (
                        <tr key={i} className="border-t">
                          <td className="py-2 pr-4 font-mono">{record.type}</td>
                          <td className="py-2 pr-4 font-mono">{record.name}</td>
                          <td className="py-2 pr-4 font-mono break-all">{record.value}</td>
                          <td className="py-2">
                            <span className={`rounded-full px-2 py-0.5 font-medium ${statusPillClass(record.status)}`}>
                              {statusLabel(record.status)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">Tono del recordatorio de facturas vencidas</p>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(TONE_PREVIEWS) as ReminderTone[]).map((tone) => (
                <button
                  key={tone}
                  type="button"
                  onClick={() => setReminderTone(tone)}
                  className={pillClass(reminderTone === tone)}
                >
                  {TONE_PREVIEWS[tone].label}
                </button>
              ))}
            </div>
            <p className="text-xs italic text-muted-foreground">{TONE_PREVIEWS[reminderTone].preview}</p>
          </div>

          <label className="flex flex-col gap-1 text-sm text-muted-foreground">
            Email para copia (CC) del recordatorio de cobranza
            <Input
              type="email"
              value={reminderCcEmail}
              onChange={(e) => setReminderCcEmail(e.target.value)}
              placeholder="cobranzas@tuempresa.com"
              className="w-72"
            />
            <span className="text-xs text-muted-foreground">
              Opcional. Cada recordatorio que se le manda al cliente también le llega en copia a este
              buzón, sin necesitar un dominio propio.
            </span>
          </label>

          {saveError && <p className="text-sm text-destructive">{saveError}</p>}
          {saveMessage && <p className="text-sm text-green-600 dark:text-green-400">{saveMessage}</p>}
          <Button type="submit" className="self-start" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? 'Guardando...' : 'Guardar cambios'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
