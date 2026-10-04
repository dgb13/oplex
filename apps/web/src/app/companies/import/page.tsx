'use client';

import { Choice, errorMessage, Fact, formatInt, StatusPill, Stepper, Tile, ValueRow } from '@/components/ImportWizard';
import { Button } from '@/components/ui/button';
import {
  COMPANY_FIELD_OPTIONS,
  companyImportApi,
  NO_CONDITION,
  type CompanyImportAnalysis,
  type CompanyImportFieldOrSkip,
  type CompanyImportOptions,
  type CompanyImportRole,
  type CompanyImportStatus,
  type CompanyRowStatus,
} from '@/lib/companyImport';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';

type Kind = 'SUPPLIER' | 'CUSTOMER' | 'BOTH';
const KIND_LABEL: Record<Kind, string> = { SUPPLIER: 'proveedores', CUSTOMER: 'clientes', BOTH: 'proveedores y clientes' };
const KIND_ROLES: Record<Kind, CompanyImportRole[]> = { SUPPLIER: ['SUPPLIER'], CUSTOMER: ['CUSTOMER'], BOTH: ['SUPPLIER', 'CUSTOMER'] };

const STATUS_LABELS: Record<CompanyRowStatus, string> = {
  new: 'Nueva',
  update: 'Se completa',
  skip: 'Queda como está',
  error: 'Con error',
};

/** Importador de proveedores y clientes en 4 pasos (mockup aprobado
 * 2026-10-04). Se entra desde Compras → Proveedores o Ventas → Clientes
 * con el tipo ya elegido (?role=). */
export default function ImportCompaniesPage() {
  return (
    <Suspense fallback={null}>
      <ImportCompanies />
    </Suspense>
  );
}

function ImportCompanies() {
  const params = useSearchParams();
  const initialKind: Kind = params.get('role') === 'CUSTOMER' ? 'CUSTOMER' : 'SUPPLIER';
  const [kind, setKind] = useState<Kind>(initialKind);
  const [step, setStep] = useState(1);
  const [analysis, setAnalysis] = useState<CompanyImportAnalysis | null>(null);
  const [mapping, setMapping] = useState<CompanyImportFieldOrSkip[]>([]);
  const [onExisting, setOnExisting] = useState<CompanyImportOptions['onExisting']>('fill');
  const [verifyArca, setVerifyArca] = useState(true);
  const [conditionValues, setConditionValues] = useState<Record<string, string>>({});
  const [job, setJob] = useState<CompanyImportStatus | null>(null);

  const options: CompanyImportOptions = { mapping, roles: KIND_ROLES[kind], onExisting, verifyArca, conditionValues };
  const backHref = initialKind === 'CUSTOMER' ? '/clients' : '/suppliers';

  function reset() {
    setStep(1);
    setAnalysis(null);
    setMapping([]);
    setConditionValues({});
    setJob(null);
  }

  return (
    <div className="flex max-w-6xl flex-col gap-5">
      <div>
        <Link href={backHref} className="text-sm text-muted-foreground hover:underline">
          {initialKind === 'CUSTOMER' ? 'Ventas → Clientes' : 'Compras → Proveedores'}
        </Link>
        <h1 className="text-xl font-semibold">Importar {KIND_LABEL[kind]}</h1>
      </div>
      <Stepper step={step} />

      {step === 1 && (
        <FileStep
          kind={kind}
          setKind={setKind}
          analysis={analysis}
          onAnalyzed={(a) => {
            setAnalysis(a);
            setMapping(a.columns.map((c) => c.suggested));
            setConditionValues({});
          }}
          onReset={reset}
          onNext={() => setStep(2)}
        />
      )}
      {step === 2 && analysis && (
        <ColumnsStep
          analysis={analysis}
          mapping={mapping}
          setMapping={setMapping}
          onExisting={onExisting}
          setOnExisting={setOnExisting}
          verifyArca={verifyArca}
          setVerifyArca={setVerifyArca}
          onBack={() => setStep(1)}
          onNext={() => setStep(3)}
        />
      )}
      {step === 3 && analysis && (
        <ReviewStep
          importId={analysis.importId}
          kind={kind}
          options={options}
          setCondition={(key, value) => setConditionValues({ ...conditionValues, [key]: value })}
          onBack={() => setStep(2)}
          onStarted={(status) => {
            setJob(status);
            setStep(4);
          }}
        />
      )}
      {step === 4 && job && <ImportStep job={job} kind={kind} options={options} setJob={setJob} onReset={reset} />}
    </div>
  );
}

