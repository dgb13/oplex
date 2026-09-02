-- CreateEnum
CREATE TYPE "BankStatementLineStatus" AS ENUM ('PENDING', 'MATCHED', 'IGNORED');

-- AlterTable
ALTER TABLE "journal_entries" ADD COLUMN     "bankStatementLineId" TEXT;

-- CreateTable
CREATE TABLE "bank_statement_imports" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "financialAccountId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "lineCount" INTEGER NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_statement_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_statement_lines" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "bankStatementImportId" TEXT NOT NULL,
    "financialAccountId" TEXT NOT NULL,
    "lineDate" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "status" "BankStatementLineStatus" NOT NULL DEFAULT 'PENDING',
    "matchedTransactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_statement_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bank_statement_imports_tenantId_idx" ON "bank_statement_imports"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "bank_statement_imports_tenantId_financialAccountId_fileHash_key" ON "bank_statement_imports"("tenantId", "financialAccountId", "fileHash");

-- CreateIndex
CREATE INDEX "bank_statement_lines_tenantId_idx" ON "bank_statement_lines"("tenantId");

-- CreateIndex
CREATE INDEX "bank_statement_lines_tenantId_financialAccountId_status_idx" ON "bank_statement_lines"("tenantId", "financialAccountId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "bank_statement_lines_tenantId_id_key" ON "bank_statement_lines"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "bank_statement_lines_matchedTransactionId_key" ON "bank_statement_lines"("matchedTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_bankStatementLineId_key" ON "journal_entries"("bankStatementLineId");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_tenantId_bankStatementLineId_key" ON "journal_entries"("tenantId", "bankStatementLineId");

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_tenantId_bankStatementLineId_fkey" FOREIGN KEY ("tenantId", "bankStatementLineId") REFERENCES "bank_statement_lines"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_statement_imports" ADD CONSTRAINT "bank_statement_imports_financialAccountId_fkey" FOREIGN KEY ("financialAccountId") REFERENCES "financial_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_statement_imports" ADD CONSTRAINT "bank_statement_imports_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_bankStatementImportId_fkey" FOREIGN KEY ("bankStatementImportId") REFERENCES "bank_statement_imports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_financialAccountId_fkey" FOREIGN KEY ("financialAccountId") REFERENCES "financial_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_matchedTransactionId_fkey" FOREIGN KEY ("matchedTransactionId") REFERENCES "financial_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS + GRANT for the 2 new tenant-scoped tables, in THIS migration (not a
-- follow-up fix) - same setting/role as every other tenant-scoped table,
-- see 20260906000000_treasury_checks. journal_entries already has RLS
-- from its original migration - only bankStatementLineId (a column, not
-- a table) was added to it above, nothing new to enable there.

ALTER TABLE "bank_statement_imports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bank_statement_imports" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "bank_statement_imports"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "bank_statement_imports" TO plexo_app;

ALTER TABLE "bank_statement_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bank_statement_lines" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "bank_statement_lines"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "bank_statement_lines" TO plexo_app;
