'use client';

import { Input } from '@/components/ui/input';
import { productionPreferencesApi } from '@/lib/production';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useEffect, useState } from 'react';
import { ProductionPlanGateBanner, useProductionGate } from '../ProductionPlanGate';

/** Prefijo de numeración de Órdenes de producción - mismo patrón "por
 * usuario, propio, configurable" que ConfiguracionTab en Compras/
 * Cotizaciones (ver User.productionOrderPrefix). Sin estilo de PDF acá:
 * una Orden de producción no tiene descarga de PDF, a diferencia de
 * Pedidos de Cotización/Órdenes de Compra. */
export default function ProductionSettingsPage() {
  const gate = useProductionGate();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['production-preferences'],
    queryFn: productionPreferencesApi.get,
    enabled: gate.enabled,
  });

  const [productionOrderPrefix, setProductionOrderPrefix] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!data) return;
    setProductionOrderPrefix(data.productionOrderPrefix);
  }, [data]);

  const mutation = useMutation({
    mutationFn: () => productionPreferencesApi.update({ productionOrderPrefix }),
    onSuccess: () => {
      setError('');
      setMessage('Guardado');
      void queryClient.invalidateQueries({ queryKey: ['production-preferences'] });
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      setMessage('');
      const msg = err.response?.data?.message ?? 'No se pudo guardar';
      setError(Array.isArray(msg) ? msg.join(', ') : msg);
    },
  });

  if (gate.isLoading) {
    return null;
  }
  if (!gate.enabled) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-xl font-semibold">Configuración</h1>
        <ProductionPlanGateBanner planName={gate.planName} />
      </div>
    );
  }

  function preview(prefix: string, nextNumber: number): string {
    return `${prefix || '···'}-${String(nextNumber).padStart(6, '0')}`;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Configuración</h1>

      {isLoading || !data ? (
        <p className="text-sm text-muted-foreground">Cargando...</p>
      ) : (
        <div className="rounded-xl border bg-card p-6">
          <h2 className="mb-1 text-sm font-medium text-muted-foreground">
            Numeración de tus Órdenes de producción
          </h2>
          <p className="mb-4 text-xs text-muted-foreground">
            Cada usuario elige cómo identifica sus propias órdenes — cada uno lleva su numeración
            correlativa por separado.
          </p>
          <div className="max-w-xs">
            <label className="text-sm text-muted-foreground">Prefijo</label>
            <Input
              value={productionOrderPrefix}
              onChange={(e) => setProductionOrderPrefix(e.target.value.toUpperCase())}
              placeholder="OP"
              maxLength={12}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Así se verá: {preview(productionOrderPrefix, data.productionOrderNextNumber)}
            </p>
          </div>

          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
          {message && <p className="mt-3 text-sm text-green-600 dark:text-green-400">{message}</p>}
          <button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
          >
            {mutation.isPending ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      )}
    </div>
  );
}
