'use client';

import type { TenantTaxCondition } from '@/lib/tenantSettings';
import { CONDITION_WORD, formatMoney, realUnitCost, vatRecoverable } from '@/lib/vatCost';
import Link from 'next/link';

/** "sin IVA / con IVA" al lado de un campo de costo. */
export function CostVatToggle({
  includesVat,
  onChange,
  disabled,
}: {
  includesVat: boolean;
  onChange: (includesVat: boolean) => void;
  disabled?: boolean;
}) {
  const option = (value: boolean, label: string) => (
    <button
      type="button"
      onClick={() => onChange(value)}
      disabled={disabled}
      aria-pressed={includesVat === value}
      className={`px-2 py-0.5 text-xs transition disabled:opacity-50 ${
        includesVat === value ? 'bg-primary font-semibold text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {label}
    </button>
  );
  return (
    <span className="inline-flex overflow-hidden rounded-md border border-border" role="group" aria-label="El costo está">
      {option(false, 'sin IVA')}
      <span className="w-px bg-border" aria-hidden />
      {option(true, 'con IVA')}
    </span>
  );
}

/**
 * Lo que va a guardar Oplex como costo real y por qué (boceto aprobado,
 * "Costos e IVA"). Sin condición frente al IVA cargada, avisa que se guarda
 * tal cual.
 */
export function RealCostNote({
  amount,
  includesVat,
  vatRate,
  condition,
  extra,
}: {
  amount: number;
  includesVat: boolean;
  vatRate: number;
  condition: TenantTaxCondition | null;
  extra?: React.ReactNode;
}) {
  const recoverable = vatRecoverable(condition);
  if (recoverable === null) {
    return (
      <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
        Se guarda <b>{formatMoney(amount)}</b> tal cual lo escribiste: falta tu condición frente al IVA para saber si
        sumarle o sacarle el IVA. {extra}
      </div>
    );
  }
  const real = realUnitCost(amount, includesVat, vatRate, condition);
  const changed = Math.abs(real - amount) > 0.004;
  const why = recoverable ? 'porque el IVA lo recuperás' : `porque como ${condition ? CONDITION_WORD[condition] : ''} no recuperás el IVA`;
  return (
    <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-foreground">
      Costo real que guarda Oplex: <b className="tabular-nums">{formatMoney(real)}</b> ({recoverable ? 'sin IVA' : 'con IVA'},{' '}
      {why})
      <span className="mt-0.5 block text-muted-foreground">
        {changed
          ? `Escribiste ${formatMoney(amount)} ${includesVat ? 'con' : 'sin'} IVA → ${recoverable ? 'se le saca' : 'se le suma'} el ${vatRate.toLocaleString('es-AR')} %.`
          : 'Coincide con lo que escribiste.'}{' '}
        {extra}
      </span>
    </div>
  );
}

/** Aviso para cargar la condición frente al IVA (sin ella no se puede
 * calcular el costo real). */
export function MissingTaxConditionBanner() {
  return (
    <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
      <b>Falta tu condición frente al IVA.</b> Cargala en{' '}
      <Link href="/accounting/arca" className="underline">
        Contabilidad → ARCA → Datos de la empresa
      </Link>{' '}
      para que Oplex calcule bien costos y ganancias. Mientras tanto, los costos se guardan tal cual los escribís.
    </div>
  );
}

/** Etiqueta del precio de venta: (sin IVA) para RI, (final) para quien
 * factura C; nada si no se sabe. */
export function priceTag(condition: TenantTaxCondition | null): string | null {
  const recoverable = vatRecoverable(condition);
  if (recoverable === null) return null;
  return recoverable ? 'sin IVA' : 'final';
}
