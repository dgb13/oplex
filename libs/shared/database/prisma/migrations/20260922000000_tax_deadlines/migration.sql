-- CreateEnum
CREATE TYPE "TaxDeadlineKind" AS ENUM ('IVA', 'MONOTRIBUTO', 'IIBB', 'GANANCIAS', 'OTRO');

-- CreateEnum
CREATE TYPE "TaxDeadlineStatus" AS ENUM ('PENDING', 'DONE');

-- CreateTable
CREATE TABLE "tax_deadlines" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" "TaxDeadlineKind" NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "status" "TaxDeadlineStatus" NOT NULL DEFAULT 'PENDING',
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tax_deadlines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tax_deadlines_tenantId_status_dueDate_idx" ON "tax_deadlines"("tenantId", "status", "dueDate");

ALTER TABLE "tax_deadlines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tax_deadlines" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "tax_deadlines"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "tax_deadlines" TO plexo_app;
