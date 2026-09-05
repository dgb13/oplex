'use client';

import { aiInvoiceScanApi, type AiInvoiceExtractionResult, type AiInvoiceScanUsage, type ExtractedField } from '@/lib/ai-invoice-scan';
import { companiesApi, type Company } from '@/lib/companies';
import type { DocumentLetter } from '@/lib/documentLetter';
import { invoicingApi } from '@/lib/invoicing';
import { purchaseInvoicesApi, type PurchaseInvoiceTaxLineInput, type PurchaseInvoiceTaxLineType } from '@/lib/purchases';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useRef, useState } from 'react';

const inputClass =
  'w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500';

const TAX_LINE_TYPE_LABELS: Record<PurchaseInvoiceTaxLineType, string> = {
  IVA_CREDITO: 'IVA Crédito',
  PERCEPCION: 'Percepción',
};

function digitsOnly(s: string | null): string {
  return (s ?? '').replace(/\D/g, '');
}

type ConfidenceLevel = 'alta' | 'media' | 'baja';

/** Confianza GLOBAL del escaneo (no por campo) - toma el MÍNIMO de confianza
 * entre todos los campos que vinieron de la IA, no el promedio: un solo
 * campo mal leído (foto borrosa, manchada, doblada, poca luz) tiene que
 * bajar la confianza general, no diluirse entre el resto de campos que sí
 * salieron bien. Los campos con source:'qr' no entran en la cuenta (son
 * verdad absoluta, no tienen confidence). Mismos umbrales que ya usa
 * SourceBadge por campo (0.6), más un escalón extra en 0.85 para poder
 * distinguir "revisar todo" de "revisar sólo lo marcado". */
function overallConfidence(extraction: AiInvoiceExtractionResult): { level: ConfidenceLevel; min: number } {
  const aiFields: ExtractedField<unknown>[] = [
    extraction.supplierCuit,
    extraction.supplierName,
    extraction.supplierInvoiceNumber,
    extraction.supplierInvoiceDate,
    extraction.documentLetter,
    extraction.pointOfSale,
    extraction.number,
    extraction.currencyCode,
    extraction.subtotal,
    ...extraction.taxLines.flatMap((t) => [t.concept, t.amount, t.netAmount, t.taxRate]),
  ];
  const confidences = aiFields
    .filter((f) => f.source === 'ai' && f.confidence !== undefined)
    .map((f) => f.confidence as number);
  const min = confidences.length > 0 ? Math.min(...confidences) : 1;
  const level: ConfidenceLevel = min >= 0.85 ? 'alta' : min >= 0.6 ? 'media' : 'baja';
  return { level, min };
}

const CONFIDENCE_BANNER: Record<ConfidenceLevel, { label: string; detail: string; className: string }> = {
  alta: {
    label: '🟢 Confianza alta',
    detail: 'La imagen se leyó con claridad. Igual, dale una repasada antes de confirmar.',
    className:
      'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300',
  },
  media: {
    label: '🟡 Confianza media',
    detail: 'Algunos campos (marcados en amarillo) no se leyeron con total claridad - revisalos con atención.',
    className:
      'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300',
  },
  baja: {
    label: '🔴 Confianza baja',
    detail:
      'La foto puede estar borrosa, manchada, doblada o con poca luz - revisá TODOS los campos antes de confirmar, no sólo los marcados.',
    className: 'border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300',
  },
};

/** Badge de origen del campo - QR (candado, verdad absoluta) vs IA
 * (editable, con su confianza). Ver docs/plan-carga-comprobantes-ia.md,
 * punto 5. */
