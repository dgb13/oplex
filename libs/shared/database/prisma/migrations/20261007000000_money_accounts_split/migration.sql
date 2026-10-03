-- Una cuenta contable por cada cuenta de dinero (antes todo iba a la cuenta
-- única "Caja"), cuenta puente "Cobranzas a depositar" y marca de tenant ya
-- migrado. La reclasificación del saldo de "Caja" la hace
-- AccountingService.ensureMoneyAccounts en la primera operación de dinero de
-- cada tenant (mismo código que los asientos nuevos).

-- AlterEnum
ALTER TYPE "FinancialAccountProvider" ADD VALUE 'PENDING_DEPOSIT';

-- AlterTable
ALTER TABLE "financial_accounts" ADD COLUMN     "accountingAccountId" TEXT;

-- AlterTable
ALTER TABLE "tenant_settings" ADD COLUMN     "moneyAccountsSplitAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "financial_accounts_tenantId_accountingAccountId_key" ON "financial_accounts"("tenantId", "accountingAccountId");

-- AddForeignKey
ALTER TABLE "financial_accounts" ADD CONSTRAINT "financial_accounts_tenantId_accountingAccountId_fkey" FOREIGN KEY ("tenantId", "accountingAccountId") REFERENCES "accounting_accounts"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
