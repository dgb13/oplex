import { Module } from '@nestjs/common';
import { CashRegistersService } from './cash-registers.service.js';
import { CashSessionsService } from './cash-sessions.service.js';

// Sin controller propio a propósito: la venta (PosService.checkout) necesita
// componer con @plexo/invoicing/@plexo/accounting/@plexo/reports-financial vía
// SalesService (regla del repo: un lib module nunca importa el Service de
// otro), así que la HTTP surface completa de Caja/POS vive en la
// composición-root apps/api/src/app/pos/ - mismo criterio que
// @plexo/bank-reconciliation y @plexo/treasury.
@Module({
  providers: [CashRegistersService, CashSessionsService],
  exports: [CashRegistersService, CashSessionsService],
})
export class PosModule {}
