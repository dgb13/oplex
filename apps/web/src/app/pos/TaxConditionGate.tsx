'use client';

import { tenantSettingsApi } from '@/lib/tenantSettings';
import { useQuery } from '@tanstack/react-query';
import { Receipt } from 'lucide-react';
import Link from 'next/link';

/**
 * Sin condición frente al IVA no se sabe si corresponde Factura A/B o C
 * (antes el POS emitía B por defecto, mal para un monotributista). En vez
 * de dejar armar una venta y frenarla recién al cobrar - con el cliente
 * esperando - el POS directamente no se abre: muestra qué falta y lleva a
 * cargarlo. Mientras carga la configuración, deja pasar (no parpadea).
 */
export default function TaxConditionGate({ children }: { children: React.ReactNode }) {
  const { data, isSuccess } = useQuery({ queryKey: ['tenant-settings'], queryFn: tenantSettingsApi.get });

  if (!isSuccess || data?.ownTaxCondition) return <>{children}</>;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-slate-900 pos-dark:bg-slate-950 pos-dark:text-slate-100">
      <div className="flex max-w-md flex-col items-center gap-4 rounded-2xl border border-amber-300 bg-white p-8 text-center shadow-sm pos-dark:border-amber-900 pos-dark:bg-slate-900">
        <span className="grid h-12 w-12 place-items-center rounded-full bg-amber-100 text-amber-700 pos-dark:bg-amber-950 pos-dark:text-amber-300">
          <Receipt className="h-6 w-6" aria-hidden />
        </span>
        <h1 className="text-lg font-semibold">Antes de usar el punto de venta, cargá tu condición frente al IVA</h1>
        <p className="text-sm text-slate-600 pos-dark:text-slate-400">
          Sin ella Oplex no sabe si te corresponde Factura A, B o C, y podría emitir una factura equivocada. Se carga una
          sola vez y tarda un minuto.
        </p>
        <Link
          href="/accounting/arca"
          className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
        >
          Cargarla ahora
        </Link>
        <Link href="/dashboard" className="text-xs text-slate-500 underline hover:text-slate-700 pos-dark:text-slate-400">
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}
