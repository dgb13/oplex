'use client';

import { pointOfSaleSystemNames } from '@/components/arca/PointOfSaleHelpModal';
import { Button, buttonVariants } from '@/components/ui/button';
import { companiesApi } from '@/lib/companies';
import { tenantSettingsApi, type PointOfSaleNotEnabledError } from '@/lib/tenantSettings';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import Link from 'next/link';
import { useState } from 'react';

/** El 502 de facturar con un punto de venta que no es de Web Services trae
 * los habilitados (ver RealElectronicInvoicingService); null si es otro error. */
export function pointOfSaleNotEnabled(err: unknown): PointOfSaleNotEnabledError | null {
  const data = (err as AxiosError<Partial<PointOfSaleNotEnabledError>>)?.response?.data;
  return data?.code === 'ARCA_POINT_OF_SALE_NOT_ENABLED' ? (data as PointOfSaleNotEnabledError) : null;
}

function pad(n: number | string): string {
  return String(n).padStart(5, '0');
}

/**
 * Aviso al facturar (Nueva factura, Convertir cotización) cuando ARCA
 * rechaza el punto de venta de la sucursal: dice cuáles sí sirven y deja
 * corregir la sucursal ahí mismo, sin ir a Conexión con ARCA.
 */
export function PointOfSaleErrorNotice({ error }: { error: PointOfSaleNotEnabledError }) {
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ['tenant-settings'], queryFn: tenantSettingsApi.get });
  const onlineName = pointOfSaleSystemNames(settings?.ownTaxCondition).online.startsWith('Factura')
    ? 'Factura en línea'
    : 'Comprobantes en línea';
  const [fixed, setFixed] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const suggested = error.enabledPointsOfSale[0];

  async function applySuggested() {
    if (!error.branch || suggested === undefined) return;
    setSaving(true);
    setSaveError('');
    try {
      await companiesApi.update(error.branch.id, { pointOfSaleNumber: String(suggested) });
      void queryClient.invalidateQueries({ queryKey: ['companies'] });
      setFixed(suggested);
    } catch (err) {
      const message = (err as AxiosError<{ message?: string | string[] }>)?.response?.data?.message;
      setSaveError(
        (Array.isArray(message) ? message.join(', ') : message) ??
          'No se pudo cambiar el punto de venta. Pedíselo a quien administra la empresa.',
      );
    } finally {
      setSaving(false);
    }
  }

  if (fixed !== null && error.branch) {
    return (
      <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 py-3 text-left text-[13px] text-slate-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-slate-100 pos-dark:border-emerald-900 pos-dark:bg-emerald-950/60 pos-dark:text-slate-100 pos-contrast:border-emerald-700 pos-contrast:bg-black pos-contrast:text-white">
        <b className="text-emerald-700 dark:text-emerald-400 pos-dark:text-emerald-400 pos-contrast:text-emerald-300">✓ Listo:</b> {error.branch.name} ahora factura con el punto de
        venta <b className="font-mono">{pad(fixed)}</b>. Volvé a tocar el botón para facturar.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-red-300 bg-red-50 px-3.5 py-3 text-left text-[13px] text-slate-800 dark:border-red-900 dark:bg-red-950/40 dark:text-slate-100 pos-dark:border-red-900 pos-dark:bg-red-950/60 pos-dark:text-slate-100 pos-contrast:border-red-600 pos-contrast:bg-black pos-contrast:text-white">
      <b className="text-red-700 dark:text-red-400 pos-dark:text-red-400 pos-contrast:text-red-400">
        No se pudo facturar: el punto de venta {pad(error.pointOfSale)} no es de Web Services.
      </b>
      <span>
        Es el de {onlineName} o no existe en ARCA.{' '}
        {error.enabledPointsOfSale.length > 0 ? (
          <>
            Puntos de venta habilitados para Web Services:{' '}
            {error.enabledPointsOfSale.map((n, i) => (
              <span key={n}>
                {i > 0 && ', '}
                <b className="font-mono">{pad(n)}</b>
              </span>
            ))}
            .
          </>
        ) : (
          'ARCA no informa ningún punto de venta de Web Services para tu CUIT: hay que crear uno.'
        )}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        {error.branch && suggested !== undefined && (
          <Button type="button" size="sm" onClick={applySuggested} disabled={saving}>
            {saving ? 'Guardando…' : `Usar ${pad(suggested)} en ${error.branch.name}`}
          </Button>
        )}
        <Link href="/arca#paso-5" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          {error.enabledPointsOfSale.length > 0 ? 'Ir a Conexión con ARCA · paso 5' : 'Ver cómo crear uno'}
        </Link>
      </div>
      {saveError && <span className="text-destructive">{saveError}</span>}
      <span className="text-xs opacity-75">No se emitió la factura. Corregí el punto de venta y volvé a intentar.</span>
    </div>
  );
}
