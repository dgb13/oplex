'use client';

import { Button } from '@/components/ui/button';
import {
  ARGENTINE_JURISDICTION_LABELS,
  WITHHOLDING_TAX_TYPE_LABELS,
  withholdingRegimesApi,
  type WithholdingRegime,
} from '@/lib/taxes';
import { tenantSettingsApi } from '@/lib/tenantSettings';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import NewWithholdingRegimeModal from './NewWithholdingRegimeModal';
import ReviseWithholdingRegimeModal from './ReviseWithholdingRegimeModal';

/** Mirrors TaxDefinitionsTab's table/modal shape exactly (same
 * versioning UX: "Revisar" closes the active row and opens a new one) -
 * see WithholdingRegimeService on the backend for why. */
export default function WithholdingRegimesTab() {
  const [newOpen, setNewOpen] = useState(false);
  const [revising, setRevising] = useState<WithholdingRegime | null>(null);

  const { data: settings } = useQuery({
    queryKey: ['tenant-settings'],
    queryFn: tenantSettingsApi.get,
  });
  const { data: regimes, isLoading, error } = useQuery({
    queryKey: ['withholding-regimes'],
    queryFn: withholdingRegimesApi.list,
  });

  const noAgentEnabled =
    settings != null &&
    !settings.withholdingAgentIncomeTax &&
    !settings.withholdingAgentVat &&
    !settings.withholdingAgentGrossIncome;

  const sorted = [...(regimes ?? [])].sort((a, b) => {
    if (a.code !== b.code) return a.code.localeCompare(b.code);
    return new Date(b.validFrom).getTime() - new Date(a.validFrom).getTime();
  });

  return (
    <div className="flex flex-col gap-4">
      {noAgentEnabled && (
        <p className="rounded-lg bg-amber-100 dark:bg-amber-900/40 p-3 text-xs text-amber-700 dark:text-amber-400">
          Todavía no marcaste ningún carácter de agente de retención en Preferencias — un régimen que
          crees acá no se va a poder aplicar hasta que lo hagas.
        </p>
      )}

      <div className="flex justify-end">
        <Button type="button" onClick={() => setNewOpen(true)}>
          + Nuevo régimen
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando...</p>
      ) : error ? (
        <p className="text-sm text-destructive">Error al cargar los regímenes</p>
      ) : sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin regímenes de retención definidos</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-muted-foreground">
                <th className="p-3">Código</th>
                <th className="p-3">Nombre</th>
                <th className="p-3">Impuesto</th>
                <th className="p-3">Jurisdicción</th>
                <th className="p-3">Tasa</th>
                <th className="p-3">Mínimo no imponible</th>
                <th className="p-3">Vigencia</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((regime) => {
                const active = regime.validTo === null;
                return (
                  <tr key={regime.id} className="border-b border-border/50">
                    <td className="p-3 font-mono text-xs">{regime.code}</td>
                    <td className="p-3">{regime.name}</td>
                    <td className="p-3 text-muted-foreground">{WITHHOLDING_TAX_TYPE_LABELS[regime.taxType]}</td>
                    <td className="p-3 text-muted-foreground">
                      {regime.jurisdiction ? ARGENTINE_JURISDICTION_LABELS[regime.jurisdiction] : '—'}
                    </td>
                    <td className="p-3">{regime.rate}%</td>
                    <td className="p-3">${regime.minTaxableAmount}</td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {new Date(regime.validFrom).toLocaleDateString('es-AR')} —{' '}
                      {active ? (
                        <span className="text-emerald-600 dark:text-emerald-400">vigente</span>
                      ) : (
                        new Date(regime.validTo as string).toLocaleDateString('es-AR')
                      )}
                    </td>
                    <td className="p-3 text-right">
                      {active && (
                        <button
                          onClick={() => setRevising(regime)}
                          className="text-xs font-medium text-primary hover:text-primary/80"
                        >
                          Revisar
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {newOpen && <NewWithholdingRegimeModal onClose={() => setNewOpen(false)} />}
      {revising && <ReviseWithholdingRegimeModal regime={revising} onClose={() => setRevising(null)} />}
    </div>
  );
}
