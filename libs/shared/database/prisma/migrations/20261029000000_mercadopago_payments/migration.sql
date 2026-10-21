-- Sección Mercado Pago, etapa 2: copia local de los pagos de la cuenta de MP
-- del tenant (Movimientos, Resumen, Excel).
-- Ver docs/planesdemodulos/plan-seccion-mercadopago.md.

-- AlterTable
ALTER TABLE "tenant_settings" ADD COLUMN "mercadoPagoLastSyncAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "mercadopago_payments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "mpPaymentId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "statusDetail" TEXT,
    "dateCreated" TIMESTAMP(3) NOT NULL,
    "dateApproved" TIMESTAMP(3),
    "dateLastUpdated" TIMESTAMP(3),
    "paymentMethodId" TEXT,
    "paymentTypeId" TEXT,
    "installments" INTEGER,
    "currency" TEXT NOT NULL,
    "grossAmount" DECIMAL(14,2) NOT NULL,
    "feeAmount" DECIMAL(14,2) NOT NULL,
    "netAmount" DECIMAL(14,2),
    "refundedAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "moneyReleaseDate" TIMESTAMP(3),
    "moneyReleaseStatus" TEXT,
    "externalReference" TEXT,
    "description" TEXT,
    "payerEmail" TEXT,
    "paymentIntentId" TEXT,
    "raw" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mercadopago_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mercadopago_payments_tenantId_mpPaymentId_key" ON "mercadopago_payments"("tenantId", "mpPaymentId");

-- CreateIndex
CREATE INDEX "mercadopago_payments_tenantId_dateCreated_idx" ON "mercadopago_payments"("tenantId", "dateCreated");

-- CreateIndex
CREATE INDEX "mercadopago_payments_tenantId_moneyReleaseDate_idx" ON "mercadopago_payments"("tenantId", "moneyReleaseDate");

-- CreateIndex
CREATE INDEX "mercadopago_payments_tenantId_paymentIntentId_idx" ON "mercadopago_payments"("tenantId", "paymentIntentId");

-- RLS: mismo aislamiento por empresa que el resto de las tablas.
ALTER TABLE "mercadopago_payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mercadopago_payments" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "mercadopago_payments"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "mercadopago_payments" TO plexo_app;
