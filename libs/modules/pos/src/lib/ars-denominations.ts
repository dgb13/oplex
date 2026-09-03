/**
 * Denominaciones ARS vigentes (Fase 2 de Caja/POS, desglose de cierre estilo
 * Odoo) - misma fuente de verdad usada tanto para validar el desglose que
 * manda el cliente (DenominationBreakdownItemDto, en close-cash-session.dto.ts)
 * como para recalcular `countedAmount` en el servidor
 * (CashSessionsService.closeSession) - nunca sólo una lista de frontend, ver
 * el comentario ahí sobre por qué no se confía en el total que manda el
 * cliente. Moneda entera vigente > obsoleta, no se listan centavos.
 *
 * $100 existe hoy tanto en billete como en moneda en la Argentina real - por
 * eso cada denominación es un par `{ kind, value }`, no sólo un número: un
 * desglose de sólo `{ denomination, count }[]` no podría distinguir "5
 * billetes de $100" de "5 monedas de $100" al re-mostrar el desglose en
 * /pos/history (el total sumado da igual en ambos casos, pero la fila
 * individual se perdería) - por eso DenominationBreakdownItemDto lleva
 * `kind` además de `denomination`, pequeño ajuste sobre el DTO tal cual
 * estaba escrito en el plan original.
 */
export type DenominationKind = 'BILL' | 'COIN';

export interface ArsDenomination {
  kind: DenominationKind;
  value: number;
}

export const ARS_BILL_VALUES: readonly number[] = [20000, 10000, 2000, 1000, 500, 200, 100];
export const ARS_COIN_VALUES: readonly number[] = [100, 50, 20, 10];

/** Billetes primero, después monedas - mismo orden en que se muestran las
 * filas del desglose en CloseSessionModal. */
export const ARS_DENOMINATIONS: readonly ArsDenomination[] = [
  ...ARS_BILL_VALUES.map((value) => ({ kind: 'BILL' as const, value })),
  ...ARS_COIN_VALUES.map((value) => ({ kind: 'COIN' as const, value })),
];

/** Todos los valores posibles (billetes + monedas, sin duplicar 100) - sólo
 * para una validación laxa de "es un valor de denominación ARS válido" a
 * nivel de DTO (`@IsIn`). La validación estricta kind+value la hace
 * `isValidArsDenomination` desde CashSessionsService.closeSession. */
export const ARS_DENOMINATION_VALUES: readonly number[] = Array.from(
  new Set([...ARS_BILL_VALUES, ...ARS_COIN_VALUES]),
);

export function isValidArsDenomination(kind: DenominationKind, value: number): boolean {
  return ARS_DENOMINATIONS.some((d) => d.kind === kind && d.value === value);
}