function FileStep({
  kind,
  setKind,
  analysis,
  onAnalyzed,
  onReset,
  onNext,
}: {
  kind: Kind;
  setKind: (k: Kind) => void;
  analysis: CompanyImportAnalysis | null;
  onAnalyzed: (a: CompanyImportAnalysis) => void;
  onReset: () => void;
  onNext: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const upload = useMutation({ mutationFn: companyImportApi.analyze, onSuccess: onAnalyzed });
  const exportRole = kind === 'BOTH' ? undefined : kind;

  function pick(file: File | undefined) {
    if (file) upload.mutate(file);
  }

  return (
    <>
      <section className="flex flex-col gap-4 rounded-xl border bg-card p-5">
        <div>
          <h2 className="font-semibold">Subí tu lista de {KIND_LABEL[kind]}</h2>
          <p className="text-sm text-muted-foreground">
            Excel (.xlsx) o CSV, tal como la tenés: exportada de tu sistema anterior, de tu planilla o de tu agenda. No hace falta pasarla a
            ningún formato.
          </p>
        </div>
        <Choice
          label="Las empresas del archivo son"
          hint={kind === 'BOTH' ? 'Cada empresa queda como proveedor y como cliente.' : ''}
          value={kind}
          onChange={(v) => setKind(v as Kind)}
          options={[
            ['SUPPLIER', 'Proveedores'],
            ['CUSTOMER', 'Clientes'],
            ['BOTH', 'Las dos cosas'],
          ]}
        />

        {analysis ? (
          <div className="flex flex-col gap-3 rounded-xl bg-muted/50 p-4">
            <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
              <span className="grid h-9 w-9 place-items-center rounded-md bg-green-100 text-xs font-bold text-green-700 dark:bg-green-900/40 dark:text-green-400">
                XLS
              </span>
              <span className="min-w-0 flex-1 truncate font-medium">{analysis.fileName}</span>
              <Button variant="ghost" size="sm" onClick={onReset}>
                Cambiar
              </Button>
            </div>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Fact label="Encabezados en la fila" value={String(analysis.headerRow)} />
              <Fact label="Filas con empresas" value={formatInt(analysis.rowCount)} />
              <Fact label="Columnas" value={String(analysis.columns.length)} />
            </dl>
          </div>
        ) : (
          <label
            htmlFor="import-file"
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              pick(e.dataTransfer.files[0]);
            }}
            className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition ${
              dragging ? 'border-primary bg-primary/5' : 'bg-muted/40'
            }`}
          >
            <span className="font-semibold">{upload.isPending ? 'Leyendo el archivo...' : 'Arrastrá el archivo acá'}</span>
            <span className="text-sm text-muted-foreground">o hacé clic para elegirlo · hasta 20.000 empresas</span>
            <input id="import-file" type="file" accept=".xlsx,.csv,.txt" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
          </label>
        )}
        {upload.isError && <p className="text-sm text-destructive">{errorMessage(upload.error, 'No se pudo leer el archivo')}</p>}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border p-4">
            <p className="text-sm font-semibold">¿Arrancás de cero?</p>
            <p className="text-sm text-muted-foreground">Bajá la planilla modelo, con un ejemplo y la explicación de cada columna.</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => void companyImportApi.downloadTemplate()}>
              Descargar planilla modelo
            </Button>
          </div>
          <div className="rounded-xl border p-4">
            <p className="text-sm font-semibold">¿Querés corregir datos en Excel?</p>
            <p className="text-sm text-muted-foreground">
              Exportá tus {KIND_LABEL[kind]}, corregí lo que haga falta y volvé a subir el archivo acá.
            </p>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => void companyImportApi.exportCompanies(exportRole)}>
              Exportar mis {KIND_LABEL[kind]}
            </Button>
          </div>
        </div>
      </section>
      <div className="flex justify-end">
        <Button onClick={onNext} disabled={!analysis}>
          Continuar
        </Button>
      </div>
    </>
  );
}

function ColumnsStep(props: {
  analysis: CompanyImportAnalysis;
  mapping: CompanyImportFieldOrSkip[];
  setMapping: (m: CompanyImportFieldOrSkip[]) => void;
  onExisting: CompanyImportOptions['onExisting'];
  setOnExisting: (v: CompanyImportOptions['onExisting']) => void;
  verifyArca: boolean;
  setVerifyArca: (v: boolean) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const { analysis, mapping, setMapping } = props;
  const recognized = analysis.columns.filter((c) => c.suggested !== 'skip').length;
  const missingName = !mapping.includes('name');
  const hasTaxId = mapping.includes('taxId');

  function change(index: number, value: CompanyImportFieldOrSkip) {
    // Un campo va en una sola columna: si ya estaba en otra, esa queda sin usar.
    setMapping(mapping.map((m, i) => (i === index ? value : value !== 'skip' && m === value ? 'skip' : m)));
  }

  const existingHint =
    props.onExisting === 'fill'
      ? 'Sólo se llenan los datos que están vacíos en Oplex; lo que cargaste a mano no se toca.'
      : props.onExisting === 'replace'
        ? 'Los datos del archivo reemplazan a los de Oplex (los vacíos del archivo no borran nada).'
        : 'Las empresas que ya existen no se modifican.';

  return (
    <>
      <section className="flex flex-col gap-3 rounded-xl border bg-card p-5">
        <div>
          <h2 className="font-semibold">¿Qué es cada columna?</h2>
          <p className="text-sm text-muted-foreground">
            Oplex reconoció {recognized} de {analysis.columns.length} columnas por su nombre. Revisá y cambiá lo que haga falta.
          </p>
        </div>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-semibold">Columna en tu archivo</th>
                <th className="px-3 py-2 font-semibold">Primeros valores</th>
                <th className="px-3 py-2 font-semibold">Va a Oplex como</th>
              </tr>
            </thead>
            <tbody>
              {analysis.columns.map((column) => (
                <tr key={column.index} className="border-b last:border-0">
                  <td className="px-3 py-2 font-medium">{column.header}</td>
                  <td className="max-w-xs truncate px-3 py-2 text-muted-foreground">{column.samples.join(' · ') || '—'}</td>
                  <td className="px-3 py-2">
                    <select
                      id={`map-${column.index}`}
                      aria-label={`Campo para ${column.header}`}
                      value={mapping[column.index]}
                      onChange={(e) => change(column.index, e.target.value as CompanyImportFieldOrSkip)}
                      className={`h-8 min-w-52 rounded-md border bg-card px-2 text-sm ${mapping[column.index] === 'skip' ? 'text-muted-foreground' : ''}`}
                    >
                      {COMPANY_FIELD_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {missingName && <p className="text-sm text-destructive">Falta indicar qué columna es la razón social.</p>}
        <p className="text-xs text-muted-foreground">Los saldos de cuenta corriente todavía no se importan: si el archivo trae una columna de saldo, dejala sin usar.</p>
      </section>

      <section className="grid gap-4 rounded-xl border bg-card p-5 sm:grid-cols-2">
        <Choice
          label="Si la empresa ya existe en Oplex"
          hint={`${existingHint} Se reconoce por CUIT o, si no tiene, por razón social.`}
          value={props.onExisting}
          onChange={(v) => props.setOnExisting(v as CompanyImportOptions['onExisting'])}
          options={[
            ['fill', 'Completar lo vacío'],
            ['replace', 'Reemplazar'],
            ['skip', 'Dejarla como está'],
          ]}
        />
        <label htmlFor="verify-arca" className="flex items-start gap-3 rounded-lg bg-primary/5 p-3 text-sm">
          <input
            id="verify-arca"
            type="checkbox"
            checked={props.verifyArca && hasTaxId}
            disabled={!hasTaxId}
            onChange={(e) => props.setVerifyArca(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-primary"
          />
          <span>
            <span className="font-semibold">Verificar los CUIT con ARCA</span>
            <span className="block text-xs text-muted-foreground">
              {hasTaxId
                ? 'Completa la condición de IVA y el domicilio fiscal que falten y avisa si la razón social no coincide. Tarda unos minutos más; podés seguir usando Oplex.'
                : 'El archivo no trae CUIT: no hay nada para verificar.'}
            </span>
          </span>
        </label>
      </section>

      <div className="flex justify-between">
        <Button variant="outline" onClick={props.onBack}>
          Volver
        </Button>
        <Button onClick={props.onNext} disabled={missingName}>
          Revisar {formatInt(analysis.rowCount)} empresas
        </Button>
      </div>
    </>
  );
}

function ReviewStep({
  importId,
  kind,
  options,
  setCondition,
  onBack,
  onStarted,
}: {
  importId: string;
  kind: Kind;
  options: CompanyImportOptions;
  setCondition: (key: string, value: string) => void;
  onBack: () => void;
  onStarted: (status: CompanyImportStatus) => void;
}) {
  const [filter, setFilter] = useState<CompanyRowStatus | 'all'>('all');
  const verifyArca = options.verifyArca && options.mapping.includes('taxId');
  const effective = useMemo(() => ({ ...options, verifyArca }), [options, verifyArca]);
  const optionsKey = useMemo(() => JSON.stringify(effective), [effective]);
  const { data: preview, isLoading, isError, error } = useQuery({
    queryKey: ['company-import-preview', importId, optionsKey],
    queryFn: () => companyImportApi.preview(importId, effective),
    placeholderData: (prev) => prev,
    // Mientras ARCA verifica, la revisión se actualiza sola con lo que va respondiendo.
    refetchInterval: (query) => {
      const arca = query.state.data?.arca;
      return arca && !arca.unavailable && arca.done < arca.total ? 3000 : false;
    },
  });
  const start = useMutation({ mutationFn: () => companyImportApi.start(importId, effective), onSuccess: onStarted });

  if (isError) return <p className="text-sm text-destructive">{errorMessage(error, 'No se pudo revisar el archivo')}</p>;
  if (isLoading || !preview) return <p className="text-sm text-muted-foreground">Revisando el archivo...</p>;

  const { counts, arca } = preview;
  const toImport = counts.new + counts.update;
  const rows = preview.rows.filter((r) => filter === 'all' || r.status === filter);
  const unresolved = preview.conditionValues.filter((v) => !v.resolved).length;
  const conditionOptions = [
    ...preview.conditionOptions.map((c) => ({ value: c, label: c })),
    { value: NO_CONDITION, label: verifyArca ? 'Dejar vacía (completa ARCA)' : 'Dejar vacía' },
  ];
  const otherRole = kind === 'SUPPLIER' ? 'proveedores' : kind === 'CUSTOMER' ? 'clientes' : 'proveedores y clientes';

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile tone="ok" count={counts.new} label="empresas nuevas" active={filter === 'new'} onClick={() => setFilter('new')} />
        <Tile tone="info" count={counts.update} label="ya existen y se completan" active={filter === 'update'} onClick={() => setFilter('update')} />
        <Tile tone="bad" count={counts.error} label="con errores, no se importan" active={filter === 'error'} onClick={() => setFilter('error')} />
        <Tile
          tone="muted"
          count={counts.new + counts.update + counts.error + counts.skip}
          label={counts.skip ? `ver todas (${formatInt(counts.skip)} se dejan como están)` : 'ver todas'}
          active={filter === 'all'}
          onClick={() => setFilter('all')}
        />
      </div>

      {arca && (
        <p className={`rounded-lg px-3 py-2 text-sm ${arca.unavailable ? 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300' : 'bg-primary/5'}`}>
          {arca.unavailable
            ? arca.unavailable
            : arca.done < arca.total
              ? `Verificando en ARCA: ${formatInt(arca.done)} de ${formatInt(arca.total)} CUIT. Los avisos aparecen a medida que responde; podés importar igual y termina antes de guardar.`
              : `ARCA verificó los ${formatInt(arca.total)} CUIT.`}
        </p>
      )}

      {(preview.conditionValues.length > 0 || preview.contacts > 0 || preview.rolesAdded > 0) && (
        <section className="flex flex-col gap-3 rounded-xl border bg-card p-5">
          {preview.conditionValues.length > 0 && (
            <>
              <div>
                <h2 className="font-semibold">Condición de IVA</h2>
                <p className="text-sm text-muted-foreground">
                  Oplex interpretó cómo está escrita en tu archivo. {unresolved > 0 ? `Elegí las ${unresolved} que no reconoció; ` : ''}
                  lo que cambies se aplica a todas las filas. Decide si les facturás A o B.
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {preview.conditionValues.map((v) => (
                  <ValueRow
                    key={v.key}
                    label={`"${v.raw}"`}
                    count={v.count}
                    value={v.resolved ?? ''}
                    options={conditionOptions}
                    onChange={(value) => setCondition(v.key, value)}
                  />
                ))}
              </div>
            </>
          )}
          {(preview.contacts > 0 || preview.rolesAdded > 0) && (
            <p className="text-sm text-muted-foreground">
              {preview.contacts > 0 && (
                <>
                  Se van a cargar <b>{formatInt(preview.contacts)} contactos</b>.{' '}
                </>
              )}
              {preview.rolesAdded > 0 && (
                <>
                  <b>{formatInt(preview.rolesAdded)} empresas</b> que ya tenías pasan a ser también {otherRole}.
                </>
              )}
            </p>
          )}
        </section>
      )}

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <th className="px-3 py-2 font-semibold">Fila</th>
              <th className="px-3 py-2 font-semibold">Razón social</th>
              <th className="px-3 py-2 font-semibold">CUIT</th>
              <th className="px-3 py-2 font-semibold">Condición de IVA</th>
              <th className="px-3 py-2 font-semibold">Contacto</th>
              <th className="px-3 py-2 font-semibold">Estado</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.rowNumber} className="border-b last:border-0">
                <td className="px-3 py-2 text-muted-foreground tabular-nums">{r.rowNumber}</td>
                <td className="px-3 py-2">
                  {r.name || '—'}
                  {r.messages.map((m) => (
                    <div key={m} className="text-xs text-destructive">
                      {m}
                    </div>
                  ))}
                  {r.warnings.map((w) => (
                    <div key={w} className="text-xs text-amber-700 dark:text-amber-400">
                      {w}
                    </div>
                  ))}
                  {r.notes.map((n) => (
                    <div key={n} className="text-xs text-blue-700 dark:text-blue-400">
                      {n}
                    </div>
                  ))}
                </td>
                <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{r.taxId ?? '—'}</td>
                <td className="px-3 py-2">{r.taxCondition ?? '—'}</td>
                <td className="px-3 py-2">{r.contact ? [r.contact.firstName, r.contact.lastName].filter(Boolean).join(' ') : '—'}</td>
                <td className="px-3 py-2">
                  <StatusPill status={r.status} labels={STATUS_LABELS} />
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                  No hay filas en este grupo.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">Se muestran hasta 100 filas de cada grupo.</p>

      {start.isError && <p className="text-sm text-destructive">{errorMessage(start.error, 'No se pudo empezar la importación')}</p>}
      <div className="flex flex-wrap justify-between gap-2">
        <Button variant="outline" onClick={onBack}>
          Volver
        </Button>
        <div className="flex flex-wrap gap-2">
          {counts.error > 0 && (
            <Button variant="outline" onClick={() => void companyImportApi.downloadErrors(importId, effective)}>
              Descargar errores en Excel
            </Button>
          )}
          <Button onClick={() => start.mutate()} disabled={toImport === 0 || start.isPending}>
            {start.isPending ? 'Empezando...' : `Importar ${formatInt(toImport)} empresas`}
          </Button>
        </div>
      </div>
    </>
  );
}

