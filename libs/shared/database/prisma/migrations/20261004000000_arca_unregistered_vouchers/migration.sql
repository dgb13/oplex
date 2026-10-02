-- Comprobantes que ARCA tiene autorizados y Oplex no tiene registrados
-- (ver InvoicingService.reserveVoucherNumber) + categoría de aviso para
-- avisarle a quien administra la facturación.

-- AlterEnum
ALTER TYPE "NotificationCategory" ADD VALUE 'BILLING';

-- CreateTable
CREATE TABLE "arca_unregistered_vouchers" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "documentLetter" "DocumentLetter" NOT NULL,
    "pointOfSale" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "cae" TEXT,
    "issueDate" TIMESTAMP(3),
    "total" DECIMAL(14,2),
    "customerDocNumber" TEXT,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,

    CONSTRAINT "arca_unregistered_vouchers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "arca_unregistered_vouchers_tenantId_kind_documentLetter_poi_key" ON "arca_unregistered_vouchers"("tenantId", "kind", "documentLetter", "pointOfSale", "number");

-- CreateIndex
CREATE INDEX "arca_unregistered_vouchers_tenantId_resolvedAt_idx" ON "arca_unregistered_vouchers"("tenantId", "resolvedAt");

-- RLS + GRANT para la tabla nueva, mismo patrón que mercadopago_stores.
ALTER TABLE "arca_unregistered_vouchers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "arca_unregistered_vouchers" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "arca_unregistered_vouchers"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "arca_unregistered_vouchers" TO plexo_app;
