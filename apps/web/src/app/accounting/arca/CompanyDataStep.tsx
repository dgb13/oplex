'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Select from '@/components/ui/Select';
import { companiesApi, type AfipPadronData } from '@/lib/companies';
import { formatCuitInput } from '@/lib/cuit';
import {
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
import { lookupError, SourceBadge, ValueBox, type Source } from '@/components/arca/ArcaFields';
import { ConstanciaIntake } from './ConstanciaIntake';

const TAX_CONDITION_LABELS: Record<TenantTaxCondition, string> = {
  RESPONSABLE_INSCRIPTO: 'Responsable Inscripto',
  MONOTRIBUTO: 'Monotributo',
  EXENTO: 'Exento',
};

const LETTER_HINT: Record<TenantTaxCondition, string> = {
  MONOTRIBUTO: 'emitís Factura C',
  RESPONSABLE_INSCRIPTO: 'emitís Factura A o B',
  EXENTO: 'emitís Factura C',
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

type FieldKey = 'legalName' | 'fiscalAddress' | 'condition' | 'grossIncome' | 'activityStart';

/** constancia = subir la constancia (lo recomendado); review = datos leídos o
 * ya guardados, listos para revisar y guardar; cuit = plan B, sólo con el
 * CUIT y el padrón de ARCA. */
type Mode = 'constancia' | 'review' | 'cuit';

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
  const savedCuit = (settings.tenantTaxId ?? '').replace(/\D/g, '');
  const hasSavedData = Boolean(savedCuit && settings.ownTaxCondition);
  const [mode, setMode] = useState<Mode>(hasSavedData ? 'review' : 'constancia');

  const [taxId, setTaxId] = useState(settings.tenantTaxId ? formatCuitInput(settings.tenantTaxId) : '');
  const [lookup, setLookup] = useState<LookupState>({ kind: 'idle' });
  const [padron, setPadron] = useState<AfipPadronData | null>(null);

  const [legalName, setLegalName] = useState(settings.tenantName ?? '');
  const [fiscalAddress, setFiscalAddress] = useState(settings.fiscalAddress ?? '');
  const [condition, setCondition] = useState<TenantTaxCondition | ''>(settings.ownTaxCondition ?? '');
  const [category, setCategory] = useState<string | null>(null);
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

  const [sources, setSources] = useState<Partial<Record<FieldKey, Source>>>({});
  const [editing, setEditing] = useState<Set<FieldKey>>(() => new Set());
  // Constancia leída en esta visita + lo que no coincide con el padrón.
  const [constanciaFile, setConstanciaFile] = useState<string | null>(null);
  const [padronCheck, setPadronCheck] = useState<{ kind: 'pending' | 'done' | 'unavailable'; mismatches: string[] }>({
    kind: 'done',
    mismatches: [],
  });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  // Cambiar la condición frente al IVA cambia cómo se toman los costos (con
  // o sin IVA, ver vat-cost.ts) y los precios de venta: se confirma antes.
  const [confirmConditionChange, setConfirmConditionChange] = useState(false);
  const conditionChanged = !!settings.ownTaxCondition && !!condition && condition !== settings.ownTaxCondition;
  const lastLookup = useRef<string>('');

  const touch = () => setSaved(false);
  const edit = (key: FieldKey) => {
    setEditing((prev) => new Set(prev).add(key));
    setSources((prev) => ({ ...prev, [key]: prev[key] ? 'edited' : prev[key] }));
    touch();
  };

  /** Constancia leída: completa todo y la compara contra el padrón. Devuelve
   * un problema para mostrar si no se puede usar. */
  function applyReading(reading: ConstanciaReading, fileName: string): string | null {
    const readCuit = reading.cuit?.replace(/\D/g, '') ?? '';
    if (savedCuit && readCuit && readCuit !== savedCuit) {
      return `Esa constancia es del CUIT ${formatCuitInput(readCuit)} y tu empresa tiene el ${formatCuitInput(savedCuit)}. Sacá la de tu empresa.`;
    }
    const cuit = readCuit || savedCuit;
    if (!cuit) return 'No pudimos leer el CUIT de la constancia. Probá con otra foto o con el PDF.';

    setTaxId(formatCuitInput(cuit));
    const next: Partial<Record<FieldKey, Source>> = {};
    if (reading.name) {
      setLegalName(reading.name);
      next.legalName = 'constancia';
    }
    if (reading.fiscalAddress) {
      setFiscalAddress(reading.fiscalAddress);
      next.fiscalAddress = 'constancia';
    }
    if (reading.ivaCondition) {
      setCondition(reading.ivaCondition);
      next.condition = 'constancia';
    }
    setCategory(reading.monotributoCategory);
    if (reading.grossIncomeType || reading.grossIncomeDetail) {
      setGrossIncomeType(reading.grossIncomeType ?? '');
      setGrossIncomeDetail(reading.grossIncomeDetail ?? (reading.grossIncomeType ? GROSS_INCOME_LABELS[reading.grossIncomeType] : ''));
      next.grossIncome = 'constancia';
    }
    if (reading.activityStartDate) {
      setActivityStart(reading.activityStartDate.slice(0, 10));
      next.activityStart = 'constancia';
    }
    setSources(next);
    setEditing(new Set());
    setConstanciaFile(fileName);
    setMode('review');
    touch();
    void checkAgainstPadron(cuit, reading);
    return null;
  }

  async function checkAgainstPadron(cuit: string, reading: ConstanciaReading) {
    setPadronCheck({ kind: 'pending', mismatches: [] });
    try {
      const data = await companiesApi.lookupAfip(cuit);
      setPadron(data);
      const mismatches: string[] = [];
      if (reading.name && data.name && !sameText(reading.name, data.name)) mismatches.push(`razón social (padrón: ${data.name})`);
      if (reading.ivaCondition && data.ivaCondition && reading.ivaCondition !== data.ivaCondition) {
        mismatches.push(`condición frente al IVA (padrón: ${TAX_CONDITION_LABELS[data.ivaCondition]})`);
      }
      if (reading.fiscalAddress && data.fiscalAddress && !sameText(reading.fiscalAddress, data.fiscalAddress)) {
        mismatches.push(`domicilio fiscal (padrón: ${data.fiscalAddress})`);
      }
      setPadronCheck({ kind: 'done', mismatches });
    } catch {
      setPadronCheck({ kind: 'unavailable', mismatches: [] });
    }
  }

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
      if (taxId.trim() && taxId.replace(/\D/g, '') !== savedCuit) info.taxId = taxId;
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

  const saveBar = (extra?: React.ReactNode) => (
    <>
      <div className="flex flex-wrap items-center gap-2.5">
        <Button
          type="button"
          onClick={() => (conditionChanged ? setConfirmConditionChange(true) : save.mutate())}
          disabled={save.isPending || !hasCuit}
        >
          {save.isPending ? 'Guardando...' : 'Guardar datos'}
        </Button>
        {extra}
        {saved && <span className="text-[12.5px] font-semibold text-emerald-600 dark:text-emerald-400">✓ Guardado</span>}
        {error && <span className="text-sm text-destructive">{error}</span>}
      </div>
      {confirmConditionChange && conditionChanged && (
        <div role="alertdialog" className="flex flex-col gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          <b>
            ¿Cambiar de {settings.ownTaxCondition && TAX_CONDITION_LABELS[settings.ownTaxCondition]} a {TAX_CONDITION_LABELS[condition as TenantTaxCondition]}?
          </b>
          <p className="text-muted-foreground">
            {condition === 'RESPONSABLE_INSCRIPTO'
              ? 'Desde ahora los costos nuevos se toman sin IVA (lo vas a recuperar), tus precios de venta pasan a ser sin IVA y vas a facturar A o B.'
              : 'Desde ahora los costos nuevos se toman con IVA (no lo vas a recuperar), tus precios de venta pasan a ser finales y vas a facturar C.'}
          </p>
          <p className="text-muted-foreground">
            El stock que ya tenés conserva su costo: era el correcto cuando lo compraste. Las ventas y las ganancias de
            antes no cambian.
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setConfirmConditionChange(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => {
                setConfirmConditionChange(false);
                save.mutate();
              }}
            >
              Cambiar condición
            </Button>
          </div>
        </div>
      )}
    </>
  );

  if (mode === 'constancia') {
    return (
      <>
        <ConstanciaIntake cuit={savedCuit || null} onRead={applyReading} onUseCuit={() => setMode('cuit')} />
        {hasSavedData && (
          <button type="button" onClick={() => setMode('review')} className="w-max text-[13px] font-semibold text-primary underline underline-offset-2">
            Volver a los datos guardados
          </button>
        )}
      </>
    );
  }

  if (mode === 'review') {
    const conditionText = condition
      ? `${TAX_CONDITION_LABELS[condition]}${condition === 'MONOTRIBUTO' && category ? ` (categoría ${category})` : ''} · ${LETTER_HINT[condition]}`
      : '';
    // "Régimen Simplificado Mendoza" ya dice el tipo: no se repite delante.
    const typeLabel = grossIncomeType ? GROSS_INCOME_LABELS[grossIncomeType] : '';
    const detail = grossIncomeDetail.trim();
    const grossText =
      detail && typeLabel && !detail.toLowerCase().includes(typeLabel.toLowerCase()) ? `${typeLabel} · ${detail}` : detail || typeLabel;
    return (
      <>
        {constanciaFile ? (
          padronCheck.kind === 'done' && padronCheck.mismatches.length > 0 ? (
            <div className="flex gap-2.5 rounded-[10px] bg-amber-500/10 px-3 py-2.5 text-[13px] leading-snug text-amber-800 dark:text-amber-300">
              <span>!</span>
              <span>
                <b className="text-foreground">Leímos tu constancia</b> ({constanciaFile}), pero no coincide con el padrón de ARCA en:{' '}
                {padronCheck.mismatches.join('; ')}. Revisá esos datos antes de guardar.
              </span>
            </div>
          ) : (
            <div className="flex gap-2.5 rounded-[10px] bg-emerald-500/10 px-3 py-2.5 text-[13px] leading-snug text-emerald-700 dark:text-emerald-400">
              <span>✓</span>
              <span>
                <b className="text-foreground">Leímos tu constancia</b> ({constanciaFile}).{' '}
                {savedCuit ? 'El CUIT coincide con el de tu empresa' : 'Tomamos el CUIT de la constancia'}
                {padronCheck.kind === 'pending'
                  ? '; estamos comparando con el padrón de ARCA.'
                  : padronCheck.kind === 'unavailable'
                    ? '. El padrón de ARCA no respondió para comparar.'
                    : ' y los datos coinciden con el padrón de ARCA.'}{' '}
                Revisalos y guardá.
              </span>
            </div>
          )
        ) : (
          <p className="m-0 text-[13px] text-muted-foreground">
            Estos son los datos guardados de tu empresa. Si cambiaron (por ejemplo, de categoría o de domicilio), subí una constancia nueva.
          </p>
        )}

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <ReviewField label="CUIT" value={taxId} />
          <ReviewField
            label="Razón social"
            source={sources.legalName}
            value={legalName}
            editing={editing.has('legalName')}
            onEdit={() => edit('legalName')}
          >
            <Input
              value={legalName}
              autoFocus
              onChange={(e) => {
                setLegalName(e.target.value);
                touch();
              }}
            />
          </ReviewField>
          <ReviewField
            label="Condición frente al IVA"
            source={sources.condition}
            value={conditionText}
            editing={editing.has('condition')}
            onEdit={() => edit('condition')}
          >
            <Select
              value={condition}
              onChange={(v) => {
                setCondition(v as TenantTaxCondition);
                setCategory(null);
                touch();
              }}
              placeholder="Elegir..."
              options={(Object.keys(TAX_CONDITION_LABELS) as TenantTaxCondition[]).map((value) => ({ value, label: TAX_CONDITION_LABELS[value] }))}
            />
          </ReviewField>
          <ReviewField
            label="Domicilio fiscal"
            source={sources.fiscalAddress}
            value={fiscalAddress}
            editing={editing.has('fiscalAddress')}
            onEdit={() => edit('fiscalAddress')}
          >
            <Input
              value={fiscalAddress}
              autoFocus
              onChange={(e) => {
                setFiscalAddress(e.target.value);
                touch();
              }}
            />
          </ReviewField>
          <ReviewField
            label="Ingresos Brutos"
            source={sources.grossIncome}
            value={grossText}
            note={grossText ? 'Sale así en tus facturas.' : undefined}
            editing={editing.has('grossIncome')}
            onEdit={() => edit('grossIncome')}
          >
            <GrossIncomeInputs
              type={grossIncomeType}
              detail={grossIncomeDetail}
              onType={(v) => {
                setGrossIncomeType(v);
                touch();
              }}
              onDetail={(v) => {
                setGrossIncomeDetail(v);
                touch();
              }}
            />
          </ReviewField>
          <ReviewField
            label="Inicio de actividades"
            source={sources.activityStart}
            value={activityStart ? formatDay(activityStart) : ''}
            editing={editing.has('activityStart')}
            onEdit={() => edit('activityStart')}
          >
            <Input
              type="date"
              value={activityStart}
              onChange={(e) => {
                setActivityStart(e.target.value);
                touch();
              }}
            />
          </ReviewField>
        </div>

        {saveBar(
          <>
            <Button type="button" variant="outline" onClick={() => setMode('constancia')}>
              {constanciaFile ? 'Subir otra constancia' : 'Actualizar con una constancia'}
            </Button>
            <span className="text-xs text-muted-foreground">
              Si un dato de la constancia no coincide con el padrón de ARCA, lo marcamos acá antes de guardar.
            </span>
          </>,
        )}
      </>
    );
  }

  // Plan B: sólo con el CUIT (padrón de ARCA). Ingresos Brutos e inicio de
  // actividades no los informa el padrón: se completan acá.
  const personType = padron ? (padron.personType === 'JURIDICA' ? 'Persona jurídica' : 'Persona humana') : null;
  const inicioHelp =
    sources.activityStart === 'arcaMonth'
      ? 'ARCA no informa la fecha: es un mes estimado. Confirmala con tu constancia.'
      : 'Figura en tu constancia de inscripción.';

  return (
    <>
      <div className="text-[13px] text-muted-foreground">
        Cargando sólo con el CUIT.{' '}
        <button type="button" onClick={() => setMode('constancia')} className="font-semibold text-primary underline underline-offset-2">
          Prefiero subir la constancia
        </button>{' '}
        (completa también Ingresos Brutos e inicio de actividades).
      </div>
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
          source={sources.grossIncome}
          help="ARCA no lo informa con el CUIT (es provincial): figura en tu constancia."
        >
          <GrossIncomeInputs
            type={grossIncomeType}
            detail={grossIncomeDetail}
            onType={(v) => {
              setGrossIncomeType(v);
              touch();
            }}
            onDetail={(v) => {
              setGrossIncomeDetail(v);
              touch();
            }}
          />
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

      {saveBar()}
    </>
  );
}

function GrossIncomeInputs({
  type,
  detail,
  onType,
  onDetail,
}: {
  type: GrossIncomeType | '';
  detail: string;
  onType: (value: GrossIncomeType) => void;
  onDetail: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Select
        className="w-[190px] shrink-0"
        value={type}
        onChange={(v) => onType(v as GrossIncomeType)}
        placeholder="Elegir..."
        options={(Object.keys(GROSS_INCOME_LABELS) as GrossIncomeType[]).map((value) => ({ value, label: GROSS_INCOME_LABELS[value] }))}
      />
      <Input
        className="min-w-[140px] flex-1"
        value={detail}
        maxLength={50}
        onChange={(e) => onDetail(e.target.value)}
        placeholder="Detalle (sale en la factura)"
      />
    </div>
  );
}

/** Dato del paso 1 en modo revisión: valor + de dónde salió + "✎ corregir". */
function ReviewField({
  label,
  value,
  source,
  note,
  editing,
  onEdit,
  children,
}: {
  label: string;
  value: string;
  source?: Source;
  note?: string;
  editing?: boolean;
  onEdit?: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-[10px] border px-3 py-2.5">
      <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        {label} {source === 'constancia' ? <span className="rounded-full bg-emerald-500/15 px-[7px] py-px text-[10.5px] font-bold text-emerald-700 dark:text-emerald-400">de la constancia</span> : <SourceBadge source={source} />}
      </span>
      {editing && children ? (
        children
      ) : (
        <>
          <span className={`font-semibold [overflow-wrap:anywhere] ${value ? '' : 'font-normal text-muted-foreground'}`}>{value || 'Sin cargar'}</span>
          {note && <span className="text-xs text-muted-foreground">{note}</span>}
          {onEdit && (
            <button type="button" onClick={onEdit} className="w-max text-xs text-primary hover:underline">
              ✎ corregir
            </button>
          )}
        </>
      )}
    </div>
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
  help,
  className,
  children,
}: {
  label: string;
  source?: Source;
  help?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-[5px] ${className ?? ''}`}>
      <span className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-muted-foreground">
        {label} <SourceBadge source={source} />
      </span>
      {children}
      {help && <p className="text-xs text-muted-foreground">{help}</p>}
    </div>
  );
}
