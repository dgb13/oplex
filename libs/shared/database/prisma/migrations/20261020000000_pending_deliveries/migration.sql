-- Ventas → Pendientes de entrega: lo facturado sin stock que todavía no
-- salió del depósito (ver PendingDelivery en schema.prisma).
CREATE TABLE "pending_deliveries" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "invoiceLineId" TEXT NOT NULL,
    "articleVariantId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "quantityOrdered" DECIMAL(14,3) NOT NULL,
    "quantityPending" DECIMAL(14,3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    CONSTRAINT "pending_deliveries_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "pending_deliveries_invoiceLineId_key" ON "pending_deliveries"("invoiceLineId");
CREATE INDEX "pending_deliveries_tenantId_completedAt_cancelledAt_idx" ON "pending_deliveries"("tenantId", "completedAt", "cancelledAt");

-- RLS + GRANT, mismo patrón que arca_unregistered_vouchers.
ALTER TABLE "pending_deliveries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pending_deliveries" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "pending_deliveries"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "pending_deliveries" TO plexo_app;
