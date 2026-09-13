'use client';

import { Button } from '@/components/ui/button';
import { taxesApi, type TaxCalculationType, type TaxDefinition } from '@/lib/taxes';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import NewTaxDefinitionModal from './NewTaxDefinitionModal';
import ReviseTaxDefinitionModal from './ReviseTaxDefinitionModal';

const CALC_TYPE_LABELS: Record<TaxCalculationType, string> = {
  PERCENTAGE: 'Porcentual',
  FIXED_AMOUNT: 'Monto fijo',
  FORMULA: 'Fórmula',
  EXENTO: 'Exento de IVA',
  NO_GRAVADO: 'No gravado',
};

function formatValue(def: TaxDefinition): string {
  if (def.calculationType === 'PERCENTAGE') return def.rate ? `${def.rate}%` : '—';
  if (def.calculationType === 'FIXED_AMOUNT') return def.fixedAmount ? `$${def.fixedAmount}` : '—';
  if (def.calculationType === 'EXENTO' || def.calculationType === 'NO_GRAVADO') return '—';
  return def.formula ?? '—';
}

export default function TaxDefinitionsTab() {
  const [newOpen, setNewOpen] = useState(false);
  const [revising, setRevising] = useState<TaxDefinition | null>(null);

  const { data: definitions, isLoading, error } = useQuery({
    queryKey: ['tax-definitions'],
    queryFn: taxesApi.listTaxDefinitions,
  });

  const sorted = [...(definitions ?? [])].sort((a, b) => {
    if (a.code !== b.code) return a.code.localeCompare(b.code);
    return new Date(b.validFrom).getTime() - new Date(a.validFrom).getTime();
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button type="button" onClick={() => setNewOpen(true)}>
          + Nuevo impuesto
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando...</p>
      ) : error ? (
        <p className="text-sm text-destructive">Error al cargar los impuestos</p>
      ) : sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin impuestos definidos</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-muted-foreground">
                <th className="p-3">Código</th>
                <th className="p-3">Nombre</th>
                <th className="p-3">Tipo</th>
                <th className="p-3">Valor</th>
                <th className="p-3">Vigencia</th>
                <th className="p-3">Contador</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((def) => {
                const active = def.validTo === null;
                return (
                  <tr key={def.id} className="border-b border-border/50">
                    <td className="p-3 font-mono text-xs">{def.code}</td>
                    <td className="p-3">{def.name}</td>
                    <td className="p-3 text-muted-foreground">{CALC_TYPE_LABELS[def.calculationType]}</td>
                    <td className="p-3">{formatValue(def)}</td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {new Date(def.validFrom).toLocaleDateString('es-AR')} —{' '}
                      {active ? (
                        <span className="text-emerald-600 dark:text-emerald-400">vigente</span>
                      ) : (
                        new Date(def.validTo as string).toLocaleDateString('es-AR')
                      )}
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {def.managedByAccountant ? 'Delegado' : '—'}
                    </td>
                    <td className="p-3 text-right">
                      {active && (
                        <button
                          onClick={() => setRevising(def)}
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

      {newOpen && <NewTaxDefinitionModal onClose={() => setNewOpen(false)} />}
      {revising && <ReviseTaxDefinitionModal definition={revising} onClose={() => setRevising(null)} />}
    </div>
  );
}
