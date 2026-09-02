-- AlterTable
ALTER TABLE "journal_entries" ADD COLUMN     "inflationAdjustmentId" TEXT;

-- CreateTable
CREATE TABLE "inflation_adjustments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "periodFrom" TIMESTAMP(3) NOT NULL,
    "periodTo" TIMESTAMP(3) NOT NULL,
    "recpamAmount" DECIMAL(14,2) NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inflation_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inflation_adjustments_tenantId_idx" ON "inflation_adjustments"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "inflation_adjustments_tenantId_id_key" ON "inflation_adjustments"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "inflation_adjustments_tenantId_periodFrom_periodTo_key" ON "inflation_adjustments"("tenantId", "periodFrom", "periodTo");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_inflationAdjustmentId_key" ON "journal_entries"("inflationAdjustmentId");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_tenantId_inflationAdjustmentId_key" ON "journal_entries"("tenantId", "inflationAdjustmentId");

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_tenantId_inflationAdjustmentId_fkey" FOREIGN KEY ("tenantId", "inflationAdjustmentId") REFERENCES "inflation_adjustments"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inflation_adjustments" ADD CONSTRAINT "inflation_adjustments_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS + GRANT for the 1 new tenant-scoped table, in THIS migration (not a
-- follow-up fix) - same setting/role as every other tenant-scoped table,
-- see 20260912000000_bank_reconciliation. journal_entries already has RLS
-- from its original migration - only inflationAdjustmentId (a column, not
-- a table) was added to it above, nothing new to enable there.

ALTER TABLE "inflation_adjustments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inflation_adjustments" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "inflation_adjustments"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "inflation_adjustments" TO plexo_app;
