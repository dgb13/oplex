-- ProductionOrder.number: mismo patron "{prefix}-{n padded a 6}" por
-- usuario que QuoteRequest.number/PurchaseOrder.number (ver
-- User.productionOrderPrefix/productionOrderNextNumber). Las ordenes ya
-- existentes no tienen un creador registrado (createdByUserId no existia
-- todavia) - se numeran tenant-wide con el prefijo default 'OP', ordenadas
-- por createdAt, en vez de dejarlas sin numero.

-- AlterTable: users
ALTER TABLE "users" ADD COLUMN "productionOrderPrefix" TEXT NOT NULL DEFAULT 'OP',
                     ADD COLUMN "productionOrderNextNumber" INTEGER NOT NULL DEFAULT 1;

-- AlterTable: production_orders
ALTER TABLE "production_orders" ADD COLUMN "createdByUserId" TEXT,
                                 ADD COLUMN "number" TEXT;

-- Backfill: numeracion tenant-wide con el prefijo default, ordenada por
-- fecha de creacion.
WITH numbered AS (
  SELECT id, 'OP-' || LPAD(ROW_NUMBER() OVER (PARTITION BY "tenantId" ORDER BY "createdAt")::text, 6, '0') AS num
  FROM "production_orders"
)
UPDATE "production_orders" p SET "number" = n.num FROM numbered n WHERE p.id = n.id;

ALTER TABLE "production_orders" ALTER COLUMN "number" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "production_orders_tenantId_number_key" ON "production_orders"("tenantId", "number");

-- AddForeignKey
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
