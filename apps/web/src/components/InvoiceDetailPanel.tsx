'use client';

import Select from '@/components/ui/Select';
import {
  INVOICE_PDF_FORMATS,
  invoicingApi,
  invoicingPreferencesApi,
  type InvoicePdfFormat,
} from '@/lib/invoicing';
import { buildVariantLabel } from '@/lib/inventory';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

interface Props {
  // Only what the header needs before the full detail loads - deliberately
  // not the whole Invoice type, so callers that only have a summary row
  // (e.g. StatementModal's per-customer invoice list) can open this too
  // without an extra round trip just to get a full Invoice object first.
  invoice: { id: string; documentLetter: string; number: string; customerName: string };
  onClose: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Borrador',
  ISSUED: 'Emitida',
  PARTIALLY_PAID: 'Pago parcial',
  PAID: 'Pagada',
  OVERDUE: 'Vencida',
  CANCELLED: 'Cancelada',
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-slate-300 dark:bg-slate-700 text-slate-700 dark:text-slate-300',
  ISSUED: 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300',
  PARTIALLY_PAID: 'bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300',
  PAID: 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300',
  OVERDUE: 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300',
  CANCELLED: 'bg-slate-200 dark:bg-slate-800 text-slate-500',
};

const METHOD_LABELS: Record<string, string> = {
  CASH: 'Efectivo',
  BANK_TRANSFER: 'Transferencia',
  CARD: 'Tarjeta',
  CHECK: 'Cheque',
};

