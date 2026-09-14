-- Reserva de insumos comprometidos a una orden de producción (ver
-- docs/OPLEX-Produccion-Plan-Tecnico-14-9.md, Fase 2). Creada antes de que
-- ProductionOrder exista (Fase 4) porque InventoryService.recordMovement ya
-- necesita poder sumar reservas ACTIVE para calcular "disponible" en cada
-- salida de stock - la tabla queda vacía/inerte hasta que la Fase 4 empiece
-- a escribir en ella. productionOrderId es intencionalmente una referencia
-- suelta (sin FK) por ahora, mismo criterio que StockMovement.sourceType/
-- sourceId - la Fase 4 agrega la FK real en la misma migración que crea
-- production_orders.

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('ACTIVE', 'CONSUMED', 'RELEASED');

-- CreateTable
CREATE TABLE "stock_reservations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productionOrderId" TEXT NOT NULL,
    "inputArticleVariantId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "quantityReserved" DECIMAL(14,3) NOT NULL,
    "stockPieceId" TEXT,
    "status" "ReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_reservations_tenantId_inputArticleVariantId_warehou_idx" ON "stock_reservations"("tenantId", "inputArticleVariantId", "warehouseId", "status");

-- AddForeignKey
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_inputArticleVariantId_fkey" FOREIGN KEY ("inputArticleVariantId") REFERENCES "article_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS + GRANT, mismo criterio que cualquier otra tabla tenant-scoped (ver
-- 20260916000000_pos_cash_registers para el mismo bloque).
ALTER TABLE "stock_reservations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stock_reservations" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "stock_reservations"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "stock_reservations" TO plexo_app;
