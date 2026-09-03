import type { DenominationKind } from '@/lib/pos';

// Misma lista que libs/modules/pos/src/lib/ars-denominations.ts (backend) -
// duplicada a propósito: el backend es la fuente de verdad real que valida
// y recalcula el total (nunca confía en lo que arma esta pantalla), esta
// copia sólo sirve para dibujar las filas del desglose. $100 existe como
// billete y como moneda a la vez, por eso cada denominación es un par
// {kind, value}.
export interface ArsDenomination {
  kind: DenominationKind;
  value: number;
}

export const ARS_BILL_VALUES = [20000, 10000, 2000, 1000, 500, 200, 100] as const;
export const ARS_COIN_VALUES = [100, 50, 20, 10] as const;

export const ARS_DENOMINATIONS: ArsDenomination[] = [
  ...ARS_BILL_VALUES.map((value) => ({ kind: 'BILL' as const, value })),
  ...ARS_COIN_VALUES.map((value) => ({ kind: 'COIN' as const, value })),
];
