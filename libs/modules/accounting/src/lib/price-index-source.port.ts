export interface PriceIndexMonthlyVariation {
  /** Primer día del mes, ej. 2026-08-01. */
  period: Date;
  /** % de variación mensual (ej. 2.8 = 2,8%). */
  variationPct: number;
}

/**
 * Fuente externa de la variación mensual de precios (IPC) para el Ajuste
 * por Inflación (RT6/NC39). Puerto separado del dato en sí para poder
 * mockearlo en dev/test sin depender de la red - mismo criterio que
 * BnaExchangeRatePort en @plexo/invoicing.
 */
export interface PriceIndexSourcePort {
  getMonthlyVariations(): Promise<PriceIndexMonthlyVariation[]>;
}

export const PRICE_INDEX_SOURCE = Symbol('PRICE_INDEX_SOURCE');

export class PriceIndexLookupError extends Error {
  constructor(
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'PriceIndexLookupError';
  }
}
