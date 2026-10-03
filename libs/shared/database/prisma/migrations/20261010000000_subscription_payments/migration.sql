-- Cobro de los planes de Oplex: registro de pagos por tenant, gracia tras
-- un vencimiento y descuentos por débito automático y pago anual.

-- CreateEnum
CREATE TYPE "SubscriptionPaymentMethod" AS ENUM ('MP_DEBIT', 'TRANSFER', 'CASH', 'OTHER');

-- CreateEnum
CREATE TYPE "SubscriptionPaymentStatus" AS ENUM ('PENDING', 'PAID', 'REJECTED', 'REFUNDED');

-- AlterTable
ALTER TABLE "plans" ADD COLUMN     "annualDiscountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "tenant_subscriptions" ADD COLUMN     "graceEndsAt" TIMESTAMP(3),
ADD COLUMN     "mpPreapprovalId" TEXT;

-- CreateTable
CREATE TABLE "subscription_payments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "method" "SubscriptionPaymentMethod" NOT NULL,
    "status" "SubscriptionPaymentStatus" NOT NULL,
    "months" INTEGER NOT NULL DEFAULT 1,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "listPrice" DECIMAL(14,2) NOT NULL,
    "discountAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "netAmount" DECIMAL(14,2) NOT NULL,
    "vatAmount" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "reference" TEXT,
    "receiptUrl" TEXT,
    "externalId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "subscription_payments_tenantId_createdAt_idx" ON "subscription_payments"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "subscription_payments_status_idx" ON "subscription_payments"("status");

-- AddForeignKey
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS: mismo criterio que tenant_subscriptions (20260824000000).
ALTER TABLE "subscription_payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "subscription_payments" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "subscription_payments"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "subscription_payments" TO plexo_app;

-- Descuentos acordados con el usuario (2026-10-03): 5% por débito automático
-- y 20% por pago anual en los planes pagos. Editables en /admin/plans.
UPDATE "plans" SET "debitDiscountPercent" = 5, "annualDiscountPercent" = 20 WHERE "priceMonthly" > 0;
