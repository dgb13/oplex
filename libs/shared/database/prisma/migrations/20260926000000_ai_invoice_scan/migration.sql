-- AlterTable
ALTER TABLE "platform_settings" ADD COLUMN "aiInvoiceScanEnabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "plans" ADD COLUMN "aiInvoiceScanMonthlyQuota" INTEGER;

-- CreateEnum
CREATE TYPE "AiInvoiceScanStatus" AS ENUM ('SUCCESS', 'FAILURE');

-- CreateTable
CREATE TABLE "ai_invoice_scan_attempts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "status" "AiInvoiceScanStatus" NOT NULL,
    "errorReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_invoice_scan_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_invoice_scan_attempts_tenantId_createdAt_idx" ON "ai_invoice_scan_attempts"("tenantId", "createdAt");

ALTER TABLE "ai_invoice_scan_attempts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_invoice_scan_attempts" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ai_invoice_scan_attempts"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "ai_invoice_scan_attempts" TO plexo_app;