function ImportStep({
  job,
  kind,
  options,
  setJob,
  onReset,
}: {
  job: CompanyImportStatus;
  kind: Kind;
  options: CompanyImportOptions;
  setJob: (s: CompanyImportStatus) => void;
  onReset: () => void;
}) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (job.state !== 'running') {
      void queryClient.invalidateQueries({ queryKey: ['companies'] });
      return;
    }
    const timer = setInterval(() => {
      companyImportApi.status(job.importId).then(setJob).catch(() => undefined);
    }, 1000);
    return () => clearInterval(timer);
  }, [job.state, job.importId, setJob, queryClient]);

  if (job.state === 'running') {
    const verifying = job.phase === 'arca';
    const percent = verifying
      ? job.arcaTotal
        ? Math.round((job.arcaDone / job.arcaTotal) * 100)
        : 0
      : job.total
        ? Math.round((job.processed / job.total) * 100)
        : 100;
    return (
      <section className="flex flex-col gap-3 rounded-xl border bg-card p-5">
        <h2 className="font-semibold">{verifying ? 'Verificando en ARCA…' : 'Importando…'}</h2>
        <div className="h-2.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary transition-all" style={{ width: `${percent}%` }} />
        </div>
        <p className="text-sm text-muted-foreground tabular-nums">
          {verifying
            ? `${formatInt(job.arcaDone)} de ${formatInt(job.arcaTotal)} CUIT verificados`
            : `${formatInt(job.processed)} de ${formatInt(job.total)} empresas`}{' '}
          · podés seguir usando Oplex mientras termina
        </p>
      </section>
    );
  }

  const listHref = kind === 'CUSTOMER' ? '/clients' : '/suppliers';
  return (
    <section className="flex flex-col items-center gap-3 rounded-xl border bg-card p-8 text-center">
      <span
        className={`grid h-12 w-12 place-items-center rounded-full text-2xl font-bold ${
          job.state === 'done' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' : 'bg-amber-100 text-amber-700'
        }`}
      >
        {job.state === 'done' ? '✓' : '!'}
      </span>
      <h2 className="font-semibold">{job.state === 'done' ? `Listo: tus ${KIND_LABEL[kind]} ya están en Oplex` : 'La importación se cortó'}</h2>
      {job.error && <p className="max-w-lg text-sm text-muted-foreground">{job.error}</p>}
      <p className="text-sm text-muted-foreground tabular-nums">
        <b>{formatInt(job.created)}</b> nuevas · <b>{formatInt(job.updated)}</b> completadas · <b>{formatInt(job.failed)}</b> sin importar
        {job.skipped ? ` · ${formatInt(job.skipped)} se dejaron como estaban` : ''}
        {job.contacts ? ` · ${formatInt(job.contacts)} contactos` : ''}
        {job.arcaVerified
          ? ` · ${formatInt(job.arcaVerified)} CUIT verificados con ARCA${job.arcaNameMismatch ? ` (${formatInt(job.arcaNameMismatch)} con razón social distinta)` : ''}`
          : ''}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Link href={listHref}>
          <Button>Ver {kind === 'CUSTOMER' ? 'clientes' : 'proveedores'}</Button>
        </Link>
        {(job.failed > 0 || job.arcaNameMismatch > 0) && (
          <Button variant="outline" onClick={() => void companyImportApi.downloadErrors(job.importId, options)}>
            Descargar errores y avisos
          </Button>
        )}
        <Button variant="ghost" onClick={onReset}>
          Importar otro archivo
        </Button>
      </div>
    </section>
  );
}