function SourceBadge({ field }: { field: ExtractedField<unknown> }) {
  if (field.source === 'qr') {
    return (
      <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
        QR
      </span>
    );
  }
  const confidence = field.confidence ?? 1;
  const colorClass =
    confidence >= 0.85
      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
      : confidence >= 0.6
        ? 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
        : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300';
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${colorClass}`}
      title={field.confidence !== undefined ? `Confianza: ${Math.round(field.confidence * 100)}%` : undefined}
    >
      IA {field.confidence !== undefined ? `${Math.round(field.confidence * 100)}%` : ''}
    </span>
  );
}

/** Cupo mensual del plan + link "Mejorar plan" - separado del semáforo a
 * propósito: el semáforo habla de si Claude/la plataforma están
 * respondiendo bien AHORA, esto habla de cuánto cupo del PLAN queda este
 * mes. Un tenant puede estar en verde (Claude anda perfecto) y a la vez
 * casi sin cupo, o en rojo por cupo agotado - son dos ejes distintos, no
 * se puede colapsar uno en el otro. */
function UsageBanner({ usage }: { usage: AiInvoiceScanUsage }) {
  if (usage.quota == null) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs dark:border-slate-800 dark:bg-slate-900">
        <span className="text-slate-500 dark:text-slate-400">
          Tu plan actual ({usage.planName}) no incluye la carga de comprobantes con IA.
        </span>
        <a href="/settings/billing" className="whitespace-nowrap font-semibold text-indigo-500 hover:text-indigo-400">
          Mejorar plan →
        </a>
      </div>
    );
  }

  const availablePercent = Math.max(0, Math.min(100, Math.round(((usage.quota - usage.used) / usage.quota) * 100)));
  const low = availablePercent <= 20;

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="text-slate-600 dark:text-slate-400">
          Cupo IA ({usage.planName}): {usage.used}/{usage.quota} usados este mes — {availablePercent}% disponible
        </span>
        {low && (
          <a href="/settings/billing" className="whitespace-nowrap font-semibold text-indigo-500 hover:text-indigo-400">
            Mejorar plan →
          </a>
        )}
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        <div
          className={`h-full rounded-full ${low ? 'bg-red-500' : 'bg-indigo-500'}`}
          style={{ width: `${100 - availablePercent}%` }}
        />
      </div>
    </div>
  );
}

function Field({ label, field, children }: { label: string; field: ExtractedField<unknown>; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="flex items-center gap-1.5 text-xs text-slate-500">
        {label}
        <SourceBadge field={field} />
      </span>
      {children}
    </label>
  );
}

interface ReviewForm {
  supplierCuit: string;
  supplierName: string;
  supplierInvoiceNumber: string;
  supplierInvoiceDate: string;
  documentLetter: DocumentLetter | '';
  pointOfSale: string;
  number: string;
  subtotal: number;
  currencyCode: string;
  taxLines: PurchaseInvoiceTaxLineInput[];
}

function toReviewForm(result: AiInvoiceExtractionResult): ReviewForm {
  return {
    supplierCuit: result.supplierCuit.value ?? '',
    supplierName: result.supplierName.value ?? '',
    supplierInvoiceNumber: result.supplierInvoiceNumber.value,
    supplierInvoiceDate: result.supplierInvoiceDate.value,
    documentLetter: (result.documentLetter.value as DocumentLetter | null) ?? '',
    pointOfSale: result.pointOfSale.value ?? '',
    number: result.number.value ?? '',
    subtotal: result.subtotal.value,
    currencyCode: result.currencyCode.value,
    taxLines: result.taxLines.map((t) => ({
      type: t.type,
      concept: t.concept.value,
      amount: t.amount.value,
      netAmount: t.netAmount.value,
      taxRate: t.taxRate.value ?? undefined,
    })),
  };
}

/** true si el usuario tocó algún campo editable de la pantalla de revisión
 * antes de confirmar (comparado contra lo que la IA/QR leyó originalmente) -
 * alimenta PurchaseInvoice.aiScanEdited, usado para filtrar "Galería IA".
 * supplierCuit/supplierName quedan afuera a propósito: no son campos
 * editables en esta pantalla (sólo resuelven el proveedor). */
function wasFormEdited(form: ReviewForm, extraction: AiInvoiceExtractionResult): boolean {
  if (
    form.supplierInvoiceNumber !== extraction.supplierInvoiceNumber.value ||
    form.supplierInvoiceDate !== extraction.supplierInvoiceDate.value ||
    form.documentLetter !== (extraction.documentLetter.value ?? '') ||
    form.pointOfSale !== (extraction.pointOfSale.value ?? '') ||
    form.number !== (extraction.number.value ?? '') ||
    form.currencyCode !== extraction.currencyCode.value ||
    form.subtotal !== extraction.subtotal.value
  ) {
    return true;
  }
  if (form.taxLines.length !== extraction.taxLines.length) {
    return true;
  }
  return form.taxLines.some((line, i) => {
    const original = extraction.taxLines[i];
    return (
      line.type !== original.type ||
      line.concept !== original.concept.value ||
      line.amount !== original.amount.value ||
      line.netAmount !== original.netAmount.value ||
      (line.taxRate ?? null) !== original.taxRate.value
    );
  });
}

/**
 * "Carga con IA" - lee una factura de compra fotografiada/escaneada (QR +
 * Claude, ver @plexo/ai-invoice-scan) y la deja lista para confirmar. Nunca
 * bloquea el resto de Compras: si no está disponible, el usuario sigue
 * teniendo "Nueva factura" (NewPurchaseInvoiceModal) para cargar a mano, tal
 * cual siempre existió. Ver docs/plan-carga-comprobantes-ia.md.
 */
export default function CargaIaTab() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [extraction, setExtraction] = useState<AiInvoiceExtractionResult | null>(null);
  const [form, setForm] = useState<ReviewForm | null>(null);
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [creatingSupplier, setCreatingSupplier] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState('');
  const [extractError, setExtractError] = useState('');
  const [confirmError, setConfirmError] = useState('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  const statusQuery = useQuery({
    queryKey: ['ai-invoice-scan-status'],
    queryFn: aiInvoiceScanApi.getStatus,
    refetchInterval: 60_000,
  });
  const suppliersQuery = useQuery({
    queryKey: ['companies', 'SUPPLIER'],
    queryFn: () => companiesApi.list('SUPPLIER'),
    enabled: !!form,
  });
  const currenciesQuery = useQuery({
    queryKey: ['currencies'],
    queryFn: invoicingApi.listCurrencies,
    enabled: !!form,
  });

  const matchedSupplier: Company | undefined = form
    ? suppliersQuery.data?.find((c) => digitsOnly(c.taxId) === digitsOnly(form.supplierCuit) && digitsOnly(c.taxId) !== '')
    : undefined;

  const extractMutation = useMutation({
    mutationFn: (file: File) => aiInvoiceScanApi.extract(file),
    onMutate: () => setExtractError(''),
    onSuccess: (result, file) => {
      setExtraction(result);
      setForm(toReviewForm(result));
      setUploadedFile(file);
      setSupplierId(null);
      setCreatingSupplier(false);
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo leer el comprobante';
      setExtractError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  const createSupplierMutation = useMutation({
    mutationFn: (name: string) => companiesApi.create({ name, taxId: form?.supplierCuit || undefined, roles: ['SUPPLIER'] }),
    onSuccess: (company) => {
      setSupplierId(company.id);
      setCreatingSupplier(false);
      void queryClient.invalidateQueries({ queryKey: ['companies', 'SUPPLIER'] });
    },
  });

  const confirmMutation = useMutation({
    mutationFn: async () => {
      if (!form || !extraction) throw new Error('Sin datos para confirmar');
      const resolvedSupplierId = supplierId ?? matchedSupplier?.id;
      if (!resolvedSupplierId) throw new Error('Falta resolver el proveedor');
      const currency = currenciesQuery.data?.find((c) => c.code === form.currencyCode);
      if (!currency) throw new Error(`Moneda "${form.currencyCode}" no encontrada`);

      const invoice = await purchaseInvoicesApi.create({
        supplierId: resolvedSupplierId,
        currencyId: currency.id,
        supplierInvoiceNumber: form.supplierInvoiceNumber,
        supplierInvoiceDate: form.supplierInvoiceDate,
        subtotal: form.subtotal,
        documentLetter: form.documentLetter || undefined,
        pointOfSale: form.pointOfSale || undefined,
        number: form.number || undefined,
        taxLines: form.taxLines.filter((t) => t.concept && t.amount > 0),
        aiScanConfidence: overallConfidence(extraction).min,
        aiScanEdited: wasFormEdited(form, extraction),
      });
      if (uploadedFile) {
        await purchaseInvoicesApi.uploadAttachment(invoice.id, uploadedFile);
      }
      return invoice;
    },
    onMutate: () => setConfirmError(''),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['purchase-invoices'] });
      setExtraction(null);
      setForm(null);
      setUploadedFile(null);
    },
    onError: (err: AxiosError<{ message?: string | string[] }> | Error) => {
      const message =
        'response' in err ? (err.response?.data?.message ?? 'No se pudo registrar la factura') : err.message;
      setConfirmError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  function handleFile(file: File) {
    extractMutation.mutate(file);
  }

  const availability = statusQuery.data;
  const canUpload = !statusQuery.isLoading && availability?.available !== 'red';

  if (form && extraction) {
    const taxTotal = form.taxLines.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    const total = form.subtotal + taxTotal;
    const confidence = overallConfidence(extraction);
    const banner = CONFIDENCE_BANNER[confidence.level];

    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Revisar comprobante</h2>
          <button
            type="button"
            onClick={() => {
              setExtraction(null);
              setForm(null);
              setUploadedFile(null);
            }}
            className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          >
            Cancelar y volver a subir
          </button>
        </div>

        <div className={`rounded-lg border px-4 py-2.5 text-sm ${banner.className}`}>
          <span className="font-semibold">{banner.label}</span>
          <span className="ml-2">{banner.detail}</span>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Proveedor</p>
          {matchedSupplier || supplierId ? (
            <p className="text-sm text-slate-800 dark:text-slate-200">
              {(supplierId && suppliersQuery.data?.find((c) => c.id === supplierId)?.name) || matchedSupplier?.name}{' '}
              <span className="text-xs text-slate-500">(vinculado por CUIT)</span>
            </p>
          ) : creatingSupplier ? (
            <div className="flex items-center gap-2">
              <input
                value={newSupplierName}
                onChange={(e) => setNewSupplierName(e.target.value)}
                placeholder="Nombre del proveedor"
                className={inputClass}
              />
              <button
                type="button"
                disabled={!newSupplierName || createSupplierMutation.isPending}
                onClick={() => createSupplierMutation.mutate(newSupplierName)}
                className="whitespace-nowrap rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                Crear
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <p className="text-sm text-amber-700 dark:text-amber-400">
                No encontramos un proveedor con CUIT {form.supplierCuit || '(sin CUIT)'}
                {form.supplierName ? ` — "${form.supplierName}"` : ''}.
              </p>
              <button
                type="button"
                onClick={() => {
                  setNewSupplierName(form.supplierName);
                  setCreatingSupplier(true);
                }}
                className="whitespace-nowrap rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                + Crear proveedor
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 sm:grid-cols-4">
          <Field label="Nº de factura" field={extraction.supplierInvoiceNumber}>
            <input
              value={form.supplierInvoiceNumber}
              onChange={(e) => setForm({ ...form, supplierInvoiceNumber: e.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label="Fecha" field={extraction.supplierInvoiceDate}>
            <input
              type="date"
              value={form.supplierInvoiceDate}
              onChange={(e) => setForm({ ...form, supplierInvoiceDate: e.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label="Letra" field={extraction.documentLetter}>
            <select
              value={form.documentLetter}
              onChange={(e) => setForm({ ...form, documentLetter: e.target.value as DocumentLetter | '' })}
              className={inputClass}
            >
              <option value="">—</option>
              {(['A', 'B', 'C', 'M'] as const).map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Moneda" field={extraction.currencyCode}>
            <select
              value={form.currencyCode}
              onChange={(e) => setForm({ ...form, currencyCode: e.target.value })}
              className={inputClass}
            >
              {(currenciesQuery.data ?? []).map((c) => (
                <option key={c.id} value={c.code}>
                  {c.code}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Punto de venta" field={extraction.pointOfSale}>
            <input value={form.pointOfSale} onChange={(e) => setForm({ ...form, pointOfSale: e.target.value })} className={inputClass} />
          </Field>
          <Field label="Número" field={extraction.number}>
            <input value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} className={inputClass} />
          </Field>
          <Field label="Subtotal (neto)" field={extraction.subtotal}>
            <input
              type="number"
              value={form.subtotal}
              onChange={(e) => setForm({ ...form, subtotal: Number(e.target.value) })}
              className={inputClass}
            />
          </Field>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Impuestos</p>
          <div className="flex flex-col gap-2">
            {form.taxLines.map((line, i) => {
              const extractedLine = extraction.taxLines[i];
              return (
                <div key={i} className="grid grid-cols-4 items-end gap-2">
                  <Field label="Tipo" field={extractedLine.concept}>
                    <select
                      value={line.type}
                      onChange={(e) => {
                        const next = [...form.taxLines];
                        next[i] = { ...line, type: e.target.value as PurchaseInvoiceTaxLineType };
                        setForm({ ...form, taxLines: next });
                      }}
                      className={inputClass}
                    >
                      {Object.entries(TAX_LINE_TYPE_LABELS).map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Concepto" field={extractedLine.concept}>
                    <input
                      value={line.concept}
                      onChange={(e) => {
                        const next = [...form.taxLines];
                        next[i] = { ...line, concept: e.target.value };
                        setForm({ ...form, taxLines: next });
                      }}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Monto" field={extractedLine.amount}>
                    <input
                      type="number"
                      value={line.amount}
                      onChange={(e) => {
                        const next = [...form.taxLines];
                        next[i] = { ...line, amount: Number(e.target.value) };
                        setForm({ ...form, taxLines: next });
                      }}
                      className={inputClass}
                    />
                  </Field>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, taxLines: form.taxLines.filter((_, j) => j !== i) })}
                    className="mb-2 text-xs text-red-500 hover:text-red-400"
                  >
                    Quitar
                  </button>
                </div>
              );
            })}
            <button
              type="button"
              onClick={() =>
                setForm({
                  ...form,
                  taxLines: [...form.taxLines, { type: 'IVA_CREDITO', concept: '', amount: 0, netAmount: 0 }],
                })
              }
              className="mt-1 self-start text-xs text-indigo-500 hover:text-indigo-400"
            >
              + Agregar línea
            </button>
          </div>
          <p className="mt-4 text-right text-sm font-semibold text-slate-800 dark:text-slate-200">
            Total: ${total.toFixed(2)}
          </p>
        </div>

        {confirmError && <p className="text-sm text-red-500">{confirmError}</p>}

        <div className="flex justify-end">
          <button
            type="button"
            disabled={confirmMutation.isPending || (!matchedSupplier && !supplierId)}
            onClick={() => confirmMutation.mutate()}
            className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
          >
            {confirmMutation.isPending ? 'Confirmando...' : 'Confirmar y crear factura'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm ${
          availability?.available === 'green'
            ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300'
            : availability?.available === 'yellow'
              ? 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300'
              : 'border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300'
        }`}
      >
        <span>
          {statusQuery.isLoading
            ? '⏳ Consultando disponibilidad...'
            : availability?.available === 'green'
              ? '🟢 Escaneo con IA disponible'
              : availability?.available === 'yellow'
                ? `🟡 ${availability.reason}`
                : `🔴 ${availability && 'reason' in availability ? availability.reason : 'No disponible'}`}
        </span>
      </div>

      {availability && 'usage' in availability && availability.usage && <UsageBanner usage={availability.usage} />}

      {!canUpload ? (
        <p className="text-sm text-slate-500">
          Podés seguir cargando facturas a mano desde la pestaña "Facturas" mientras tanto.
        </p>
      ) : (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files[0];
            if (file) handleFile(file);
          }}
          className={`flex flex-col items-center gap-3 rounded-xl border-2 border-dashed p-10 text-center transition ${
            dragOver ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30' : 'border-slate-300 dark:border-slate-700'
          }`}
        >
          {extractMutation.isPending ? (
            <p className="text-sm text-slate-500">Leyendo el comprobante...</p>
          ) : (
            <>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Arrastrá una foto o PDF de la factura acá, o
              </p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
              >
                Elegir archivo / sacar foto
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                capture="environment"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                  e.target.value = '';
                }}
                className="hidden"
              />
            </>
          )}
          {extractError && <p className="text-sm text-red-500">{extractError}</p>}
        </div>
      )}
    </div>
  );
}
