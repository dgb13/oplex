import { Injectable } from '@nestjs/common';
import type { PriceIndexMonthlyVariation, PriceIndexSourcePort } from './price-index-source.port.js';

/**
 * Wired in sólo cuando PRICE_INDEX_SOURCE_STUB=true (ver accounting.module.ts)
 * - destraba probar "Sincronizar ahora" en desarrollo local sin depender de
 * la red. Determinístico, mismo criterio que StubBnaExchangeRateService.
 */
@Injectable()
export class StubPriceIndexService implements PriceIndexSourcePort {
  async getMonthlyVariations(): Promise<PriceIndexMonthlyVariation[]> {
    return [
      { period: new Date(Date.UTC(2026, 6, 1)), variationPct: 2.1 },
      { period: new Date(Date.UTC(2026, 7, 1)), variationPct: 1.9 },
    ];
  }
}
