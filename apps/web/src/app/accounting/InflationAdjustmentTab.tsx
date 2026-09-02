'use client';

import { accountingApi } from '@/lib/accounting';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';

function extractErrorMessage(err: unknown, fallback: string): string {
  const message = (err as AxiosError<{ message?: string | string[] }> | undefined)?.response?.data?.message;
  if (!message) return fallback;
  return Array.isArray(message) ? message.join(', ') : message;
}

function formatMonth(iso: string): string {
  return new Date(iso).toLocaleDateString('es-AR', { timeZone: 'UTC', year: 'numeric', month: 'long' });
}

const inputClass =
  'rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500';

/** Vista previa (método del activo y pasivo monetario neto, RT6/NC39) +
 * emisión del asiento definitivo (Fase 2). Requiere que "Índices de
 * Inflación" (Admin) tenga cargado cada mes del rango elegido, sin huecos. */
export default function InflationAdjustmentTab() {
  const queryClient = useQueryClient();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [error, setError] = useState('');
  const [confirmingPost, setConfirmingPost] = useState(false);
  const [postError, setPostError] = useState('');
  const [postedResult, setPostedResult] = useState<string | null>(null);

  const adjustmentsQuery = useQuery({
    queryKey: ['inflation-adjustments'],
    queryFn: accountingApi.listInflationAdjustments,
  });

  const previewMutation = useMutation({
    mutationFn: () => accountingApi.getInflationAdjustmentPreview(`${from}-01`, `${to}-01`),
    onSuccess: () => {
      setPostedResult(null);
      setConfirmingPost(false);
    },
    onError: (err) => setError(extractErrorMessage(err, 'No se pudo calcular la vista previa')),
  });

  const postMutation = useMutation({
    mutationFn: () => accountingApi.postInflationAdjustment(`${from}-01`, `${to}-01`),
    onSuccess: (result) => {
      setPostError('');
      setConfirmingPost(false);
      setPostedResult(
        result.journalEntry
          ? `Asiento emitido - RECPAM ${Number(result.adjustment.recpamAmount).toFixed(2)}.`
          : 'Período registrado - el RECPAM dio exactamente $0.00, no hizo falta postear ningún asiento.',
      );
      void queryClient.invalidateQueries({ queryKey: ['inflation-adjustments'] });
      void queryClient.invalidateQueries({ queryKey: ['accounting-trial-balance'] });
      void queryClient.invalidateQueries({ queryKey: ['accounting-accounts'] });
    },
    onError: (err) => {
      setConfirmingPost(false);
      setPostError(extractErrorMessage(err, 'No se pudo emitir el asiento'));
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!from || !to) {
      setError('Elegí el mes de inicio y el mes de cierre');
      return;
    }
    previewMutation.mutate();
  }

  const preview = previewMutation.data;
  const recpam = preview ? Number(preview.recpam) : null;
  const adjustments = adjustmentsQuery.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-4">
        <p className="mb-3 text-xs text-slate-500">
          Método del activo y pasivo monetario neto. El saldo de apertura se toma valuado al nivel de
          precios del mes de inicio, y cada movimiento posterior se reexpresa con el índice de su
          propio mes - hace falta tener cargado el índice de todos los meses del rango en
          "Índices de Inflación" (Admin), sin huecos.
        </p>
        <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-400">
            Desde
            <input type="month" className={inputClass} value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-400">
            Hasta
            <input type="month" className={inputClass} value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <button
            type="submit"
            disabled={previewMutation.isPending}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
          >
            {previewMutation.isPending ? 'Calculando...' : 'Calcular vista previa'}
          </button>
        </form>
        {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
      </div>

      {preview && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-4">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              {formatMonth(preview.from)} → {formatMonth(preview.to)}
            </h2>
            <div className="flex items-center gap-4">
              {recpam !== null && (
                <div className="text-right">
                  <p className="text-xs text-slate-500">RECPAM ({recpam > 0 ? 'Pérdida' : recpam < 0 ? 'Ganancia' : 'Neutro'})</p>
                  <p
                    className={`text-lg font-semibold ${
                      recpam > 0
                        ? 'text-red-600 dark:text-red-400'
                        : recpam < 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-slate-900 dark:text-slate-100'
                    }`}
                  >
                    ${Math.abs(recpam).toFixed(2)}
                  </p>
                </div>
              )}
              {!postedResult && (
                confirmingPost ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">¿Confirmás? Es un asiento real e inmutable.</span>
                    <button
                      type="button"
                      onClick={() => postMutation.mutate()}
                      disabled={postMutation.isPending}
                      className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-500 disabled:opacity-50"
                    >
                      {postMutation.isPending ? 'Emitiendo...' : 'Confirmar emisión'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingPost(false)}
                      className="text-xs text-slate-500 transition hover:text-slate-700 dark:hover:text-slate-300"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmingPost(true)}
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
                  >
                    Emitir asiento definitivo
                  </button>
                )
              )}
            </div>
          </div>
          {postError && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{postError}</p>}
          {postedResult && <p className="mb-3 text-sm text-emerald-600 dark:text-emerald-400">{postedResult}</p>}

          {preview.rows.length === 0 ? (
            <p className="text-sm text-slate-400 dark:text-slate-600">
              No hay cuentas monetarias clasificadas - revisá "Tipo de partida" en Plan de Cuentas.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-xs text-slate-500">
                    <th className="pb-2 pr-4">Código</th>
                    <th className="pb-2 pr-4">Cuenta</th>
                    <th className="pb-2 pr-4 text-right">Apertura</th>
                    <th className="pb-2 pr-4 text-right">Movimientos</th>
                    <th className="pb-2 pr-4 text-right">Saldo nominal</th>
                    <th className="pb-2 pr-4 text-right">Saldo reexpresado</th>
                    <th className="pb-2 text-right">Aporte al RECPAM</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row) => (
                    <tr key={row.accountId} className="border-b border-slate-200/50 dark:border-slate-800/50">
                      <td className="py-2 pr-4 font-mono text-xs text-slate-600 dark:text-slate-400">{row.code}</td>
                      <td className="py-2 pr-4 text-slate-800 dark:text-slate-200">{row.name}</td>
                      <td className="py-2 pr-4 text-right text-slate-700 dark:text-slate-300">
                        ${Number(row.openingBalance).toFixed(2)}
                      </td>
                      <td className="py-2 pr-4 text-right text-slate-700 dark:text-slate-300">
                        ${Number(row.movementsNominal).toFixed(2)}
                      </td>
                      <td className="py-2 pr-4 text-right text-slate-700 dark:text-slate-300">
                        ${Number(row.closingBalanceNominal).toFixed(2)}
                      </td>
                      <td className="py-2 pr-4 text-right text-slate-700 dark:text-slate-300">
                        ${Number(row.closingBalanceReexpressed).toFixed(2)}
                      </td>
                      <td className="py-2 text-right font-medium text-slate-900 dark:text-slate-100">
                        ${Number(row.contribution).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Ajustes ya emitidos</h2>
        {adjustmentsQuery.isLoading ? (
          <p className="text-sm text-slate-500">Cargando...</p>
        ) : adjustments.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-600">Todavía no se emitió ningún ajuste.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-xs text-slate-500">
                <th className="pb-2 pr-4">Período</th>
                <th className="pb-2 pr-4 text-right">RECPAM</th>
                <th className="pb-2">Emitido</th>
              </tr>
            </thead>
            <tbody>
              {adjustments.map((adj) => (
                <tr key={adj.id} className="border-b border-slate-200/50 dark:border-slate-800/50">
                  <td className="py-2 pr-4 text-slate-800 dark:text-slate-200">
                    {formatMonth(adj.periodFrom)} → {formatMonth(adj.periodTo)}
                  </td>
                  <td className="py-2 pr-4 text-right text-slate-700 dark:text-slate-300">
                    ${Number(adj.recpamAmount).toFixed(2)}
                  </td>
                  <td className="py-2 text-slate-600 dark:text-slate-400">
                    {new Date(adj.createdAt).toLocaleDateString('es-AR')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
