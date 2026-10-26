-- Etapa 5 del plan de rubros: costo y margen de cada trabajo.
-- Ver docs/planesdemodulos/plan-rubros-fichas-ordenes-trabajo.md.

-- Compra hecha para una orden puntual (repuesto, tornería): suma al costo.
ALTER TABLE "purchase_invoices" ADD COLUMN "workOrderId" TEXT;
CREATE INDEX "purchase_invoices_workOrderId_idx" ON "purchase_invoices"("workOrderId");
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Horas trabajadas en cada orden.
CREATE TABLE "work_order_labor" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "workerName" TEXT NOT NULL,
    "userId" TEXT,
    "hours" DECIMAL(8,2) NOT NULL,
    "costPerHour" DECIMAL(14,2),
    "note" TEXT,
    "workedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "work_order_labor_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "work_order_labor_tenantId_workOrderId_idx" ON "work_order_labor"("tenantId", "workOrderId");
ALTER TABLE "work_order_labor" ADD CONSTRAINT "work_order_labor_tenantId_workOrderId_fkey" FOREIGN KEY ("tenantId", "workOrderId") REFERENCES "work_orders"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Por negocio, con RLS. Una carga de horas equivocada se puede borrar.
ALTER TABLE "work_order_labor" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "work_order_labor" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "work_order_labor"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "work_order_labor" TO plexo_app;
