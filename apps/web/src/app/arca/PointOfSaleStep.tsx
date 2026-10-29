'use client';

import { pointOfSaleSystemNames } from '@/components/arca/PointOfSaleHelpModal';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { companiesApi } from '@/lib/companies';
import {
  afipCertificateApi,
  type ArcaCheckResult,
  type ArcaPointsOfSaleResult,
  type TenantSettings,
  type TenantTaxCondition,
} from '@/lib/tenantSettings';
import { useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import Link from 'next/link';
import { useState } from 'react';

// Paso 5 de "Conexión con ARCA" (mockup aprobado el 2026-10-28): quien ya
// factura desde Comprobantes en línea / Factura en línea no sabe que para
// un sistema hace falta otro punto de venta, de Web Services. Oplex le
// pregunta a ARCA cuáles tiene, los asigna a las sucursales con un clic y
// prueba la conexión. Si no tiene ninguno, la guía para crearlo.

const TAX_CONDITION_LABELS: Record<TenantTaxCondition, string> = {
  RESPONSABLE_INSCRIPTO: 'Responsable Inscripto',
  MONOTRIBUTO: 'Monotributo',
  EXENTO: 'Exento',
};

function pad(n: number | string): string {
  return String(n).padStart(5, '0');
}

function errorMessage(err: unknown, fallback: string): string {
  const message = (err as AxiosError<{ message?: string | string[] }>)?.response?.data?.message;
  if (Array.isArray(message)) return message.join(', ');
  return message ?? fallback;
}

/** Para cada sucursal, el punto de venta propuesto: el que ya tiene si ARCA
 * lo reconoce; si no, uno habilitado ("" = sigue sin facturar). */
function defaultChoices(result: ArcaPointsOfSaleResult): Record<string, string> {
  return Object.fromEntries(
    result.branches.map((branch, i) => [
      branch.id,
      branch.enabled
        ? String(Number.parseInt(branch.pointOfSaleNumber ?? '', 10))
        : String(result.enabled[i] ?? result.enabled[0] ?? ''),
    ]),
  );
}

export function PointOfSaleStep({
  settings,
  onSaved,
  onShowStep32,
}: {
  settings: TenantSettings;
  onSaved: () => void;
  onShowStep32: () => void;
}) {
  const queryClient = useQueryClient();
  const names = pointOfSaleSystemNames(settings.ownTaxCondition);
  const onlineName = names.online.startsWith('Factura') ? 'Factura en línea' : 'Comprobantes en línea';
  const conditionLabel = settings.ownTaxCondition ? TAX_CONDITION_LABELS[settings.ownTaxCondition] : null;

  const [searching, setSearching] = useState(false);
  const [found, setFound] = useState<ArcaPointsOfSaleResult | null>(null);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [newBranchName, setNewBranchName] = useState('Casa Central');
  const [applying, setApplying] = useState(false);
  const [checkResult, setCheckResult] = useState<ArcaCheckResult | null>(null);
  const [error, setError] = useState('');

  async function search() {
    setSearching(true);
    setError('');
    setCheckResult(null);
    try {
      const result = await afipCertificateApi.pointsOfSale();
      setFound(result);
      setChoices(defaultChoices(result));
    } catch (err) {
      setError(errorMessage(err, 'No se pudo consultar a ARCA. Probá de nuevo en unos minutos.'));
    } finally {
      setSearching(false);
    }
  }

  async function apply() {
    if (!found) return;
    setApplying(true);
    setError('');
    try {
      if (found.branches.length === 0) {
        await companiesApi.create({
          name: newBranchName.trim() || 'Casa Central',
          roles: ['BRANCH'],
          pointOfSaleNumber: String(found.enabled[0]),
        });
      } else {
        // Sólo se cambian las sucursales cuyo número ARCA no reconoce: una
        // que ya factura bien no se toca (separaría su numeración).
        for (const branch of found.branches) {
          const choice = choices[branch.id];
          if (branch.enabled || !choice) continue;
          await companiesApi.update(branch.id, { pointOfSaleNumber: choice });
        }
      }
      void queryClient.invalidateQueries({ queryKey: ['companies'] });
      const result = await afipCertificateApi.check();
      setCheckResult(result);
      if (result.ok) setFound(null);
      onSaved();
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar el punto de venta'));
    } finally {
      setApplying(false);
    }
  }

  const done = checkResult?.ok || (!found && !checkResult && settings.afipLastCheckOk === true);
  const letter = checkResult?.documentLetter;

  return (
    <>
      <div className="rounded-lg border border-l-[3px] border-l-orange-500 bg-muted/50 px-3.5 py-3 text-[13.5px] text-muted-foreground">
        ¿Ya facturás desde <b className="text-foreground">{onlineName}</b> en la página de ARCA? Ese punto de venta{' '}
        <b className="text-foreground">no sirve para Oplex</b>: ARCA pide uno aparte, de Web Services. Se crea gratis en un
        par de minutos y el que tenés lo seguís usando igual.
      </div>

      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2 rounded-xl border px-3.5 py-3">
        <span className="text-xs text-muted-foreground">
          {conditionLabel ? (
            <>
              Como sos <b className="text-foreground">{conditionLabel}</b>, en ARCA el sistema tiene que ser:
            </>
          ) : (
            'En ARCA el sistema tiene que ser (según tu condición IVA del paso 1):'
          )}
        </span>
        <span className="text-sm font-bold">{names.webServices}</span>
      </div>

      {done ? (
        <div className="flex flex-col gap-3 rounded-xl bg-emerald-50 px-3.5 py-3.5 dark:bg-emerald-950/40">
          <h4 className="text-[14.5px] font-semibold text-emerald-700 dark:text-emerald-400">✓ Listo para facturar</h4>
          {checkResult?.ok ? (
            <ul className="ml-4 list-disc text-[12.5px]">
              {checkResult.points.map((p) => (
                <li key={p.pointOfSale}>
                  Punto de venta <b className="font-mono">{pad(p.pointOfSale)}</b> ({p.branchName}): última Factura {letter}{' '}
                  <span className="font-mono">
                    {pad(p.pointOfSale)}-{String(p.lastNumber).padStart(8, '0')}
                  </span>
                  , la primera que hagas va a ser la{' '}
                  <span className="font-mono">
                    {pad(p.pointOfSale)}-{String(p.lastNumber + 1).padStart(8, '0')}
                  </span>
                  .
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[12.5px]">{settings.afipLastCheckMessage}</p>
          )}
          <div className="flex flex-wrap items-center gap-2.5">
            <Link href="/invoicing" className={buttonVariants({ size: 'sm' })}>
              Hacer la primera factura
            </Link>
            <Button type="button" variant="outline" size="sm" onClick={search} disabled={searching}>
              {searching ? 'Consultando a ARCA…' : 'Volver a probar'}
            </Button>
          </div>
        </div>
      ) : !found ? (
        <div className="flex flex-wrap items-center gap-2.5">
          <Button type="button" onClick={search} disabled={!settings.afipConfigured || searching}>
            {searching ? 'Consultando a ARCA…' : 'Buscar mis puntos de venta en ARCA'}
          </Button>
          <span className="text-[12.5px] text-muted-foreground">
            {settings.afipConfigured
              ? 'Oplex le pregunta a ARCA cuáles tenés habilitados. No emite nada.'
              : 'Primero subí el certificado (paso 4).'}
          </span>
        </div>
      ) : !found.ok ? (
        <div className="flex flex-col gap-2.5 rounded-xl bg-red-50 px-3.5 py-3.5 dark:bg-red-950/40">
          <h4 className="text-[14.5px] font-semibold text-red-700 dark:text-red-400">No se pudo consultar a ARCA</h4>
          <p className="text-[12.5px]">{found.message}</p>
          <div className="flex flex-wrap gap-2.5">
            {found.problem === 'NOT_AUTHORIZED' && (
              <Button type="button" size="sm" onClick={onShowStep32}>
                Ver paso 3.2
              </Button>
            )}
            <Button type="button" variant="outline" size="sm" onClick={search} disabled={searching}>
              {searching ? 'Consultando a ARCA…' : 'Buscar de nuevo'}
            </Button>
          </div>
        </div>
      ) : found.enabled.length === 0 ? (
        <div className="flex flex-col gap-2.5 rounded-xl bg-red-50 px-3.5 py-3.5 dark:bg-red-950/40">
          <h4 className="text-[14.5px] font-semibold text-red-700 dark:text-red-400">
            ARCA no tiene ningún punto de venta de Web Services para tu CUIT
          </h4>
          <p className="text-[12.5px]">
            Es lo normal si hasta ahora facturabas desde {onlineName}. Seguí estos 4 pasos y volvé a buscar.
            {found.unavailable.length > 0 &&
              ` Bloqueados o dados de baja: ${found.unavailable
                .map((p) => `${pad(p.number)}${p.blocked ? ' (bloqueado)' : ''}${p.deregisteredOn ? ` (baja ${p.deregisteredOn})` : ''}`)
                .join(', ')}.`}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-xl bg-primary/10 px-3.5 py-3.5">
          <h4 className="flex flex-wrap items-center gap-1.5 text-[14.5px] font-semibold">
            ARCA tiene {found.enabled.length === 1 ? '1 punto de venta' : `${found.enabled.length} puntos de venta`} de Web
            Services:
            {found.enabled.map((n) => (
              <span
                key={n}
                className="rounded-full bg-emerald-100 px-2 py-px font-mono text-[11px] font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
              >
                {pad(n)}
              </span>
            ))}
          </h4>
          {found.branches.length === 0 ? (
            <>
              <p className="text-[12.5px]">Todavía no tenés sucursales. Creamos una con ese punto de venta.</p>
              <div className="flex flex-wrap items-end gap-2.5">
                <label className="flex flex-col gap-1 text-[12.5px] text-muted-foreground">
                  Nombre de la sucursal
                  <Input className="w-56 bg-card" value={newBranchName} onChange={(e) => setNewBranchName(e.target.value)} />
                </label>
                <span className="pb-2 text-[12.5px] text-muted-foreground">
                  con el punto de venta <b className="font-mono text-foreground">{pad(found.enabled[0])}</b>
                </span>
              </div>
              <div>
                <Button type="button" onClick={apply} disabled={applying}>
                  {applying ? 'Guardando y probando…' : 'Crear sucursal y probar'}
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-[12.5px]">
                Elegí con cuál factura cada sucursal. Las que tienen un número que ARCA no reconoce están marcadas.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full overflow-hidden rounded-lg border bg-card text-[13px]">
                  <thead>
                    <tr className="border-b text-left text-[11px] tracking-wide text-muted-foreground uppercase">
                      <th className="px-2.5 py-1.5 font-semibold">Sucursal</th>
                      <th className="px-2.5 py-1.5 font-semibold">Hoy tiene</th>
                      <th className="px-2.5 py-1.5 font-semibold">Va a facturar con</th>
                    </tr>
                  </thead>
                  <tbody>
                    {found.branches.map((branch) => (
                      <tr key={branch.id} className="border-b last:border-b-0">
                        <td className="px-2.5 py-2 font-semibold">{branch.name}</td>
                        <td className="px-2.5 py-2">
                          {branch.pointOfSaleNumber ? (
                            <>
                              <span className="font-mono">{branch.pointOfSaleNumber}</span>{' '}
                              {branch.enabled ? (
                                <StatusPill tone="ok">OK</StatusPill>
                              ) : (
                                <StatusPill tone="bad">no es de Web Services</StatusPill>
                              )}
                            </>
                          ) : (
                            <StatusPill tone="warn">sin punto de venta</StatusPill>
                          )}
                        </td>
                        <td className="px-2.5 py-2">
                          {branch.enabled ? (
                            <span className="font-mono">{branch.pointOfSaleNumber}</span>
                          ) : (
                            <select
                              aria-label={`Punto de venta de ${branch.name}`}
                              value={choices[branch.id] ?? ''}
                              onChange={(e) => setChoices((prev) => ({ ...prev, [branch.id]: e.target.value }))}
                              className="rounded-md border bg-card px-2 py-1 font-mono text-[13px]"
                            >
                              {found.enabled.map((n) => (
                                <option key={n} value={String(n)}>
                                  {pad(n)}
                                </option>
                              ))}
                              {!branch.pointOfSaleNumber && <option value="">No factura</option>}
                            </select>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <Button type="button" onClick={apply} disabled={applying}>
                  {applying ? 'Guardando y probando…' : 'Guardar y probar'}
                </Button>
                <span className="text-xs text-muted-foreground">
                  Un punto de venta lo pueden compartir varias sucursales, pero conviene uno por local.
                </span>
              </div>
            </>
          )}
        </div>
      )}

      {checkResult && !checkResult.ok && (
        <p className="rounded-xl bg-red-50 px-3.5 py-3 text-[13px] text-red-700 dark:bg-red-950/40 dark:text-red-400">
          <b>✕ ARCA todavía no acepta el punto de venta.</b> {checkResult.message}
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* key: se vuelve a montar abierta cuando ARCA no tiene ninguno. */}
      <CreateGuide
        key={found?.ok && found.enabled.length === 0 ? 'open' : 'closed'}
        open={Boolean(found?.ok && found.enabled.length === 0)}
        conditionLabel={conditionLabel}
        names={names}
        onlineName={onlineName}
      />

      {found?.ok && found.enabled.length === 0 && (
        <div>
          <Button type="button" onClick={search} disabled={searching}>
            {searching ? 'Consultando a ARCA…' : 'Ya lo creé · buscar de nuevo'}
          </Button>
        </div>
      )}
    </>
  );
}

function StatusPill({ tone, children }: { tone: 'ok' | 'bad' | 'warn'; children: React.ReactNode }) {
  const tones = {
    ok: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400',
    bad: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400',
    warn: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  };
  return <span className={`rounded-full px-2 py-px text-[11px] font-bold whitespace-nowrap ${tones[tone]}`}>{children}</span>;
}

function CreateGuide({
  open,
  conditionLabel,
  names,
  onlineName,
}: {
  open: boolean;
  conditionLabel: string | null;
  names: { webServices: string; online: string };
  onlineName: string;
}) {
  return (
    <details open={open} className="group rounded-xl border">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2.5 px-3.5 py-3 font-semibold [&::-webkit-details-marker]:hidden">
        <span>Cómo crear el punto de venta en ARCA</span>
        <span className="flex items-center gap-2">
          {conditionLabel && (
            <span className="rounded-full bg-primary/10 px-2 py-px text-[11px] font-bold text-primary">
              para {conditionLabel}
            </span>
          )}
          <span className="text-muted-foreground transition-transform group-open:rotate-90">›</span>
        </span>
      </summary>
      <div className="flex flex-col gap-5 px-3.5 pt-1 pb-4">
        <GuideStep
          n={1}
          title="Entrá a ARCA"
          aside={
            <Shot title="ARCA · Mis servicios">
              <b className="text-[12.5px]">Buscar servicio</b>
              <Opt>puntos de venta</Opt>
              <Opt pin={1}>Administración de puntos de venta y domicilios</Opt>
            </Shot>
          }
        >
          <p>
            Ingresá con tu CUIT y clave fiscal. En el buscador escribí <b className="text-foreground">puntos de venta</b> y
            abrí <b className="text-foreground">Administración de puntos de venta y domicilios</b>.
          </p>
          <p className="text-xs">Si no aparece, adherilo en &quot;Administrador de Relaciones de Clave Fiscal&quot;.</p>
        </GuideStep>

        <GuideStep
          n={2}
          title="Abrí la lista y tocá Agregar"
          aside={
            <Shot title="A/B/M de Puntos de Venta">
              <PosTable rows={[{ n: 1, system: names.online }]} />
              <Opt pin={2} inline bold>
                Agregar
              </Opt>
            </Shot>
          }
        >
          <p>
            Tocá <b className="text-foreground">A/B/M de Puntos de Venta</b>, elegí tu empresa y tocá{' '}
            <b className="text-foreground">Agregar</b>.
          </p>
          <p>
            Vas a ver el que ya usás en {onlineName}. <b className="text-foreground">Ese no se toca</b>: lo seguís usando como
            siempre.
          </p>
        </GuideStep>

        <GuideStep
          n={3}
          title="Completá el punto de venta nuevo"
          aside={
            <Shot title="A/B/M de Puntos de Venta · Alta">
              <Fld label="Número">
                <Opt pin={1} mono>
                  2
                </Opt>
              </Fld>
              <Fld label="Nombre de fantasía">
                <Opt>Oplex</Opt>
              </Fld>
              <Fld label="Sistema">
                <Opt pin={2}>{names.webServices} ▾</Opt>
              </Fld>
              <Fld label="Domicilio">
                <Opt>Av. Ejemplo 1234 - Local ▾</Opt>
              </Fld>
              <Opt pin={3} inline bold>
                Aceptar
              </Opt>
            </Shot>
          }
        >
          <p>
            <b className="text-foreground">Número:</b> uno que no uses. Si sólo tenés el 1, poné <Code>2</Code>.
          </p>
          <p>
            <b className="text-foreground">Nombre de fantasía:</b> el que quieras, por ejemplo <Code>Oplex</Code>.
          </p>
          <p>
            <b className="text-foreground">Sistema:</b> elegí exactamente
            <br />
            <Code>{names.webServices}</Code>
          </p>
          <p>
            <b className="text-foreground">Domicilio:</b> el de tu local o el fiscal. Tocá{' '}
            <b className="text-foreground">Aceptar</b>.
          </p>
        </GuideStep>

        <GuideStep
          n={4}
          title="Volvé acá"
          aside={
            <Shot
              title="A/B/M de Puntos de Venta"
              caption={`Así queda la lista: el 1 para ${onlineName}, el 2 para Oplex.`}
            >
              <PosTable
                rows={[
                  { n: 1, system: names.online },
                  { n: 2, system: names.webServices, highlight: true },
                ]}
              />
            </Shot>
          }
        >
          <p>
            Tocá <b className="text-foreground">Buscar mis puntos de venta en ARCA</b>. Oplex lo encuentra y lo carga en tu
            sucursal.
          </p>
          <p className="text-xs">Uno recién creado a veces tarda unos minutos en aparecer.</p>
        </GuideStep>
      </div>
    </details>
  );
}

function GuideStep({
  n,
  title,
  aside,
  children,
}: {
  n: number;
  title: string;
  aside: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="flex flex-col gap-1.5 text-[13px] text-muted-foreground">
        <h5 className="mb-0.5 flex items-center gap-2 text-sm font-semibold text-foreground">
          <span className="inline-flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full bg-primary/10 text-xs font-extrabold text-primary">
            {n}
          </span>
          {title}
        </h5>
        {children}
      </div>
      {aside}
    </div>
  );
}

function Shot({ title, caption, children }: { title: string; caption?: string; children: React.ReactNode }) {
  return (
    <figure className="m-0 overflow-hidden rounded-lg border bg-muted/30 text-[11.5px]">
      <div className="flex items-center gap-1.5 bg-muted px-2.5 py-1.5 text-[11px] text-muted-foreground">
        <span className="h-2 w-2 rounded-full bg-border" />
        <span className="h-2 w-2 rounded-full bg-border" />
        <span className="h-2 w-2 rounded-full bg-border" />
        <span className="ml-1">{title}</span>
      </div>
      <div className="flex flex-col gap-2 p-3">{children}</div>
      <figcaption className="border-t px-2.5 py-1.5 text-[11px] text-muted-foreground">
        {caption ?? 'Pantalla de ejemplo simplificada. Puede verse distinta en ARCA.'}
      </figcaption>
    </figure>
  );
}

function Opt({
  pin,
  mono,
  inline,
  bold,
  children,
}: {
  pin?: number;
  mono?: boolean;
  inline?: boolean;
  bold?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`relative rounded-md border bg-card px-[9px] py-[6px] ${pin ? 'outline-[2.5px] outline-offset-2 outline-amber-400 outline-solid' : ''} ${
        mono ? 'font-mono' : ''
      } ${inline ? 'self-start' : ''} ${bold ? 'font-semibold' : ''}`}
    >
      {children}
      {pin && (
        <span className="absolute -top-2.5 -right-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-[11px] font-extrabold text-amber-950">
          {pin}
        </span>
      )}
    </div>
  );
}

function Fld({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <small className="text-muted-foreground">{label}</small>
      {children}
    </div>
  );
}

function PosTable({ rows }: { rows: { n: number; system: string; highlight?: boolean }[] }) {
  return (
    <table className="w-full border-collapse rounded-md border bg-card tabular-nums">
      <thead>
        <tr className="border-b text-left text-[10px] tracking-wide text-muted-foreground uppercase">
          <th className="px-2 py-1.5">Nro.</th>
          <th className="px-2 py-1.5">Sistema</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.n} className={`border-b last:border-b-0 ${row.highlight ? 'bg-amber-400/20' : ''}`}>
            <td className="px-2 py-1.5 font-mono">{row.n}</td>
            <td className="px-2 py-1.5">{row.system}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">{children}</code>;
}