export default function InvoiceDetailPanel({ invoice, onClose }: Props) {
  // Mounts off-screen, then slides in on the next frame - a plain
  // `translate-x-0` from the start wouldn't have anything to transition
  // from since the element wasn't rendered a moment ago.
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ['invoice-detail', invoice.id],
    queryFn: () => invoicingApi.getInvoice(invoice.id),
  });

  // Precarga el formato preferido del usuario, sin pisar un cambio manual
  // que haga después en este mismo panel - mismo patrón que
  // PurchaseOrderDetailPanel/pdfStyle.
  const { data: preferences } = useQuery({
    queryKey: ['invoicing-preferences'],
    queryFn: invoicingPreferencesApi.get,
  });
  const [pdfFormat, setPdfFormat] = useState<InvoicePdfFormat>('A4');
  const [formatTouched, setFormatTouched] = useState(false);
  useEffect(() => {
    if (!formatTouched && preferences) setPdfFormat(preferences.invoicePdfFormat);
  }, [preferences, formatTouched]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60">
      <div
        className={`flex h-full w-full max-w-lg flex-col overflow-y-auto border-l border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-6 shadow-2xl transition-transform duration-200 ${
          visible ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {invoice.documentLetter}-{invoice.number}
            </h2>
            <p className="text-xs text-slate-500">{invoice.customerName}</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 transition hover:text-slate-700 dark:hover:text-slate-300"
          >
            ✕
          </button>
        </div>

        {isLoading || !data ? (
          <div className="flex h-40 items-center justify-center text-slate-500">Cargando...</div>
        ) : (
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Info label="Estado">
                <span
                  className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[data.status] ?? 'bg-slate-300 dark:bg-slate-700 text-slate-700 dark:text-slate-300'}`}
                >
                  {STATUS_LABELS[data.status] ?? data.status}
                </span>
              </Info>
              <Info label="Fecha de emisión">
                {new Date(data.issueDate).toLocaleDateString('es-AR')}
              </Info>
              {data.dueDate && (
                <Info label="Vencimiento">{new Date(data.dueDate).toLocaleDateString('es-AR')}</Info>
              )}
              {data.afipCae && <Info label="CAE">{data.afipCae}</Info>}
            </div>

            <section>
              <h3 className="mb-2 text-sm font-medium text-slate-600 dark:text-slate-400">Líneas</h3>
              <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-left text-slate-500">
                      <th className="p-2">Artículo</th>
                      <th className="p-2 text-right">Cant.</th>
                      <th className="p-2 text-right">Precio</th>
                      <th className="p-2 text-right">Desc.</th>
                      <th className="p-2 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.lines.map((line) => (
                      <tr key={line.id} className="border-b border-slate-200/50 dark:border-slate-800/50">
                        <td className="p-2">
                          <p className="text-slate-800 dark:text-slate-200">
                            {line.articleVariant.article.name}
                            {buildVariantLabel(line.articleVariant) && (
                              <span className="text-slate-500"> · {buildVariantLabel(line.articleVariant)}</span>
                            )}
                          </p>
                          <p className="font-mono text-[10px] text-slate-500">
                            {line.articleVariant.sku}
                          </p>
                        </td>
                        <td className="p-2 text-right text-slate-700 dark:text-slate-300">
                          {line.quantity}
                        </td>
                        <td className="p-2 text-right text-slate-700 dark:text-slate-300">
                          ${Number(line.unitPrice).toFixed(2)}
                        </td>
                        <td className="p-2 text-right text-slate-700 dark:text-slate-300">
                          {Number(line.discountValue) > 0
                            ? line.discountType === 'PERCENTAGE'
                              ? `${line.discountValue}%`
                              : `$${Number(line.discountValue).toFixed(2)}`
                            : '—'}
                        </td>
                        <td className="p-2 text-right font-medium text-slate-900 dark:text-slate-100">
                          ${Number(line.lineTotal).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="flex flex-col gap-1 text-sm">
              <TotalRow label="Subtotal" value={data.subtotal} />
              <TotalRow label="Impuestos" value={data.taxTotal} />
              <TotalRow label="Total" value={data.total} bold />
              <TotalRow label="Saldo pendiente" value={data.balanceDue} bold />
            </section>

            <section>
              <h3 className="mb-2 text-sm font-medium text-slate-600 dark:text-slate-400">
                Historial de cobros
              </h3>
              {data.receipts.length === 0 ? (
                <p className="text-sm text-slate-400 dark:text-slate-600">Sin cobros registrados</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {data.receipts.map((r) => (
                    <li
                      key={r.id}
                      className="flex items-center justify-between rounded-lg bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
                    >
                      <div>
                        <p className="text-slate-800 dark:text-slate-200">
                          {METHOD_LABELS[r.method] ?? r.method}
                        </p>
                        <p className="text-xs text-slate-500">
                          {new Date(r.paidAt).toLocaleDateString('es-AR')}
                        </p>
                      </div>
                      <p className="font-medium text-green-700 dark:text-green-400">
                        ${Number(r.amount).toFixed(2)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {data.creditNotes.length > 0 && (
              <section>
                <h3 className="mb-2 text-sm font-medium text-slate-600 dark:text-slate-400">
                  Notas de crédito
                </h3>
                <ul className="flex flex-col gap-2">
                  {data.creditNotes.map((cn) => (
                    <li
                      key={cn.id}
                      className="flex items-center justify-between rounded-lg bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
                    >
                      <div>
                        <p className="text-slate-800 dark:text-slate-200">
                          {cn.documentLetter}-{cn.number}
                        </p>
                        <p className="text-xs text-slate-500">
                          {cn.reason} · {new Date(cn.issueDate).toLocaleDateString('es-AR')}
                        </p>
                      </div>
                      <p className="font-medium text-red-700 dark:text-red-400">
                        -${Number(cn.total).toFixed(2)}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {data.afipCae && (
              <section className="flex flex-col gap-2 border-t border-slate-200 dark:border-slate-800 pt-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    buttonClassName="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 px-2 py-1.5 text-xs text-slate-900 dark:text-slate-100"
                    value={pdfFormat}
                    onChange={(f) => {
                      setPdfFormat(f as InvoicePdfFormat);
                      setFormatTouched(true);
                    }}
                    options={INVOICE_PDF_FORMATS}
                  />
                  <button
                    type="button"
                    onClick={() => void invoicingApi.openPdf(invoice.id, pdfFormat)}
                    className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 transition hover:bg-slate-200 dark:hover:bg-slate-800"
                  >
                    Descargar PDF
                  </button>
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-slate-800 dark:text-slate-200">{children}</p>
    </div>
  );
}

function TotalRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className={bold ? 'font-medium text-slate-900 dark:text-slate-100' : 'text-slate-600 dark:text-slate-400'}>
        {label}
      </span>
      <span className={bold ? 'font-semibold text-slate-900 dark:text-slate-100' : 'text-slate-700 dark:text-slate-300'}>
        ${Number(value).toFixed(2)}
      </span>
    </div>
  );
}
