-- Etapa 4 del plan de rubros: Órdenes de trabajo.
-- Ver docs/planesdemodulos/plan-rubros-fichas-ordenes-trabajo.md.

ALTER TABLE "tenant_settings"
  ADD COLUMN "workOrderDocName" TEXT,
  ADD COLUMN "workOrderPrefix" TEXT NOT NULL DEFAULT 'OT',
  ADD COLUMN "workOrderNextNumber" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "work_order_statuses" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "isFinal" BOOLEAN NOT NULL DEFAULT false,
    "notifiesCustomer" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "work_order_statuses_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "work_order_statuses_tenantId_id_key" ON "work_order_statuses"("tenantId", "id");
CREATE INDEX "work_order_statuses_tenantId_idx" ON "work_order_statuses"("tenantId");

CREATE TABLE "work_orders" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "assetId" TEXT,
    "statusId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "intakeNotes" TEXT,
    "assetSnapshot" JSONB,
    "assignedUserId" TEXT,
    "promisedAt" TIMESTAMP(3),
    "quoteId" TEXT,
    "invoiceId" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "work_orders_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "work_orders_tenantId_number_key" ON "work_orders"("tenantId", "number");
CREATE UNIQUE INDEX "work_orders_tenantId_id_key" ON "work_orders"("tenantId", "id");
CREATE INDEX "work_orders_tenantId_statusId_idx" ON "work_orders"("tenantId", "statusId");
CREATE INDEX "work_orders_tenantId_assetId_idx" ON "work_orders"("tenantId", "assetId");
CREATE INDEX "work_orders_tenantId_customerId_idx" ON "work_orders"("tenantId", "customerId");

ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_tenantId_assetId_fkey" FOREIGN KEY ("tenantId", "assetId") REFERENCES "customer_assets"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_tenantId_statusId_fkey" FOREIGN KEY ("tenantId", "statusId") REFERENCES "work_order_statuses"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "work_order_status_changes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "fromStatusId" TEXT,
    "toStatusId" TEXT NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "work_order_status_changes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "work_order_status_changes_tenantId_workOrderId_createdAt_idx" ON "work_order_status_changes"("tenantId", "workOrderId", "createdAt");
ALTER TABLE "work_order_status_changes" ADD CONSTRAINT "work_order_status_changes_tenantId_workOrderId_fkey" FOREIGN KEY ("tenantId", "workOrderId") REFERENCES "work_orders"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Por negocio, con RLS. Sin DELETE: las órdenes no se borran (quedan en el
-- historial del vehículo); los estados se desactivan.
ALTER TABLE "work_order_statuses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "work_order_statuses" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "work_order_statuses"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE ON "work_order_statuses" TO plexo_app;

ALTER TABLE "work_orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "work_orders" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "work_orders"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE ON "work_orders" TO plexo_app;

ALTER TABLE "work_order_status_changes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "work_order_status_changes" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "work_order_status_changes"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT ON "work_order_status_changes" TO plexo_app;
