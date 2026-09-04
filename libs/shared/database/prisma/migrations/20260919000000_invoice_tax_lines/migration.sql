-- CreateEnum
CREATE TYPE "InvoiceTaxLineKind" AS ENUM ('NATIONAL', 'PROVINCIAL', 'MUNICIPAL', 'INTERNAL', 'OTHER');

-- CreateTable
CREATE TABLE "invoice_tax_lines" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "kind" "InvoiceTaxLineKind" NOT NULL,
    "concept" TEXT NOT NULL,
    "baseAmount" DECIMAL(14,2),
    "rate" DECIMAL(5,2),
    "amount" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "invoice_tax_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "invoice_tax_lines_tenantId_idx" ON "invoice_tax_lines"("tenantId");

-- AddForeignKey
ALTER TABLE "invoice_tax_lines" ADD CONSTRAINT "invoice_tax_lines_tenantId_invoiceId_fkey" FOREIGN KEY ("tenantId", "invoiceId") REFERENCES "invoices"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "invoice_tax_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invoice_tax_lines" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "invoice_tax_lines"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "invoice_tax_lines" TO plexo_app;
