import { Module } from '@nestjs/common';
import { BankReconciliationService } from './bank-reconciliation.service.js';

// Sin controller propio a propósito: la HTTP surface de Conciliación
// Bancaria necesita componer con @plexo/reports-financial/@plexo/accounting
// (regla del repo: un lib module nunca importa el Service de otro), así
// que vive entera en la composición-root apps/api/src/app/bank-reconciliation/
// - mismo criterio que @plexo/treasury.
@Module({
  providers: [BankReconciliationService],
  exports: [BankReconciliationService],
})
export class BankReconciliationModule {}
