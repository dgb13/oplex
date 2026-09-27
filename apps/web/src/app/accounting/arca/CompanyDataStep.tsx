'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Select from '@/components/ui/Select';
import { companiesApi, type AfipPadronData } from '@/lib/companies';
import { formatCuitInput } from '@/lib/cuit';
import {
  constanciaApi,
  tenantInfoApi,
  tenantSettingsApi,
  type ConstanciaReading,
  type GrossIncomeType,
  type TenantSettings,
  type TenantTaxCondition,
} from '@/lib/tenantSettings';
import { useMutation } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useRef, useState } from 'react';
import { Badge, lookupError, SourceBadge, ValueBox, type Source } from '@/components/arca/ArcaFields';

const TAX_CONDITION_LABELS: Record<TenantTaxCondition, string> = {
  RESPONSABLE_INSCRIPTO: 'Responsable Inscripto',
  MONOTRIBUTO: 'Monotributo',
  EXENTO: 'Exento',
};

const GROSS_INCOME_LABELS: Record<GrossIncomeType, string> = {
  SIMPLIFICADO: 'Régimen Simplificado',
  LOCAL: 'Número local',
  CONVENIO_MULTILATERAL: 'Convenio Multilateral',
  EXENTO: 'Exento',
  NO_INSCRIPTO: 'No inscripto',
};

type LookupState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok' }
  | { kind: 'error'; message: string };

type FieldKey = 'legalName' | 'fiscalAddress' | 'condition';

function apiError(err: unknown, fallback: string): string {
  const message = (err as AxiosError<{ message?: string | string[] }>)?.response?.data?.message;
  return Array.isArray(message) ? message.join(', ') : (message ?? fallback);
}

const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

/** Los textos de la constancia y del padrón no vienen con el mismo formato
 * ("PISO 2" vs "Piso:2", con/sin CP) - se comparan por palabras. */
function sameText(a: string, b: string): boolean {
  const ta = normalize(a);
  const tb = new Set(normalize(b));
  if (ta.length === 0 || tb.size === 0) return false;
  const common = ta.filter((t) => tb.has(t)).length;
  return common / Math.min(ta.length, tb.size) >= 0.7;
}

function formatMonth(month: string): string {
  const [y, m] = month.split('-');
  return `${m}/${y}`;
}

