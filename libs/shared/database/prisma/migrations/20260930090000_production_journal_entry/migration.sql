-- AlterTable
ALTER TABLE "journal_entries" ADD COLUMN     "productionOrderId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_productionOrderId_key" ON "journal_entries"("productionOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_tenantId_productionOrderId_key" ON "journal_entries"("tenantId", "productionOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "production_orders_tenantId_id_key" ON "production_orders"("tenantId", "id");

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_tenantId_productionOrderId_fkey" FOREIGN KEY ("tenantId", "productionOrderId") REFERENCES "production_orders"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
