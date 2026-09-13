'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
      <Card>
        <CardContent>
        <p className="mb-3 text-xs text-muted-foreground">
          Método del activo y pasivo monetario neto. El saldo de apertura se toma valuado al nivel de
          precios del mes de inicio, y cada movimiento posterior se reexpresa con el índice de su
          propio mes - hace falta tener cargado el índice de todos los meses del rango en
          "Índices de Inflación" (Admin), sin huecos.
        </p>
        <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm text-muted-foreground">
            Desde
            <Input type="month" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-sm text-muted-foreground">
            Hasta
            <Input type="month" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <Button type="submit" disabled={previewMutation.isPending}>
            {previewMutation.isPending ? 'Calculando...' : 'Calcular vista previa'}
          </Button>
        </form>
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      {preview && (
        <Card>
          <CardContent>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold">
              {formatMonth(preview.from)} → {formatMonth(preview.to)}
            </h2>
            <div className="flex items-center gap-4">
              {recpam !== null && (
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">RECPAM ({recpam > 0 ? 'Pérdida' : recpam < 0 ? 'Ganancia' : 'Neutro'})</p>
                  <p
                    className={`text-lg font-semibold ${
                      recpam > 0
                        ? 'text-destructive'
                        : recpam < 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : ' '
                    }`}
                  >
                    ${Math.abs(recpam).toFixed(2)}
                  </p>
                </div>
              )}
              {!postedResult && (
                confirmingPost ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">¿Confirmás? Es un asiento real e inmutable.</span>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => postMutation.mutate()}
                      disabled={postMutation.isPending}
                      className="bg-red-700 text-white hover:bg-red-600"
                    >
                      {postMutation.isPending ? 'Emitiendo...' : 'Confirmar emisión'}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmingPost(false)}>
                      Cancelar
                    </Button>
                  </div>
                ) : (
                  <Button type="button" onClick={() => setConfirmingPost(true)}>
                    Emitir asiento definitivo
                  </Button>
                )
              )}
            </div>
          </div>
          {postError && <p className="mb-3 text-sm text-destructive">{postError}</p>}
          {postedResult && <p className="mb-3 text-sm text-emerald-600 dark:text-emerald-400">{postedResult}</p>}

          {preview.rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No hay cuentas monetarias clasificadas - revisá "Tipo de partida" en Plan de Cuentas.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
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
                    <tr key={row.accountId} className="border-b border-border/50">
                      <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">{row.code}</td>
                      <td className="py-2 pr-4">{row.name}</td>
                      <td className="py-2 pr-4 text-right">
                        ${Number(row.openingBalance).toFixed(2)}
                      </td>
                      <td className="py-2 pr-4 text-right">
                        ${Number(row.movementsNominal).toFixed(2)}
                      </td>
                      <td className="py-2 pr-4 text-right">
                        ${Number(row.closingBalanceNominal).toFixed(2)}
                      </td>
                      <td className="py-2 pr-4 text-right">
                        ${Number(row.closingBalanceReexpressed).toFixed(2)}
                      </td>
                      <td className="py-2 text-right font-medium">
                        ${Number(row.contribution).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent>
        <h2 className="mb-3 text-sm font-semibold">Ajustes ya emitidos</h2>
        {adjustmentsQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando...</p>
        ) : adjustments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no se emitió ningún ajuste.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="pb-2 pr-4">Período</th>
                <th className="pb-2 pr-4 text-right">RECPAM</th>
                <th className="pb-2">Emitido</th>
              </tr>
            </thead>
            <tbody>
              {adjustments.map((adj) => (
                <tr key={adj.id} className="border-b border-border/50">
                  <td className="py-2 pr-4">
                    {formatMonth(adj.periodFrom)} → {formatMonth(adj.periodTo)}
                  </td>
                  <td className="py-2 pr-4 text-right">
                    ${Number(adj.recpamAmount).toFixed(2)}
                  </td>
                  <td className="py-2 text-muted-foreground">
                    {new Date(adj.createdAt).toLocaleDateString('es-AR')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        </CardContent>
      </Card>
    </div>
  );
}
