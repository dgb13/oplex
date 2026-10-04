'use client';

import { Choice, errorMessage, Fact, formatInt, StatusPill, Stepper, Tile, ValueRow } from '@/components/ImportWizard';
import { Button } from '@/components/ui/button';
import {
  articleImportApi,
  guessLengthUnit,
  IMPORT_FIELD_OPTIONS,
  UNIT_OPTIONS,
  type ImportAnalysis,
  type ImportFieldOrSkip,
  type ImportJobStatus,
  type ImportOptions,
  type LengthUnit,
  type RowStatus,
  type UnitValue,
} from '@/lib/articleImport';
import { inventoryApi } from '@/lib/inventory';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

const REQUIRED: ImportFieldOrSkip[] = ['sku', 'name', 'price'];
// Igual que NO_TAX en ArticleImportService: el artículo queda sin alícuota.
const NO_TAX = '__none__';
const formatMoney = (n: number | null) =>
  n === null ? '—' : `$ ${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Importador de artículos en 4 pasos (mockup aprobado 2026-10-04). */
export default function ImportArticlesPage() {
  const [step, setStep] = useState(1);
  const [analysis, setAnalysis] = useState<ImportAnalysis | null>(null);
  const [mapping, setMapping] = useState<ImportFieldOrSkip[]>([]);
  const [onExisting, setOnExisting] = useState<'update' | 'skip'>('update');
  const [pricesIncludeVat, setPricesIncludeVat] = useState(false);
  const [warehouseId, setWarehouseId] = useState('');
  const [taxValues, setTaxValues] = useState<Record<string, string>>({});
  const [unitValues, setUnitValues] = useState<Record<string, UnitValue>>({});
  const [lengthUnit, setLengthUnit] = useState<LengthUnit>('m');
  const [perMeter, setPerMeter] = useState(false);
  const [aiCategories, setAiCategories] = useState<Record<string, string> | undefined>(undefined);
  const [job, setJob] = useState<ImportJobStatus | null>(null);

  const options: ImportOptions = {
    mapping,
    onExisting,
    pricesIncludeVat,
    warehouseId: warehouseId || undefined,
    taxValues,
    unitValues,
    lengthUnit,
    perMeter,
    aiCategories,
  };

  function reset() {
    setStep(1);
    setAnalysis(null);
    setMapping([]);
    setTaxValues({});
    setUnitValues({});
    setAiCategories(undefined);
    setJob(null);
  }

  return (
    <div className="flex max-w-6xl flex-col gap-5">
      <div>
        <Link href="/inventory" className="text-sm text-muted-foreground hover:underline">
          Inventario
        </Link>
        <h1 className="text-xl font-semibold">Importar artículos</h1>
      </div>

      <Stepper step={step} />

      {step === 1 && (
        <FileStep
          analysis={analysis}
          onAnalyzed={(a) => {
            setAnalysis(a);
            setMapping(a.columns.map((c) => c.suggested));
            // Unidad de los largos según los valores de ejemplo (el usuario la confirma).
            const lengths = a.columns
              .filter((c) => ['barLength', 'sheetWidth', 'sheetLength'].includes(c.suggested))
              .flatMap((c) => c.samples.map((v) => Number(v.replace(/\./g, '').replace(',', '.'))))
              .filter((v) => Number.isFinite(v));
            setLengthUnit(guessLengthUnit(lengths));
            setPerMeter(false);
            setTaxValues({});
            setUnitValues({});
            setAiCategories(undefined);
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
          pricesIncludeVat={pricesIncludeVat}
          setPricesIncludeVat={setPricesIncludeVat}
          warehouseId={warehouseId}
          setWarehouseId={setWarehouseId}
          lengthUnit={lengthUnit}
          setLengthUnit={setLengthUnit}
          perMeter={perMeter}
          setPerMeter={setPerMeter}
          onBack={() => setStep(1)}
          onNext={() => setStep(3)}
        />
      )}
      {step === 3 && analysis && (
        <ReviewStep
          importId={analysis.importId}
          options={options}
          setTaxValue={(raw, id) => setTaxValues({ ...taxValues, [raw]: id })}
          setUnitValue={(raw, unit) => setUnitValues({ ...unitValues, [raw]: unit })}
          setAiCategories={setAiCategories}
          onBack={() => setStep(2)}
          onStarted={(status) => {
            setJob(status);
            setStep(4);
          }}
        />
      )}
      {step === 4 && job && <ImportStep job={job} setJob={setJob} onReset={reset} />}
    </div>
  );
}

function FileStep({
  analysis,
  onAnalyzed,
  onReset,
  onNext,
}: {
  analysis: ImportAnalysis | null;
  onAnalyzed: (a: ImportAnalysis) => void;
  onReset: () => void;
  onNext: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const upload = useMutation({ mutationFn: articleImportApi.analyze, onSuccess: onAnalyzed });

  function pick(file: File | undefined) {
    if (file) upload.mutate(file);
  }

  return (
    <>
      <section className="flex flex-col gap-4 rounded-xl border bg-card p-5">
        <div>
          <h2 className="font-semibold">Subí tu lista de artículos</h2>
          <p className="text-sm text-muted-foreground">
            Excel (.xlsx) o CSV, tal como la tenés: exportada de tu sistema anterior o tu propia planilla. No hace falta pasarla a
            ningún formato.
          </p>
        </div>

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
              <Fact label="Filas con artículos" value={formatInt(analysis.rowCount)} />
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
            <span className="text-sm text-muted-foreground">o hacé clic para elegirlo · hasta 20.000 artículos</span>
            <input
              id="import-file"
              type="file"
              accept=".xlsx,.csv,.txt"
              className="hidden"
              onChange={(e) => pick(e.target.files?.[0])}
            />
          </label>
        )}
        {upload.isError && <p className="text-sm text-destructive">{errorMessage(upload.error, 'No se pudo leer el archivo')}</p>}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border p-4">
            <p className="text-sm font-semibold">¿Arrancás de cero?</p>
            <p className="text-sm text-muted-foreground">Bajá la planilla modelo, con un ejemplo y la explicación de cada columna.</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => void articleImportApi.downloadTemplate()}>
              Descargar planilla modelo
            </Button>
          </div>
          <div className="rounded-xl border p-4">
            <p className="text-sm font-semibold">¿Querés actualizar precios?</p>
            <p className="text-sm text-muted-foreground">Exportá tus artículos, cambiá los precios en Excel y volvé a subir el archivo acá.</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => void articleImportApi.exportArticles()}>
              Exportar mis artículos
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
  analysis: ImportAnalysis;
  mapping: ImportFieldOrSkip[];
  setMapping: (m: ImportFieldOrSkip[]) => void;
  onExisting: 'update' | 'skip';
  setOnExisting: (v: 'update' | 'skip') => void;
  pricesIncludeVat: boolean;
  setPricesIncludeVat: (v: boolean) => void;
  warehouseId: string;
  setWarehouseId: (v: string) => void;
  lengthUnit: LengthUnit;
  setLengthUnit: (v: LengthUnit) => void;
  perMeter: boolean;
  setPerMeter: (v: boolean) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const { analysis, mapping, setMapping } = props;
  const { data: warehouses } = useQuery({ queryKey: ['warehouses'], queryFn: inventoryApi.listWarehouses });
  const recognized = analysis.columns.filter((c) => c.suggested !== 'skip').length;
  const missing = REQUIRED.filter((f) => !mapping.includes(f));
  const usesStock = mapping.includes('stock');
  const usesBars = mapping.includes('barLength');
  const usesLengths = usesBars || mapping.includes('sheetWidth') || mapping.includes('sheetLength');

  useEffect(() => {
    if (!props.warehouseId && warehouses?.length) props.setWarehouseId(warehouses[0].id);
  }, [warehouses, props]);

  function change(index: number, value: ImportFieldOrSkip) {
    // Un campo va en una sola columna: si ya estaba en otra, esa queda sin usar.
    setMapping(mapping.map((m, i) => (i === index ? value : value !== 'skip' && m === value ? 'skip' : m)));
  }

  return (
    <>
      <section className="flex flex-col gap-3 rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="font-semibold">¿Qué es cada columna?</h2>
            <p className="text-sm text-muted-foreground">
              Oplex reconoció {recognized} de {analysis.columns.length} columnas por su nombre. Revisá y cambiá lo que haga falta.
            </p>
          </div>
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
                      onChange={(e) => change(column.index, e.target.value as ImportFieldOrSkip)}
                      className={`h-8 min-w-48 rounded-md border bg-card px-2 text-sm ${
                        mapping[column.index] === 'skip' ? 'text-muted-foreground' : ''
                      }`}
                    >
                      {IMPORT_FIELD_OPTIONS.map((o) => (
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
        {missing.length > 0 && (
          <p className="text-sm text-destructive">
            Falta indicar qué columna es {missing.map((m) => IMPORT_FIELD_OPTIONS.find((o) => o.value === m)?.label.replace(' *', '')).join(', ')}.
          </p>
        )}
      </section>

      <section className="grid gap-4 rounded-xl border bg-card p-5 sm:grid-cols-3">
        <Choice
          label="Si el código ya existe en Oplex"
          hint="Se actualizan precio, nombre, categoría y marca. El stock no se pisa."
          value={props.onExisting}
          onChange={(v) => props.setOnExisting(v as 'update' | 'skip')}
          options={[
            ['update', 'Actualizarlo'],
            ['skip', 'Dejarlo como está'],
          ]}
        />
        <Choice
          label="Los precios de venta del archivo"
          hint="Si incluyen IVA, se guardan netos según la alícuota de cada artículo."
          value={props.pricesIncludeVat ? 'yes' : 'no'}
          onChange={(v) => props.setPricesIncludeVat(v === 'yes')}
          options={[
            ['no', 'Son sin IVA'],
            ['yes', 'Incluyen IVA'],
          ]}
        />
        <label className="flex flex-col gap-1.5 text-sm" htmlFor="import-warehouse">
          <span className="font-semibold">Depósito para el stock</span>
          <select
            id="import-warehouse"
            value={props.warehouseId}
            onChange={(e) => props.setWarehouseId(e.target.value)}
            disabled={!usesStock || !warehouses?.length}
            className="h-9 rounded-md border bg-card px-2 disabled:opacity-50"
          >
            {(warehouses ?? []).map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
          <span className="text-xs text-muted-foreground">
            {!usesStock
              ? 'El archivo no trae stock.'
              : warehouses && warehouses.length === 0
                ? 'Todavía no tenés depósitos: se va a crear "Depósito principal".'
                : 'El stock entra como stock inicial con el costo de cada artículo.'}
          </span>
        </label>
      </section>

      {usesLengths && (
        <section className="grid gap-4 rounded-xl border bg-card p-5 sm:grid-cols-3">
          <Choice
            label="Los largos y anchos del archivo están en"
            hint="Lo sugerimos según los valores: revisalo."
            value={props.lengthUnit}
            onChange={(v) => props.setLengthUnit(v as LengthUnit)}
            options={[
              ['m', 'Metros'],
              ['cm', 'Centímetros'],
              ['mm', 'Milímetros'],
            ]}
          />
          {usesBars && (
            <Choice
              label="En las barras, el precio y la existencia son"
              hint={
                props.perMeter
                  ? 'Oplex los pasa a barras enteras: precio × largo y existencia ÷ largo.'
                  : 'Según el largo comercial de cada artículo: acero 6 m a $45.000, plástico 2 m, etc.'
              }
              value={props.perMeter ? 'm' : 'bar'}
              onChange={(v) => props.setPerMeter(v === 'm')}
              options={[
                ['bar', 'Por barra entera'],
                ['m', 'Por metro'],
              ]}
            />
          )}
          <p className="text-xs text-muted-foreground sm:self-center">
            Los artículos con largo quedan como barras (con piezas y recortes en Producción); con ancho y largo, como planchas.
          </p>
        </section>
      )}

      <div className="flex justify-between">
        <Button variant="outline" onClick={props.onBack}>
          Volver
        </Button>
        <Button onClick={props.onNext} disabled={missing.length > 0}>
          Revisar {formatInt(analysis.rowCount)} artículos
        </Button>
      </div>
    </>
  );
}

function ReviewStep({
  importId,
  options,
  setTaxValue,
  setUnitValue,
  setAiCategories,
  onBack,
  onStarted,
}: {
  importId: string;
  options: ImportOptions;
  setTaxValue: (raw: string, id: string) => void;
  setUnitValue: (raw: string, unit: UnitValue) => void;
  setAiCategories: (categories: Record<string, string> | undefined) => void;
  onBack: () => void;
  onStarted: (status: ImportJobStatus) => void;
}) {
  const [filter, setFilter] = useState<RowStatus | 'all'>('all');
  const optionsKey = useMemo(() => JSON.stringify(options), [options]);
  const { data: preview, isLoading, isError, error } = useQuery({
    queryKey: ['import-preview', importId, optionsKey],
    queryFn: () => articleImportApi.preview(importId, options),
    placeholderData: (prev) => prev,
  });
  const start = useMutation({ mutationFn: () => articleImportApi.start(importId, options), onSuccess: onStarted });

  if (isError) return <p className="text-sm text-destructive">{errorMessage(error, 'No se pudo revisar el archivo')}</p>;
  if (isLoading || !preview) return <p className="text-sm text-muted-foreground">Revisando el archivo...</p>;

  const { counts } = preview;
  const toImport = counts.new + counts.update;
  const rows = preview.rows.filter((r) => filter === 'all' || r.status === filter);
  const unresolvedValues =
    preview.taxValues.filter((v) => !v.resolved).length + preview.unitValues.filter((v) => !v.resolved).length;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile tone="ok" count={counts.new} label="artículos nuevos" active={filter === 'new'} onClick={() => setFilter('new')} />
        <Tile tone="info" count={counts.update} label="ya existen y se actualizan" active={filter === 'update'} onClick={() => setFilter('update')} />
        <Tile tone="bad" count={counts.error} label="con errores, no se importan" active={filter === 'error'} onClick={() => setFilter('error')} />
        <Tile
          tone="muted"
          count={counts.new + counts.update + counts.error + counts.skip}
          label={counts.skip ? `ver todos (${formatInt(counts.skip)} se dejan como están)` : 'ver todos'}
          active={filter === 'all'}
          onClick={() => setFilter('all')}
        />
      </div>

      {(preview.taxValues.length > 0 || preview.unitValues.length > 0) && (
        <section className="flex flex-col gap-3 rounded-xl border bg-card p-5">
          <div>
            <h2 className="font-semibold">Valores a confirmar</h2>
            <p className="text-sm text-muted-foreground">
              Oplex interpretó estos valores del archivo.{' '}
              {unresolvedValues > 0 ? `Elegí los ${unresolvedValues} que no reconoció; ` : ''}lo que cambies se aplica a todas las filas.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {preview.taxValues.map((v) => (
              <ValueRow
                key={`tax-${v.raw}`}
                label={`IVA "${v.raw}"`}
                count={v.count}
                value={v.resolved ?? ''}
                options={[...preview.taxOptions.map((o) => ({ value: o.id, label: o.label })), { value: NO_TAX, label: 'Dejar sin IVA' }]}
                onChange={(id) => setTaxValue(v.raw, id)}
              />
            ))}
            {preview.unitValues.map((v) => (
              <ValueRow
                key={`unit-${v.raw}`}
                label={`Unidad "${v.raw || '(vacía)'}"`}
                count={v.count}
                value={v.resolved ?? ''}
                options={UNIT_OPTIONS}
                onChange={(unit) => setUnitValue(v.raw, unit as UnitValue)}
              />
            ))}
          </div>
          {preview.taxValues.length > 0 && preview.taxOptions.length === 0 && (
            <p className="text-sm text-amber-700 dark:text-amber-400">
              Tu empresa todavía no tiene alícuotas de IVA cargadas. Podés importar los artículos sin IVA y asignarlo después, o
              cargarlas primero en{' '}
              <Link href="/taxes" className="underline">
                Impuestos
              </Link>
              .
            </p>
          )}
          {(preview.newCategories.length > 0 || preview.newSuppliers.length > 0) && (
            <p className="text-sm text-muted-foreground">
              {preview.newCategories.length > 0 && (
                <>
                  Se van a crear <b>{preview.newCategories.length} categorías</b> nuevas ({preview.newCategories.slice(0, 4).join(', ')}
                  {preview.newCategories.length > 4 ? '…' : ''}).{' '}
                </>
              )}
              {preview.newSuppliers.length > 0 && (
                <>
                  Se van a crear <b>{preview.newSuppliers.length} proveedores</b> nuevos
                  {preview.existingSuppliers > 0 ? `; los otros ${preview.existingSuppliers} ya estaban en Oplex` : ''}.
                </>
              )}
            </p>
          )}
        </section>
      )}

      <AiCategoriesSection
        importId={importId}
        options={options}
        uncategorized={preview.uncategorizedNew}
        setAiCategories={setAiCategories}
      />

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <th className="px-3 py-2 font-semibold">Fila</th>
              <th className="px-3 py-2 font-semibold">Código</th>
              <th className="px-3 py-2 font-semibold">Nombre</th>
              <th className="px-3 py-2 font-semibold">Categoría</th>
              <th className="px-3 py-2 text-right font-semibold">Precio</th>
              <th className="px-3 py-2 font-semibold">Estado</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.rowNumber} className="border-b last:border-0">
                <td className="px-3 py-2 text-muted-foreground tabular-nums">{r.rowNumber}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.sku || '—'}</td>
                <td className="px-3 py-2">
                  {r.name || '—'}
                  {r.messages.map((m) => (
                    <div key={m} className="text-xs text-destructive">
                      {m}
                    </div>
                  ))}
                  {r.warnings.map((w) => (
                    <div key={w} className="text-xs text-muted-foreground">
                      {w}
                    </div>
                  ))}
                </td>
                <td className="px-3 py-2">
                  {r.category ?? '—'}
                  {r.categoryFromAi && (
                    <span className="ml-1.5 rounded bg-violet-100 px-1 py-0.5 text-[10px] font-semibold text-violet-700 dark:bg-violet-950 dark:text-violet-300">
                      IA
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.status === 'update' && r.oldPrice !== null && r.price !== r.oldPrice && (
                    <span className="mr-1 text-muted-foreground line-through">{formatMoney(r.oldPrice)}</span>
                  )}
                  {formatMoney(r.price)}
                </td>
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
            <Button variant="outline" onClick={() => void articleImportApi.downloadErrors(importId, options)}>
              Descargar errores en Excel
            </Button>
          )}
          <Button onClick={() => start.mutate()} disabled={toImport === 0 || start.isPending}>
            {start.isPending ? 'Empezando...' : `Importar ${formatInt(toImport)} artículos`}
          </Button>
        </div>
      </div>
    </>
  );
}

/** Sugerir categorías con IA para los artículos nuevos que vienen sin
 * categoría. Nada se guarda hasta que el usuario las acepta e importa. */
function AiCategoriesSection({
  importId,
  options,
  uncategorized,
  setAiCategories,
}: {
  importId: string;
  options: ImportOptions;
  uncategorized: number;
  setAiCategories: (categories: Record<string, string> | undefined) => void;
}) {
  const suggest = useMutation({ mutationFn: () => articleImportApi.suggestCategories(importId, options) });
  const accepted = options.aiCategories ? Object.keys(options.aiCategories).length : 0;

  if (accepted > 0) {
    return (
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-violet-200 bg-violet-50/60 p-4 text-sm dark:border-violet-900 dark:bg-violet-950/30">
        <span>
          Se usan las categorías sugeridas con IA en <b>{formatInt(accepted)} artículos</b> (marcadas con IA en la tabla).
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setAiCategories(undefined);
            suggest.reset();
          }}
        >
          Quitar sugerencias
        </Button>
      </section>
    );
  }
  if (uncategorized === 0) return null;

  const result = suggest.data;
  return (
    <section className="flex flex-col gap-3 rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">{formatInt(uncategorized)} artículos nuevos vienen sin categoría</h2>
          <p className="text-sm text-muted-foreground">
            La IA puede proponer categorías según el nombre, reusando las que ya tenés. Las revisás antes de importar.
          </p>
        </div>
        {!result && (
          <Button variant="outline" onClick={() => suggest.mutate()} disabled={suggest.isPending}>
            {suggest.isPending ? 'Pensando categorías...' : '✨ Sugerir categorías con IA'}
          </Button>
        )}
      </div>
      {suggest.isError && <p className="text-sm text-destructive">{errorMessage(suggest.error, 'No se pudieron sugerir categorías')}</p>}
      {result && (
        <>
          <div className="flex flex-wrap gap-2">
            {result.summary.map((s) => (
              <span key={s.category} className="rounded-full border px-2.5 py-1 text-sm">
                {s.category} <span className="text-muted-foreground">· {formatInt(s.count)}</span>
                {s.isNew && <span className="ml-1 text-xs text-violet-700 dark:text-violet-300">nueva</span>}
              </span>
            ))}
          </div>
          {result.leftOut > 0 && (
            <p className="text-xs text-muted-foreground">
              {formatInt(result.leftOut)} artículos quedaron afuera por el límite de una sola vez; se importan sin categoría.
            </p>
          )}
          <div className="flex gap-2">
            <Button onClick={() => setAiCategories(result.categories)} disabled={result.summary.length === 0}>
              Usar estas categorías
            </Button>
            <Button variant="outline" onClick={() => suggest.reset()}>
              Descartar
            </Button>
          </div>
        </>
      )}
    </section>
  );
}

function ImportStep({
  job,
  setJob,
  onReset,
}: {
  job: ImportJobStatus;
  setJob: (s: ImportJobStatus) => void;
  onReset: () => void;
}) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (job.state !== 'running') {
      void queryClient.invalidateQueries({ queryKey: ['inventory-articles'] });
      return;
    }
    const timer = setInterval(() => {
      articleImportApi.status(job.importId).then(setJob).catch(() => undefined);
    }, 1000);
    return () => clearInterval(timer);
  }, [job.state, job.importId, setJob, queryClient]);

  const percent = job.total ? Math.round((job.processed / job.total) * 100) : 100;

  if (job.state === 'running') {
    return (
      <section className="flex flex-col gap-3 rounded-xl border bg-card p-5">
        <h2 className="font-semibold">Importando…</h2>
        <div className="h-2.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary transition-all" style={{ width: `${percent}%` }} />
        </div>
        <p className="text-sm text-muted-foreground tabular-nums">
          {formatInt(job.processed)} de {formatInt(job.total)} artículos · podés seguir usando Oplex mientras termina
        </p>
      </section>
    );
  }

  return (
    <section className="flex flex-col items-center gap-3 rounded-xl border bg-card p-8 text-center">
      <span
        className={`grid h-12 w-12 place-items-center rounded-full text-2xl font-bold ${
          job.state === 'done' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' : 'bg-amber-100 text-amber-700'
        }`}
      >
        {job.state === 'done' ? '✓' : '!'}
      </span>
      <h2 className="font-semibold">{job.state === 'done' ? 'Listo: tus artículos ya están en Oplex' : 'La importación se cortó'}</h2>
      {job.error && <p className="max-w-lg text-sm text-muted-foreground">{job.error}</p>}
      <p className="text-sm text-muted-foreground tabular-nums">
        <b>{formatInt(job.created)}</b> creados · <b>{formatInt(job.updated)}</b> actualizados · <b>{formatInt(job.failed)}</b> sin importar
        {job.skipped ? ` · ${formatInt(job.skipped)} se dejaron como estaban` : ''}
        {job.newCategories ? ` · ${job.newCategories} categorías nuevas` : ''}
        {job.newSuppliers ? ` · ${job.newSuppliers} proveedores nuevos` : ''}
        {job.photosSaved ? ` · ${formatInt(job.photosSaved)} fotos` : ''}
        {job.photosFailed ? ` · ${formatInt(job.photosFailed)} fotos no se pudieron bajar (están en el Excel de errores)` : ''}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Link href="/inventory">
          <Button>Ver artículos</Button>
        </Link>
        <Button variant="ghost" onClick={onReset}>
          Importar otro archivo
        </Button>
      </div>
    </section>
  );
}

const STATUS_LABELS: Record<RowStatus, string> = {
  new: 'Nuevo',
  update: 'Se actualiza',
  skip: 'Queda como está',
  error: 'Con error',
};
