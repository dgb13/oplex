-- AlterTable
ALTER TABLE "financial_accounts" ADD COLUMN     "currencyId" TEXT,
ADD COLUMN     "lastRevaluationRate" DECIMAL(18,6);

-- AddForeignKey
ALTER TABLE "financial_accounts" ADD CONSTRAINT "financial_accounts_currencyId_fkey" FOREIGN KEY ("currencyId") REFERENCES "currencies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
