-- CreateEnum
CREATE TYPE "CashSessionStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "CashMovementType" AS ENUM ('SALE', 'CASH_IN', 'CASH_OUT');

-- AlterTable
ALTER TABLE "journal_entries" ADD COLUMN     "cashSessionId" TEXT;

-- CreateTable
CREATE TABLE "cash_registers" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "financialAccountId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_registers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_sessions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "registerId" TEXT NOT NULL,
    "status" "CashSessionStatus" NOT NULL DEFAULT 'OPEN',
    "openedByUserId" TEXT NOT NULL,
    "openingAmount" DECIMAL(14,2) NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedByUserId" TEXT,
    "countedAmount" DECIMAL(14,2),
    "expectedAmount" DECIMAL(14,2),
    "difference" DECIMAL(14,2),
    "closedAt" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "cash_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_movements" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "type" "CashMovementType" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "invoiceId" TEXT,
    "reason" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cash_registers_financialAccountId_key" ON "cash_registers"("financialAccountId");

-- CreateIndex
CREATE INDEX "cash_registers_tenantId_idx" ON "cash_registers"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "cash_registers_tenantId_name_key" ON "cash_registers"("tenantId", "name");

-- CreateIndex
CREATE INDEX "cash_sessions_tenantId_idx" ON "cash_sessions"("tenantId");

-- CreateIndex
CREATE INDEX "cash_sessions_tenantId_registerId_status_idx" ON "cash_sessions"("tenantId", "registerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "cash_sessions_tenantId_id_key" ON "cash_sessions"("tenantId", "id");

-- CreateIndex: only one OPEN session per register at a time - Prisma has no
-- @@unique-with-WHERE, added by hand (same pattern as the RLS block below).
-- This is what makes multi-caja concurrency-safe (the index is scoped per
-- registerId, so two different registers never conflict) AND what blocks
-- opening a new shift on a register that already has one left open, no
-- matter how many days have passed. CashSessionsService.openSession checks
-- for an existing OPEN session before inserting (a request runs in one
-- Postgres transaction - a rejected INSERT here would abort it and turn
-- the clean 409 into a 500, so the check has to come first); this index is
-- the real backstop against the race that check alone can't close.
CREATE UNIQUE INDEX cash_sessions_one_open_per_register
  ON cash_sessions ("registerId")
  WHERE status = 'OPEN';

-- CreateIndex
CREATE INDEX "cash_movements_tenantId_idx" ON "cash_movements"("tenantId");

-- CreateIndex
CREATE INDEX "cash_movements_tenantId_sessionId_idx" ON "cash_movements"("tenantId", "sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_cashSessionId_key" ON "journal_entries"("cashSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_tenantId_cashSessionId_key" ON "journal_entries"("tenantId", "cashSessionId");

-- AddForeignKey
ALTER TABLE "cash_registers" ADD CONSTRAINT "cash_registers_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_registers" ADD CONSTRAINT "cash_registers_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_registers" ADD CONSTRAINT "cash_registers_financialAccountId_fkey" FOREIGN KEY ("financialAccountId") REFERENCES "financial_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_registerId_fkey" FOREIGN KEY ("registerId") REFERENCES "cash_registers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_openedByUserId_fkey" FOREIGN KEY ("openedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_closedByUserId_fkey" FOREIGN KEY ("closedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "cash_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_tenantId_cashSessionId_fkey" FOREIGN KEY ("tenantId", "cashSessionId") REFERENCES "cash_sessions"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS + GRANT for the 3 new tenant-scoped tables, in THIS migration (not a
-- follow-up fix) - same setting/role as every other tenant-scoped table,
-- see 20260912000000_bank_reconciliation. journal_entries already has RLS
-- from its original migration - only cashSessionId (a column, not a
-- table) was added to it above, nothing new to enable there.

ALTER TABLE "cash_registers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cash_registers" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "cash_registers"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "cash_registers" TO plexo_app;

ALTER TABLE "cash_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cash_sessions" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "cash_sessions"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "cash_sessions" TO plexo_app;

ALTER TABLE "cash_movements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cash_movements" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "cash_movements"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "cash_movements" TO plexo_app;
