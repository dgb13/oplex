import { Module } from '@nestjs/common';
import { AccountingController } from './accounting.controller.js';
import { AccountingService } from './accounting.service.js';
import { InflationAdjustmentService } from './inflation-adjustment.service.js';
import { PRICE_INDEX_SOURCE, type PriceIndexSourcePort } from './price-index-source.port.js';
import { PriceIndexService } from './price-index.service.js';
import { RealArgentinaDatosPriceIndexService } from './real-argentinadatos-price-index.service.js';
import { StubPriceIndexService } from './stub-price-index.service.js';

@Module({
  controllers: [AccountingController],
  providers: [
    AccountingService,
    PriceIndexService,
    InflationAdjustmentService,
    RealArgentinaDatosPriceIndexService,
    StubPriceIndexService,
    // PRICE_INDEX_SOURCE_STUB=true pisa el fetch real por el mock
    // determinístico (ver StubPriceIndexService) - sólo para desarrollo
    // local sin red, nunca seteado en producción. Mismo criterio que
    // BNA_EXCHANGE_RATE en @plexo/invoicing.
    {
      provide: PRICE_INDEX_SOURCE,
      useFactory: (
        real: RealArgentinaDatosPriceIndexService,
        stub: StubPriceIndexService,
      ): PriceIndexSourcePort => (process.env['PRICE_INDEX_SOURCE_STUB'] === 'true' ? stub : real),
      inject: [RealArgentinaDatosPriceIndexService, StubPriceIndexService],
    },
  ],
  exports: [AccountingService, PriceIndexService, InflationAdjustmentService],
})
export class AccountingModule {}
