'use client';

import { resolveUploadUrl } from '@/lib/inventory';
import {
  describePurchaseInvoiceStatus,
  purchaseInvoicesApi,
  type OwnCheckInput,
  type SupplierPaymentWithholdingInput,
} from '@/lib/purchases';
import { reportsApi } from '@/lib/reports';
import { WITHHOLDING_TAX_TYPE_LABELS, withholdingRegimesApi, type WithholdingRegime } from '@/lib/taxes';
import { tenantSettingsApi } from '@/lib/tenantSettings';
import { treasuryApi } from '@/lib/treasury';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useEffect, useState } from 'react';

interface Props {
  purchaseInvoiceId: string;
  onClose: () => void;
}

const inputClass =
  'rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500';

/** One "Agregar retención" row in the payment form - regimeId is required
 * (no free-text taxType/jurisdiction/concept here, unlike percepciones on
 * the invoice side; keeps this first pass simpler) so taxType/jurisdiction/
 * concept always come from the chosen WithholdingRegime at submit time. */
interface WithholdingRow {
  key: number;
  regimeId: string;
  amount: number;
  certificateNumber: string;
}

export default function PurchaseInvoiceDetailPanel({ purchaseInvoiceId, onClose }: Props) {
  const queryClient = useQueryClient();
  const [visible, setVisible] = useState(false);
  const [paying, setPaying] = useState(false);
  const [amount, setAmount] = useState<number>(0);
  const [method, setMethod] = useState('Transferencia');
  const [payMode, setPayMode] = useState<'CASH' | 'ENDORSE' | 'OWN_CHECK'>('CASH');
  const [endorseCheckId, setEndorseCheckId] = useState('');
  const [ownCheck, setOwnCheck] = useState<OwnCheckInput>({
    number: '',
    bankName: '',
    format: 'PHYSICAL',
    issueDate: '',
    dueDate: '',
    financialAccountId: '',
  });
  const [withholdingRows, setWithholdingRows] = useState<WithholdingRow[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ['purchase-invoice-detail', purchaseInvoiceId],
    queryFn: () => purchaseInvoicesApi.get(purchaseInvoiceId),
  });

  const { data: settings } = useQuery({
    queryKey: ['tenant-settings'],
    queryFn: tenantSettingsApi.get,
  });
  const { data: allActiveRegimes } = useQuery({
    queryKey: ['withholding-regimes', 'active'],
    queryFn: () => withholdingRegimesApi.listActive(),
    enabled: paying,
  });
  // Cheques de tercero en cartera (todavía no acreditados) - endosarlos
  // cancela un pago sin que la plata haya pasado por una cuenta propia.
  const { data: allChecks } = useQuery({
    queryKey: ['checks', { kind: 'THIRD_PARTY' }],
    queryFn: () => treasuryApi.listChecks({ kind: 'THIRD_PARTY' }),
    enabled: paying && payMode === 'ENDORSE',
  });
  const endorsableChecks = (allChecks ?? []).filter((c) => c.status === 'PORTFOLIO' || c.status === 'DEPOSITED');
  const { data: financialAccounts } = useQuery({
    queryKey: ['financial-accounts'],
    queryFn: reportsApi.listFinancialAccounts,
    enabled: paying && payMode === 'OWN_CHECK',
  });
  // Only regimes for a tax type the tenant actually declared itself an
  // agent for (see Preferencias) - a regime existing in the catalog isn't
  // enough on its own, same gate the backend expects the user to have
  // already gone through.
  const availableRegimes = (allActiveRegimes ?? []).filter((r) => {
    if (!settings) return false;
    if (r.taxType === 'INCOME_TAX') return settings.withholdingAgentIncomeTax;
    if (r.taxType === 'VAT') return settings.withholdingAgentVat;
    return settings.withholdingAgentGrossIncome;
  });
  const regimeById = new Map<string, WithholdingRegime>(availableRegimes.map((r) => [r.id, r]));

  useEffect(() => {
    if (data) setAmount(Number(data.balanceDue));
  }, [data]);

  // Endosar un cheque siempre cancela por su valor nominal completo - no
  // tiene sentido elegir "cuánto" de un cheque ya emitido por otro.
  useEffect(() => {
    if (payMode !== 'ENDORSE') return;
    const check = endorsableChecks.find((c) => c.id === endorseCheckId);
    if (check) setAmount(Number(check.amount));
  }, [payMode, endorseCheckId, endorsableChecks]);

  useEffect(() => {
    if (payMode === 'ENDORSE') setMethod('Cheque endosado');
    else if (payMode === 'OWN_CHECK') setMethod('Cheque propio');
    else setMethod('Transferencia');
  }, [payMode]);

  const totalWithheld = withholdingRows.reduce((sum, row) => sum + (row.amount || 0), 0);
  const appliedAmount = amount + totalWithheld;

  const paymentMutation = useMutation({
    mutationFn: () => {
      const withholdings: SupplierPaymentWithholdingInput[] = withholdingRows.map((row) => {
        const regime = regimeById.get(row.regimeId);
        return {
          regimeId: row.regimeId || undefined,
          taxType: regime?.taxType ?? 'INCOME_TAX',
          jurisdiction: regime?.jurisdiction ?? undefined,
          concept: regime?.name ?? 'Retención',
          amount: row.amount,
          certificateNumber: row.certificateNumber || undefined,
        };
      });
      return purchaseInvoicesApi.recordPayment(purchaseInvoiceId, {
        amount,
        method,
        withholdings,
        endorseCheckId: payMode === 'ENDORSE' ? endorseCheckId : undefined,
        ownCheck: payMode === 'OWN_CHECK' ? ownCheck : undefined,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['purchase-invoice-detail', purchaseInvoiceId] });
      void queryClient.invalidateQueries({ queryKey: ['purchase-invoices'] });
      void queryClient.invalidateQueries({ queryKey: ['checks'] });
      setPaying(false);
      setWithholdingRows([]);
      setPayMode('CASH');
      setEndorseCheckId('');
      setOwnCheck({ number: '', bankName: '', format: 'PHYSICAL', issueDate: '', dueDate: '', financialAccountId: '' });
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo registrar el pago';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  function addWithholdingRow() {
    const first = availableRegimes[0];
    setWithholdingRows((prev) => [
      ...prev,
      { key: Date.now(), regimeId: first?.id ?? '', amount: first ? suggestAmount(first) : 0, certificateNumber: '' },
    ]);
  }

  function updateWithholdingRow(key: number, patch: Partial<WithholdingRow>) {
    setWithholdingRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function removeWithholdingRow(key: number) {
    setWithholdingRows((prev) => prev.filter((row) => row.key !== key));
  }

  // Sugiere tasa × subtotal de la factura, sólo si esa base llega al
  // mínimo no imponible del régimen - siempre editable después, mismo
  // nivel de confianza que las percepciones transcriptas en la factura.
  function suggestAmount(regime: WithholdingRegime): number {
    if (!data) return 0;
    const base = Number(data.subtotal);
    if (base < Number(regime.minTaxableAmount)) return 0;
    return Math.round(base * (Number(regime.rate) / 100) * 100) / 100;
  }

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
              {data?.supplierInvoiceNumber ?? '...'}
            </h2>
            {data && <p className="text-xs text-slate-500">{data.supplierName}</p>}
          </div>
          <button onClick={onClose} className="text-slate-500 transition hover:text-slate-700 dark:hover:text-slate-300">
            ✕
          </button>
        </div>

        {isLoading || !data ? (
          <div className="flex h-40 items-center justify-center text-slate-500">Cargando...</div>
        ) : (
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Info label="Estado">
                {(() => {
                  const status = describePurchaseInvoiceStatus(data.status);
                  return (
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${status.colorClass}`}>
                      {status.label}
                    </span>
                  );
                })()}
              </Info>
              {data.purchaseOrder && <Info label="Orden de Compra">{data.purchaseOrder.number}</Info>}
              <Info label="Fecha de factura">
                {new Date(data.supplierInvoiceDate).toLocaleDateString('es-AR', { timeZone: 'UTC' })}
              </Info>
              {data.dueDate && (
                <Info label="Vencimiento">
                  {new Date(data.dueDate).toLocaleDateString('es-AR', { timeZone: 'UTC' })}
                </Info>
              )}
              <Info label="Creada por">{data.createdBy.name ?? data.createdBy.email}</Info>
              {data.attachmentUrl && (
                <Info label="Comprobante">
                  <a
                    href={resolveUploadUrl(data.attachmentUrl) ?? '#'}
                    target="_blank"
                    rel="noreferrer"
                    className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300"
                  >
                    Ver
                  </a>
                </Info>
              )}
            </div>

            <section>
              <h3 className="mb-2 text-sm font-medium text-slate-600 dark:text-slate-400">IVA / Percepciones</h3>
              {data.taxLines.length === 0 ? (
                <p className="text-sm text-slate-500">Sin impuestos cargados</p>
              ) : (
                <div className="flex flex-col gap-1 text-sm">
                  {data.taxLines.map((line) => (
                    <div key={line.id} className="flex justify-between text-slate-700 dark:text-slate-300">
                      <span>
                        {line.concept}
                        {line.netAmount != null && (
                          <span className="text-xs text-slate-500"> — Neto ${Number(line.netAmount).toFixed(2)}</span>
                        )}
                      </span>
                      <span>${Number(line.amount).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-3 flex flex-col gap-1 border-t border-slate-200 dark:border-slate-800 pt-2 text-sm">
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>Subtotal</span>
                  <span>${Number(data.subtotal).toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-semibold text-slate-900 dark:text-slate-100">
                  <span>Total</span>
                  <span>${Number(data.total).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-amber-600 dark:text-amber-400">
                  <span>Saldo pendiente</span>
                  <span>${Number(data.balanceDue).toFixed(2)}</span>
                </div>
              </div>
            </section>

            {data.receiptLinks.length > 0 && (
              <section>
                <h3 className="mb-2 text-sm font-medium text-slate-600 dark:text-slate-400">Remitos cubiertos</h3>
                <ul className="flex flex-col gap-1 text-sm text-slate-700 dark:text-slate-300">
                  {data.receiptLinks.map((link) => (
                    <li key={link.id}>
                      {new Date(link.goodsReceipt.receivedAt).toLocaleDateString('es-AR', { timeZone: 'UTC' })}
                      {link.goodsReceipt.supplierDocNumber && ` — Remito ${link.goodsReceipt.supplierDocNumber}`}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {data.notes && (
              <section>
                <h3 className="mb-1 text-sm font-medium text-slate-600 dark:text-slate-400">Notas</h3>
                <p className="text-sm text-slate-700 dark:text-slate-300">{data.notes}</p>
              </section>
            )}

            <section>
              <h3 className="mb-2 text-sm font-medium text-slate-600 dark:text-slate-400">Pagos</h3>
              {data.payments.length === 0 ? (
                <p className="text-sm text-slate-500">Sin pagos registrados</p>
              ) : (
                <div className="flex flex-col gap-1 text-sm">
                  {data.payments.map((p) => (
                    <div key={p.id} className="flex flex-col gap-0.5">
                      <div className="flex justify-between text-slate-700 dark:text-slate-300">
                        <span>
                          {new Date(p.paidAt).toLocaleDateString('es-AR')} — {p.method}
                        </span>
                        <span>${Number(p.amount).toFixed(2)}</span>
                      </div>
                      {p.withholdings?.map((w) => (
                        <div key={w.id} className="flex justify-between pl-3 text-xs text-amber-600 dark:text-amber-400">
                          <span>
                            Retención {WITHHOLDING_TAX_TYPE_LABELS[w.taxType]}
                            {w.jurisdiction ? ` (${w.jurisdiction})` : ''} — {w.concept}
                          </span>
                          <span>${Number(w.amount).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}

              {Number(data.balanceDue) > 0 &&
                (paying ? (
                  <div className="mt-3 flex flex-col gap-3 rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                    <label className="flex flex-col gap-1 text-xs text-slate-500">
                      Forma de pago
                      <select
                        className={inputClass}
                        value={payMode}
                        onChange={(e) => {
                          setPayMode(e.target.value as typeof payMode);
                          setEndorseCheckId('');
                        }}
                      >
                        <option value="CASH">Efectivo / transferencia</option>
                        <option value="ENDORSE">Endosar cheque de cartera</option>
                        <option value="OWN_CHECK">Emitir cheque propio</option>
                      </select>
                    </label>

                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex flex-col gap-1 text-xs text-slate-500">
                        {payMode === 'ENDORSE' ? 'Monto (según el cheque)' : 'Efectivo/banco a pagar'}
                        <input
                          type="number"
                          min={0}
                          step="any"
                          disabled={payMode === 'ENDORSE'}
                          className={`${inputClass} disabled:opacity-60`}
                          value={amount}
                          onChange={(e) => setAmount(Number(e.target.value))}
                        />
                      </label>
                      {payMode === 'CASH' && (
                        <label className="flex flex-col gap-1 text-xs text-slate-500">
                          Método
                          <input
                            type="text"
                            className={inputClass}
                            placeholder="Método (efectivo, transferencia...)"
                            value={method}
                            onChange={(e) => setMethod(e.target.value)}
                          />
                        </label>
                      )}
                    </div>

                    {payMode === 'ENDORSE' && (
                      <div className="flex flex-col gap-1">
                        <label className="text-xs text-slate-500">Cheque a endosar</label>
                        {endorsableChecks.length === 0 ? (
                          <p className="text-xs text-amber-600 dark:text-amber-400">
                            No hay cheques de tercero en cartera disponibles para endosar.
                          </p>
                        ) : (
                          <select
                            className={inputClass}
                            value={endorseCheckId}
                            onChange={(e) => setEndorseCheckId(e.target.value)}
                          >
                            <option value="">Elegir...</option>
                            {endorsableChecks.map((c) => (
                              <option key={c.id} value={c.id}>
                                Nº {c.number} — {c.bankName} — ${Number(c.amount).toFixed(2)}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    )}

                    {payMode === 'OWN_CHECK' && (
                      <div className="flex flex-col gap-2">
                        <div className="grid grid-cols-2 gap-2">
                          <label className="flex flex-col gap-1 text-xs text-slate-500">
                            Número
                            <input
                              className={inputClass}
                              value={ownCheck.number}
                              onChange={(e) => setOwnCheck((prev) => ({ ...prev, number: e.target.value }))}
                            />
                          </label>
                          <label className="flex flex-col gap-1 text-xs text-slate-500">
                            Banco
                            <input
                              className={inputClass}
                              value={ownCheck.bankName}
                              onChange={(e) => setOwnCheck((prev) => ({ ...prev, bankName: e.target.value }))}
                            />
                          </label>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <label className="flex flex-col gap-1 text-xs text-slate-500">
                            Fecha de emisión
                            <input
                              type="date"
                              className={inputClass}
                              value={ownCheck.issueDate}
                              onChange={(e) => setOwnCheck((prev) => ({ ...prev, issueDate: e.target.value }))}
                            />
                          </label>
                          <label className="flex flex-col gap-1 text-xs text-slate-500">
                            Fecha de vencimiento
                            <input
                              type="date"
                              className={inputClass}
                              value={ownCheck.dueDate}
                              onChange={(e) => setOwnCheck((prev) => ({ ...prev, dueDate: e.target.value }))}
                            />
                          </label>
                        </div>
                        <label className="flex flex-col gap-1 text-xs text-slate-500">
                          Cuenta bancaria que lo respalda
                          {(financialAccounts ?? []).length === 0 ? (
                            <p className="text-xs text-amber-600 dark:text-amber-400">
                              No hay cuentas financieras creadas todavía (Reportes → Financiero).
                            </p>
                          ) : (
                            <select
                              className={inputClass}
                              value={ownCheck.financialAccountId}
                              onChange={(e) =>
                                setOwnCheck((prev) => ({ ...prev, financialAccountId: e.target.value }))
                              }
                            >
                              <option value="">Elegir...</option>
                              {(financialAccounts ?? []).map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.name}
                                </option>
                              ))}
                            </select>
                          )}
                        </label>
                      </div>
                    )}

                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-500">Retenciones</span>
                        <button
                          type="button"
                          onClick={addWithholdingRow}
                          disabled={availableRegimes.length === 0}
                          className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 disabled:opacity-50"
                        >
                          + agregar retención
                        </button>
                      </div>
                      {availableRegimes.length === 0 && (
                        <p className="text-xs text-slate-500">
                          No hay regímenes de retención activos habilitados (ver Preferencias e
                          Impuestos → Retenciones).
                        </p>
                      )}
                      {withholdingRows.map((row) => {
                        const regime = regimeById.get(row.regimeId);
                        return (
                          <div key={row.key} className="flex items-center gap-2">
                            <select
                              className={`${inputClass} flex-1`}
                              value={row.regimeId}
                              onChange={(e) => {
                                const newRegime = regimeById.get(e.target.value);
                                updateWithholdingRow(row.key, {
                                  regimeId: e.target.value,
                                  amount: newRegime ? suggestAmount(newRegime) : 0,
                                });
                              }}
                            >
                              {availableRegimes.map((r) => (
                                <option key={r.id} value={r.id}>
                                  {r.name} ({WITHHOLDING_TAX_TYPE_LABELS[r.taxType]} {r.rate}%)
                                </option>
                              ))}
                            </select>
                            <input
                              type="number"
                              min={0}
                              step="any"
                              className={`${inputClass} w-28`}
                              value={row.amount}
                              onChange={(e) => updateWithholdingRow(row.key, { amount: Number(e.target.value) })}
                              title="Monto retenido"
                            />
                            <input
                              type="text"
                              className={`${inputClass} w-32`}
                              placeholder="Nº certificado"
                              value={row.certificateNumber}
                              onChange={(e) => updateWithholdingRow(row.key, { certificateNumber: e.target.value })}
                            />
                            <button
                              type="button"
                              onClick={() => removeWithholdingRow(row.key)}
                              className="text-slate-500 hover:text-red-600 dark:hover:text-red-400"
                            >
                              ✕
                            </button>
                            {regime?.jurisdiction && (
                              <span className="text-xs text-slate-500">{regime.jurisdiction}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex justify-between border-t border-slate-200 dark:border-slate-800 pt-2 text-xs">
                      <span className="text-slate-500">
                        Pagás ${amount.toFixed(2)} + retenés ${totalWithheld.toFixed(2)} =
                      </span>
                      <span
                        className={`font-semibold ${
                          appliedAmount > Number(data.balanceDue)
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-slate-800 dark:text-slate-200'
                        }`}
                      >
                        ${appliedAmount.toFixed(2)} aplicado a la factura
                      </span>
                    </div>

                    {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setPaying(false);
                          setWithholdingRows([]);
                          setPayMode('CASH');
                          setEndorseCheckId('');
                        }}
                        className="rounded-lg px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setError('');
                          paymentMutation.mutate();
                        }}
                        disabled={
                          paymentMutation.isPending ||
                          !(appliedAmount > 0) ||
                          appliedAmount > Number(data.balanceDue) ||
                          (payMode === 'ENDORSE' && !endorseCheckId) ||
                          (payMode === 'OWN_CHECK' &&
                            (!ownCheck.number.trim() ||
                              !ownCheck.bankName.trim() ||
                              !ownCheck.issueDate ||
                              !ownCheck.dueDate ||
                              !ownCheck.financialAccountId))
                        }
                        className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
                      >
                        {paymentMutation.isPending ? 'Registrando...' : 'Confirmar pago'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setPaying(true)}
                    className="mt-3 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-green-500"
                  >
                    Registrar pago
                  </button>
                ))}
            </section>
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
