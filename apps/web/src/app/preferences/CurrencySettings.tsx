'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { invoicingApi, type Currency } from '@/lib/invoicing';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';

function errorMessage(err: unknown, fallback: string): string {
  const axiosErr = err as AxiosError<{ message?: string | string[] }>;
  const message = axiosErr.response?.data?.message ?? fallback;
  return Array.isArray(message) ? message.join(', ') : message;
}

/** "Monedas y Cotizaciones" en Preferencias - cierra el círculo del motor
 * multi-moneda (Currency/ExchangeRateHistory ya existían y se usaban en
 * Facturación/Cotizaciones/Compras, pero nadie podía dar de alta una moneda
 * ni cargar su cotización desde la UI). El sync con Banco Nación en sí
 * (horario/on-off) es global de la plataforma, no de este tenant - eso vive
 * en Admin → Cotizaciones USD (superadmin), no acá. */
export default function CurrencySettings() {
  const queryClient = useQueryClient();
  const currenciesQuery = useQuery({
    queryKey: ['invoicing-currencies'],
    queryFn: invoicingApi.listCurrencies,
  });
  const currencies = currenciesQuery.data ?? [];
  const baseCurrency = currencies.find((c) => c.isBase);

  const [addingCurrency, setAddingCurrency] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [manualRateByCurrency, setManualRateByCurrency] = useState<Record<string, string>>({});
  const [error, setError] = useState('');

  const invalidateCurrencies = () => queryClient.invalidateQueries({ queryKey: ['invoicing-currencies'] });

  const createCurrencyMutation = useMutation({
    mutationFn: () => invoicingApi.createCurrency({ code: newCode.trim().toUpperCase(), name: newName.trim() }),
    onSuccess: () => {
      setAddingCurrency(false);
      setNewCode('');
      setNewName('');
      setError('');
      void invalidateCurrencies();
    },
    onError: (err) => setError(errorMessage(err, 'No se pudo crear la moneda')),
  });

  const recordRateMutation = useMutation({
    mutationFn: ({ currencyId, rate }: { currencyId: string; rate: number }) =>
      invoicingApi.recordExchangeRate(currencyId, rate),
    onSuccess: () => {
      setError('');
      void invalidateCurrencies();
    },
    onError: (err) => setError(errorMessage(err, 'No se pudo guardar la cotización')),
  });

  const syncBnaMutation = useMutation({
    mutationFn: invoicingApi.syncBnaRate,
    onSuccess: () => {
      setError('');
      void invalidateCurrencies();
    },
    onError: (err) => setError(errorMessage(err, 'No se pudo sincronizar con Banco Nación')),
  });

  const historyQuery = useQuery({
    queryKey: ['exchange-rate-history', expandedHistoryId],
    queryFn: () => invoicingApi.getExchangeRateHistory(expandedHistoryId as string),
    enabled: !!expandedHistoryId,
  });

  return (
    <Card>
      <CardContent>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">Monedas y Cotizaciones</h2>
          <button
            type="button"
            onClick={() => setAddingCurrency((v) => !v)}
            className="text-xs text-primary hover:text-primary/80"
          >
            + nueva moneda
          </button>
        </div>

        {currenciesQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando...</p>
        ) : (
          <>
            <p className="mb-4 text-xs text-muted-foreground">
              Moneda base:{' '}
              <span className="font-medium text-foreground">
                {baseCurrency ? `${baseCurrency.code} — ${baseCurrency.name}` : '— sin configurar —'}
              </span>
            </p>

            {addingCurrency && (
              <div className="mb-4 flex items-end gap-2 rounded-lg border p-3">
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">Código (ISO)</span>
                  <Input
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value)}
                    maxLength={3}
                    placeholder="USD"
                    className="w-20 uppercase"
                  />
                </label>
                <label className="flex flex-1 flex-col gap-1">
                  <span className="text-xs text-muted-foreground">Nombre</span>
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Dólar estadounidense"
                  />
                </label>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => createCurrencyMutation.mutate()}
                  disabled={newCode.trim().length !== 3 || !newName.trim() || createCurrencyMutation.isPending}
                >
                  {createCurrencyMutation.isPending ? 'Creando...' : 'Crear'}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setAddingCurrency(false)}>
                  Cancelar
                </Button>
              </div>
            )}

            {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="pb-2 pr-4">Código</th>
                    <th className="pb-2 pr-4">Nombre</th>
                    <th className="pb-2 pr-4">Cotización vigente</th>
                    <th className="pb-2">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {currencies.map((currency) => (
                    <CurrencyRow
                      key={currency.id}
                      currency={currency}
                      manualRate={manualRateByCurrency[currency.id] ?? ''}
                      onManualRateChange={(v) =>
                        setManualRateByCurrency((prev) => ({ ...prev, [currency.id]: v }))
                      }
                      onSaveManualRate={() => {
                        const rate = Number(manualRateByCurrency[currency.id]);
                        if (rate > 0) {
                          recordRateMutation.mutate({ currencyId: currency.id, rate });
                        }
                      }}
                      savingRate={recordRateMutation.isPending}
                      onSyncBna={() => syncBnaMutation.mutate()}
                      syncingBna={syncBnaMutation.isPending}
                      historyOpen={expandedHistoryId === currency.id}
                      onToggleHistory={() =>
                        setExpandedHistoryId((prev) => (prev === currency.id ? null : currency.id))
                      }
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {expandedHistoryId && (
              <div className="mt-4 rounded-lg border p-3">
                <p className="mb-2 text-xs font-medium text-muted-foreground">Historial de cotizaciones</p>
                {historyQuery.isLoading ? (
                  <p className="text-xs text-muted-foreground">Cargando...</p>
                ) : !historyQuery.data || historyQuery.data.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Todavía no hay cotizaciones cargadas.</p>
                ) : (
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="text-muted-foreground">
                        <th className="pb-1 pr-4">Fecha</th>
                        <th className="pb-1">Cotización</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyQuery.data.map((entry) => (
                        <tr key={entry.id} className="border-t">
                          <td className="py-1 pr-4">{new Date(entry.effectiveAt).toLocaleString('es-AR')}</td>
                          <td className="py-1">{entry.rate}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function CurrencyRow({
  currency,
  manualRate,
  onManualRateChange,
  onSaveManualRate,
  savingRate,
  onSyncBna,
  syncingBna,
  historyOpen,
  onToggleHistory,
}: {
  currency: Currency;
  manualRate: string;
  onManualRateChange: (v: string) => void;
  onSaveManualRate: () => void;
  savingRate: boolean;
  onSyncBna: () => void;
  syncingBna: boolean;
  historyOpen: boolean;
  onToggleHistory: () => void;
}) {
  return (
    <tr className="border-t">
      <td className="py-2 pr-4 font-medium">{currency.code}</td>
      <td className="py-2 pr-4">{currency.name}</td>
      <td className="py-2 pr-4">{currency.latestRate ?? '— sin cargar —'}</td>
      <td className="py-2">
        {currency.isBase ? (
          <span className="text-muted-foreground">Moneda base</span>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {currency.code === 'USD' && (
              <Button type="button" variant="outline" size="xs" onClick={onSyncBna} disabled={syncingBna}>
                {syncingBna ? 'Sincronizando...' : 'Sincronizar con Banco Nación'}
              </Button>
            )}
            <Input
              type="number"
              step="any"
              placeholder="Cotización manual"
              value={manualRate}
              onChange={(e) => onManualRateChange(e.target.value)}
              className="w-32"
            />
            <Button type="button" size="xs" onClick={onSaveManualRate} disabled={savingRate || !manualRate}>
              Guardar
            </Button>
            <button type="button" onClick={onToggleHistory} className="text-xs text-primary hover:text-primary/80">
              {historyOpen ? 'Ocultar historial' : 'Ver historial'}
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}