function formatDay(date: string): string {
  const [y, m, d] = date.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

const CONDITION_HINT: Record<TenantTaxCondition, { title: string; items: string[] }> = {
  MONOTRIBUTO: {
    title: 'Monotributo: emitís siempre Factura C.',
    items: [
      'Sin IVA discriminado: el comprobante muestra Subtotal y Total.',
      'Ingresos Brutos suele estar incluido en el Régimen Simplificado de tu provincia.',
    ],
  },
  RESPONSABLE_INSCRIPTO: {
    title: 'Responsable Inscripto: Factura A o B según el cliente.',
    items: ['A a otro Responsable Inscripto (IVA discriminado), B al resto.'],
  },
  EXENTO: {
    title: 'Exento: emitís Factura C.',
    items: ['Sin IVA discriminado.'],
  },
};

export function CompanyDataStep({ settings, onSaved }: { settings: TenantSettings; onSaved: () => void }) {
  const [taxId, setTaxId] = useState(settings.tenantTaxId ? formatCuitInput(settings.tenantTaxId) : '');
  const [lookup, setLookup] = useState<LookupState>({ kind: 'idle' });
  const [padron, setPadron] = useState<AfipPadronData | null>(null);

  const [legalName, setLegalName] = useState(settings.tenantName ?? '');
  const [fiscalAddress, setFiscalAddress] = useState(settings.fiscalAddress ?? '');
  const [condition, setCondition] = useState<TenantTaxCondition | ''>(settings.ownTaxCondition ?? '');
  // Datos cargados antes de que existiera el tipo: se deduce del detalle.
  const [grossIncomeType, setGrossIncomeType] = useState<GrossIncomeType | ''>(
    settings.grossIncomeType ??
      (/simplificado/i.test(settings.grossIncomeNumber ?? '')
        ? 'SIMPLIFICADO'
        : /convenio/i.test(settings.grossIncomeNumber ?? '')
          ? 'CONVENIO_MULTILATERAL'
          : ''),
  );
  const [grossIncomeDetail, setGrossIncomeDetail] = useState(settings.grossIncomeNumber ?? '');
  const [activityStart, setActivityStart] = useState(settings.activityStartDate?.slice(0, 10) ?? '');

  const [sources, setSources] = useState<Partial<Record<FieldKey | 'activityStart' | 'grossIncome', Source>>>({});
  const [editing, setEditing] = useState<Set<FieldKey>>(() => {
    // Sin datos guardados todavía, los campos quedan a la espera del CUIT;
    // si ya había algo cargado a mano, se muestra como valor con "corregir".
    return new Set();
  });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const lastLookup = useRef<string>('');

  const touch = () => setSaved(false);
  const edit = (key: FieldKey) => {
    setEditing((prev) => new Set(prev).add(key));
    setSources((prev) => ({ ...prev, [key]: prev[key] ? 'edited' : prev[key] }));
    touch();
  };

  async function runLookup(cuit: string) {
    lastLookup.current = cuit;
    setLookup({ kind: 'loading' });
    try {
      const data = await companiesApi.lookupAfip(cuit);
      if (lastLookup.current !== cuit) return;
      setPadron(data);
      setLookup({ kind: 'ok' });
      setLegalName(data.name);
      const next: typeof sources = { legalName: 'arca' };
      if (data.fiscalAddress) {
        setFiscalAddress(data.fiscalAddress);
        next.fiscalAddress = 'arca';
      }
      if (data.ivaCondition) {
        setCondition(data.ivaCondition);
        next.condition = 'arca';
      }
      if (data.activityStartMonth && activityStart.slice(0, 7) !== data.activityStartMonth) {
        setActivityStart(`${data.activityStartMonth}-01`);
        next.activityStart = 'arcaMonth';
      } else if (data.activityStartMonth) {
        next.activityStart = 'arcaMonth';
      }
      setSources((prev) => ({ ...prev, ...next }));
      setEditing(new Set(data.ivaCondition ? [] : (['condition'] as FieldKey[])));
    } catch (err) {
      if (lastLookup.current !== cuit) return;
      setPadron(null);
      setLookup({ kind: 'error', message: lookupError(err) });
      // Sin ARCA, todo se carga a mano.
      setEditing(new Set<FieldKey>(['legalName', 'fiscalAddress', 'condition']));
    }
  }

  function onCuitChange(value: string) {
    const formatted = formatCuitInput(value);
    setTaxId(formatted);
    touch();
    const digits = formatted.replace(/\D/g, '');
    if (digits.length === 11) {
      if (digits !== lastLookup.current) void runLookup(digits);
    } else {
      lastLookup.current = '';
      setLookup({ kind: 'idle' });
    }
  }

  const save = useMutation({
    mutationFn: async () => {
      const info: { taxId?: string; legalName?: string } = {};
      if (taxId.trim() && taxId.replace(/\D/g, '') !== (settings.tenantTaxId ?? '').replace(/\D/g, '')) info.taxId = taxId;
      if (legalName.trim() && legalName.trim() !== settings.tenantName) info.legalName = legalName.trim();
      if (info.taxId || info.legalName) await tenantInfoApi.update(info);
      await tenantSettingsApi.update({
        ...(condition ? { ownTaxCondition: condition } : {}),
        fiscalAddress: fiscalAddress.trim() || null,
        grossIncomeType: grossIncomeType || null,
        grossIncomeNumber: grossIncomeDetail.trim() || null,
        activityStartDate: activityStart || null,
      });
    },
    onSuccess: () => {
      setError('');
      setSaved(true);
      onSaved();
    },
    onError: (err) => setError(apiError(err, 'No se pudo guardar')),
  });

  const hasCuit = taxId.replace(/\D/g, '').length === 11;
  const personType = padron ? (padron.personType === 'JURIDICA' ? 'Persona jurídica' : 'Persona humana') : null;
  const inicioHelp =
    sources.activityStart === 'constancia'
      ? 'Confirmado con la constancia.'
      : sources.activityStart === 'arcaMonth'
        ? 'ARCA informa sólo mes y año: confirmá el día.'
        : 'Figura en tu constancia de inscripción.';

  return (
    <>
      {/* CUIT primero: lo único que el usuario tiene que escribir. */}
      <div className="flex flex-col gap-2 rounded-[14px] border-[1.5px] border-primary bg-primary/10 px-4 py-3.5">
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="company-cuit" className="text-sm font-semibold">
            CUIT de tu empresa
          </label>
          <Input
            id="company-cuit"
            className="h-auto w-[220px] bg-card px-3 py-2 font-mono text-xl tracking-[.04em] md:text-xl"
            value={taxId}
            maxLength={13}
            onChange={(e) => onCuitChange(e.target.value)}
            placeholder="20-12345678-9"
          />
          <LookupStatus state={lookup} />
          {hasCuit && lookup.kind !== 'loading' && (
            <button
              type="button"
              className="text-xs text-muted-foreground underline-offset-2 hover:text-primary hover:underline"
              onClick={() => void runLookup(taxId.replace(/\D/g, ''))}
            >
              {lookup.kind === 'idle' ? 'Traer datos de ARCA' : 'Volver a consultar'}
            </button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Escribilo y listo: traemos razón social, domicilio y condición frente al IVA directamente de ARCA. Así se evitan errores
          de tipeo.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3.5 md:grid-cols-6">
        <Field className="md:col-span-4" label="Razón social" source={sources.legalName}>
          <ValueBox
            value={legalName}
            editing={editing.has('legalName')}
            onEdit={() => edit('legalName')}
            onChange={(v) => {
              setLegalName(v);
              touch();
            }}
            placeholder="Como figura en ARCA"
          />
        </Field>
        <Field className="md:col-span-2" label="Tipo">
          <ValueBox value={personType ?? ''} emptyText="—" readOnly />
        </Field>
        <Field className="md:col-span-6" label="Domicilio fiscal" source={sources.fiscalAddress}>
          <ValueBox
            value={fiscalAddress}
            editing={editing.has('fiscalAddress')}
            onEdit={() => edit('fiscalAddress')}
            onChange={(v) => {
              setFiscalAddress(v);
              touch();
            }}
            placeholder="Calle 123, Localidad, Provincia"
          />
        </Field>
        <Field className="md:col-span-3" label="Condición frente al IVA" source={sources.condition}>
          {editing.has('condition') ? (
            <Select
              value={condition}
              onChange={(v) => {
                setCondition(v as TenantTaxCondition);
                touch();
              }}
              placeholder="Elegir..."
              options={(Object.keys(TAX_CONDITION_LABELS) as TenantTaxCondition[]).map((value) => ({
                value,
                label: TAX_CONDITION_LABELS[value],
              }))}
            />
          ) : (
            <ValueBox
              value={condition ? (sources.condition === 'arca' && padron?.taxCondition ? padron.taxCondition : TAX_CONDITION_LABELS[condition]) : ''}
              onEdit={() => edit('condition')}
            />
          )}
        </Field>
        <Field className="md:col-span-3" label="Actividad principal" source={padron?.mainActivity ? 'arca' : null}>
          <ValueBox value={padron?.mainActivity ?? ''} emptyText="—" readOnly />
        </Field>

        {condition && (
          <div className="rounded-xl bg-primary/10 px-3.5 py-3 text-[13px] md:col-span-6">
            <b className="text-primary">{CONDITION_HINT[condition].title}</b>
            <ul className="mt-1 list-disc pl-[18px]">
              {CONDITION_HINT[condition].items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        )}

        <Field
          className="md:col-span-3"
          label="Ingresos Brutos"
          extraBadge={<Badge tone="hand">a mano</Badge>}
          source={sources.grossIncome}
          help="ARCA no informa Ingresos Brutos (es provincial). La constancia de abajo puede traerlo."
        >
          <div className="flex flex-wrap gap-2">
            <Select
              className="w-[190px] shrink-0"
              value={grossIncomeType}
              onChange={(v) => {
                setGrossIncomeType(v as GrossIncomeType);
                touch();
              }}
              placeholder="Elegir..."
              options={(Object.keys(GROSS_INCOME_LABELS) as GrossIncomeType[]).map((value) => ({
                value,
                label: GROSS_INCOME_LABELS[value],
              }))}
            />
            <Input
              className="min-w-[140px] flex-1"
              value={grossIncomeDetail}
              onChange={(e) => {
                setGrossIncomeDetail(e.target.value);
                touch();
              }}
              placeholder="Detalle (sale en la factura)"
            />
          </div>
        </Field>
        <Field className="md:col-span-3" label="Inicio de actividades" source={sources.activityStart} help={inicioHelp}>
          <Input
            type="date"
            value={activityStart}
            onChange={(e) => {
              setActivityStart(e.target.value);
              touch();
            }}
          />
        </Field>
      </div>

      <ConstanciaVerify
        cuit={taxId.replace(/\D/g, '')}
        padron={padron}
        current={{ legalName, fiscalAddress, condition }}
        onApply={(reading, fillMissing) => {
          const next: typeof sources = {};
          if (reading.activityStartDate) {
            setActivityStart(reading.activityStartDate.slice(0, 10));
            next.activityStart = 'constancia';
          }
          if (reading.grossIncomeType || reading.grossIncomeDetail) {
            if (reading.grossIncomeType) setGrossIncomeType(reading.grossIncomeType);
            if (reading.grossIncomeDetail) setGrossIncomeDetail(reading.grossIncomeDetail);
            next.grossIncome = 'constancia';
          }
          if (fillMissing) {
            if (!legalName.trim() && reading.name) {
              setLegalName(reading.name);
              next.legalName = 'constancia';
            }
            if (!fiscalAddress.trim() && reading.fiscalAddress) {
              setFiscalAddress(reading.fiscalAddress);
              next.fiscalAddress = 'constancia';
            }
            if (!condition && reading.ivaCondition) {
              setCondition(reading.ivaCondition);
              next.condition = 'constancia';
            }
          }
          setSources((prev) => ({ ...prev, ...next }));
          touch();
        }}
      />

      <div className="flex flex-wrap items-center gap-2.5">
        <Button type="button" onClick={() => save.mutate()} disabled={save.isPending || !hasCuit}>
          {save.isPending ? 'Guardando...' : 'Guardar datos'}
        </Button>
        {saved && <span className="text-[12.5px] font-semibold text-emerald-600 dark:text-emerald-400">✓ Guardado</span>}
        {error && <span className="text-sm text-destructive">{error}</span>}
      </div>
    </>
  );
}

function LookupStatus({ state }: { state: LookupState }) {
  if (state.kind === 'idle') return null;
  if (state.kind === 'loading') return <span className="text-[13px] text-muted-foreground">⟳ Consultando ARCA...</span>;
  if (state.kind === 'ok') return <span className="text-[13px] text-emerald-700 dark:text-emerald-400">✓ Encontrado en ARCA</span>;
  return <span className="text-[13px] text-destructive">✕ {state.message}</span>;
}

function Field({
  label,
  source,
  extraBadge,
  help,
  className,
  children,
}: {
  label: string;
  source?: Source;
  extraBadge?: React.ReactNode;
  help?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-[5px] ${className ?? ''}`}>
      <span className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-muted-foreground">
        {label} {extraBadge} <SourceBadge source={source} />
      </span>
      {children}
      {help && <p className="text-xs text-muted-foreground">{help}</p>}
    </div>
  );
}

type CompareStatus = 'match' | 'fill' | 'mismatch' | 'none';

function ConstanciaVerify({
  cuit,
  padron,
  current,
  onApply,
}: {
  cuit: string;
  padron: AfipPadronData | null;
  current: { legalName: string; fiscalAddress: string; condition: TenantTaxCondition | '' };
  onApply: (reading: ConstanciaReading, fillMissing: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [applied, setApplied] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const read = useMutation({
    mutationFn: (file: File) => constanciaApi.read(file),
    onMutate: () => setApplied(false),
  });

  const pick = (file: File | undefined) => {
    if (file) read.mutate(file);
  };

  const r = read.data;
  const rows: { label: string; padron: string; constancia: string; status: CompareStatus }[] = [];
  if (r?.isConstancia) {
    const cmp = (base: string, other: string | null, same: (a: string, b: string) => boolean): CompareStatus =>
      !other ? 'none' : !base ? 'fill' : same(base, other) ? 'match' : 'mismatch';
    const cuitFmt = (c: string) => (c.length === 11 ? formatCuitInput(c) : c);
    rows.push({
      label: 'CUIT',
      padron: cuitFmt(cuit),
      constancia: r.cuit ? cuitFmt(r.cuit) : '—',
      status: cmp(cuit, r.cuit, (a, b) => a === b),
    });
    rows.push({
      label: 'Razón social',
      padron: current.legalName || '—',
      constancia: r.name ?? '—',
      status: cmp(current.legalName, r.name, sameText),
    });
    rows.push({
      label: 'Condición IVA',
      padron: current.condition ? TAX_CONDITION_LABELS[current.condition] : '—',
      constancia: r.ivaCondition ? TAX_CONDITION_LABELS[r.ivaCondition] : '—',
      status: cmp(current.condition, r.ivaCondition, (a, b) => a === b),
    });
    rows.push({
      label: 'Domicilio fiscal',
      padron: current.fiscalAddress || '—',
      constancia: r.fiscalAddress ?? '—',
      status: cmp(current.fiscalAddress, r.fiscalAddress, sameText),
    });
    const month = padron?.activityStartMonth ?? null;
    rows.push({
      label: 'Inicio de actividades',
      padron: month ? `${formatMonth(month)} (sólo mes)` : '—',
      constancia: r.activityStartDate ? formatDay(r.activityStartDate) : '—',
      status: !r.activityStartDate ? 'none' : month && !r.activityStartDate.startsWith(month) ? 'mismatch' : 'fill',
    });
    const gross = r.grossIncomeDetail ?? (r.grossIncomeType ? GROSS_INCOME_LABELS[r.grossIncomeType] : null);
    rows.push({
      label: 'Ingresos Brutos',
      padron: '— (ARCA no lo informa)',
      constancia: gross ?? '—',
      status: gross ? 'fill' : 'none',
    });
  }
  const mismatches = rows.filter((row) => row.status === 'mismatch').length;
  const fillsBasics = rows.some((row) => row.status === 'fill' && ['Razón social', 'Condición IVA', 'Domicilio fiscal'].includes(row.label));
  const canApply = rows.some((row) => row.status === 'fill');

  return (
    <div className="flex flex-col gap-2.5 rounded-[14px] border-[1.5px] border-dashed border-violet-400/60 bg-violet-50/50 px-4 py-3.5 dark:border-violet-400/40 dark:bg-violet-950/25">
      <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold">
        ✦ Verificar con tu Constancia de Inscripción <Badge tone="ai">IA · recomendado</Badge> <Badge tone="hand">opcional</Badge>
      </h3>
      <p className="text-[13px] text-muted-foreground">
        Subí el PDF de la constancia (la descargás de ARCA → &quot;Constancia de inscripción&quot;). La IA la lee y compara cada dato
        con lo que devolvió el padrón. Si algo no coincide, te avisamos antes de guardar.
      </p>
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          pick(e.dataTransfer.files[0]);
        }}
        className={`flex cursor-pointer items-center gap-3 rounded-xl border-[1.5px] border-dashed bg-card px-3.5 py-3 transition hover:border-violet-500 ${
          dragOver ? 'border-violet-500' : ''
        }`}
      >
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-violet-100 text-lg text-violet-700 dark:bg-violet-950 dark:text-violet-300">
          ⬆
        </div>
        <div>
          <b className="text-sm">Subir constancia (PDF o foto)</b>
          <p className="text-xs text-muted-foreground">Arrastrala acá o hacé clic. No se guarda: sólo se usa para verificar.</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            pick(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>

      {read.isPending && <p className="text-xs text-muted-foreground">✦ Leyendo la constancia con IA...</p>}
      {read.isError && <p className="text-xs text-destructive">✕ {apiError(read.error, 'No se pudo leer la constancia.')}</p>}
      {r && !r.isConstancia && (
        <p className="text-xs text-destructive">✕ Ese archivo no parece una Constancia de Inscripción de ARCA.</p>
      )}
      {r?.isConstancia && (
        <>
          <div className="overflow-x-auto rounded-[10px] bg-card">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  {['Dato', 'Padrón ARCA', 'Constancia (IA)', ''].map((h) => (
                    <th
                      key={h}
                      className="border-b px-2.5 py-2 text-left text-[11px] font-semibold uppercase tracking-[.06em] text-muted-foreground"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.label} className="border-b last:border-b-0">
                    <td className="px-2.5 py-2 align-top">{row.label}</td>
                    <td className="px-2.5 py-2 align-top">{row.padron}</td>
                    <td className="px-2.5 py-2 align-top">{row.constancia}</td>
                    <td className="px-2.5 py-2 align-top">
                      {row.status === 'match' && <Badge tone="ok">✓ coincide</Badge>}
                      {row.status === 'fill' && <Badge tone="ai">completa</Badge>}
                      {row.status === 'mismatch' && <Badge tone="bad">≠ no coincide</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            {mismatches === 0 ? (
              <Badge tone="ok">✓ Datos verificados con la constancia</Badge>
            ) : (
              <Badge tone="warn">
                {mismatches === 1 ? 'Hay un dato que no coincide' : `Hay ${mismatches} datos que no coinciden`}: revisalo antes de guardar
              </Badge>
            )}
            {canApply && !applied && (
              <button
                type="button"
                onClick={() => {
                  onApply(r, fillsBasics);
                  setApplied(true);
                }}
                className="rounded-[10px] border border-violet-600 bg-violet-600 px-3.5 py-2 text-[13.5px] font-semibold text-white transition hover:bg-violet-700 dark:border-violet-500 dark:bg-violet-500"
              >
                {fillsBasics ? 'Completar con los datos de la constancia' : 'Usar inicio de actividades e Ingresos Brutos de la constancia'}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
