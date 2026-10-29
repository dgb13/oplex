-- Cobro con Point de Mercado Pago en la Caja (mockup aprobado 2026-10-28):
-- cada fila de pago "Point" de una venta queda para emparejar con un pago
-- de la cuenta de Mercado Pago (ver PosPointChargesService).
CREATE TYPE "PosPointChargeStatus" AS ENUM ('PENDING', 'AMBIGUOUS', 'CONFIRMED', 'CHANGED');

CREATE TABLE "pos_point_charges" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "registerId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "soldAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT,
    "status" "PosPointChargeStatus" NOT NULL DEFAULT 'PENDING',
    "mpPaymentId" TEXT,
    "candidateCount" INTEGER NOT NULL DEFAULT 0,
    "notifiedAt" TIMESTAMP(3),
    "resolution" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "pos_point_charges_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "pos_point_charges_receiptId_key" ON "pos_point_charges"("receiptId");
CREATE UNIQUE INDEX "pos_point_charges_tenantId_mpPaymentId_key" ON "pos_point_charges"("tenantId", "mpPaymentId");
CREATE INDEX "pos_point_charges_tenantId_status_idx" ON "pos_point_charges"("tenantId", "status");
CREATE INDEX "pos_point_charges_tenantId_soldAt_idx" ON "pos_point_charges"("tenantId", "soldAt");
CREATE INDEX "pos_point_charges_tenantId_sessionId_idx" ON "pos_point_charges"("tenantId", "sessionId");

ALTER TABLE "pos_point_charges" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pos_point_charges" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "pos_point_charges"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "pos_point_charges" TO plexo_app;

-- "No es una venta" en un pago de Point sin venta en Oplex.
ALTER TABLE "mercadopago_payments" ADD COLUMN "pointReviewedAt" TIMESTAMP(3);
ALTER TABLE "mercadopago_payments" ADD COLUMN "pointReviewedByUserId" TEXT;
