-- Entidades de producción (ver docs/OPLEX-Produccion-Plan-Tecnico-14-9.md,
-- Fase 4): piezas físicas 1D, recetas (BOM) versionadas y órdenes de
-- producción. StockReservation ya existía desde la Fase 2 (sola, con
-- productionOrderId suelto) - acá se le agrega la FK real a
-- production_orders, más la relación opcional a stock_pieces.
--
-- Generado con `prisma migrate diff --from-config-datasource --to-schema`
-- contra la base real y revisado a mano antes de aplicar (mismo mecanismo
-- que ya usó el repo para la migración de FK compuestas, ver PROGRESS.md
-- 2026-08-29) - se descartaron del diff crudo dos pares de sentencias sin
-- relación con este cambio (drop+recreate no-op de
-- purchase_invoices_purchaseOrderId_fkey, y dos RenameIndex cosméticos de
-- índices preexistentes) que sólo agregaban ruido.

-- CreateEnum
CREATE TYPE "PieceStatus" AS ENUM ('AVAILABLE', 'DEPLETED', 'SCRAP');

-- CreateEnum
CREATE TYPE "PieceSource" AS ENUM ('FULL_STOCK', 'OFFCUT');

-- CreateEnum
CREATE TYPE "ProductionStatus" AS ENUM ('DRAFT', 'PLANNED', 'IN_PROGRESS', 'DONE', 'CANCELLED');

-- AlterTable
ALTER TABLE "articles" ADD COLUMN     "commercialLength" DECIMAL(14,3),
ADD COLUMN     "isManufactured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "minUsableLength" DECIMAL(14,3),
ADD COLUMN     "sheetLength" DECIMAL(14,3),
ADD COLUMN     "sheetWidth" DECIMAL(14,3);

-- CreateTable
CREATE TABLE "stock_pieces" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "articleVariantId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "originalLength" DECIMAL(14,3) NOT NULL,
    "currentLength" DECIMAL(14,3) NOT NULL,
    "status" "PieceStatus" NOT NULL DEFAULT 'AVAILABLE',
    "sourceType" "PieceSource" NOT NULL,
    "parentPieceId" TEXT,
    "unitCost" DECIMAL(14,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_pieces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bill_of_materials" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "outputArticleVariantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bill_of_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bom_lines" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "bomId" TEXT NOT NULL,
    "inputArticleVariantId" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "width" DECIMAL(14,3),
    "length" DECIMAL(14,3),
    "cutsCount" INTEGER,
    "expectedWastePercent" DECIMAL(5,2) NOT NULL DEFAULT 0,

    CONSTRAINT "bom_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bom_byproducts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "bomId" TEXT NOT NULL,
    "outputArticleVariantId" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "costSharePercent" DECIMAL(5,2),

    CONSTRAINT "bom_byproducts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_orders" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "outputArticleVariantId" TEXT NOT NULL,
    "bomId" TEXT,
    "bomVersion" INTEGER,
    "quantity" DECIMAL(14,3) NOT NULL,
    "status" "ProductionStatus" NOT NULL DEFAULT 'DRAFT',
    "isShortOnMaterials" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "production_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_consumptions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productionOrderId" TEXT NOT NULL,
    "inputArticleVariantId" TEXT NOT NULL,
    "stockPieceId" TEXT,
    "quantityConsumed" DECIMAL(14,3) NOT NULL,
    "offcutPieceId" TEXT,
    "wasteAmount" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "cost" DECIMAL(14,4) NOT NULL,

    CONSTRAINT "production_consumptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_outputs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productionOrderId" TEXT NOT NULL,
    "articleVariantId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL,
    "quantityProduced" DECIMAL(14,3) NOT NULL,
    "cost" DECIMAL(14,4) NOT NULL,

    CONSTRAINT "production_outputs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_pieces_tenantId_articleVariantId_warehouseId_status_c_idx" ON "stock_pieces"("tenantId", "articleVariantId", "warehouseId", "status", "currentLength");

-- CreateIndex
CREATE INDEX "bill_of_materials_tenantId_outputArticleVariantId_isActive_idx" ON "bill_of_materials"("tenantId", "outputArticleVariantId", "isActive");

-- CreateIndex
CREATE INDEX "bom_lines_tenantId_bomId_idx" ON "bom_lines"("tenantId", "bomId");

-- CreateIndex
CREATE INDEX "bom_byproducts_tenantId_bomId_idx" ON "bom_byproducts"("tenantId", "bomId");

-- CreateIndex
CREATE INDEX "production_orders_tenantId_status_idx" ON "production_orders"("tenantId", "status");

-- CreateIndex
CREATE INDEX "production_consumptions_tenantId_productionOrderId_idx" ON "production_consumptions"("tenantId", "productionOrderId");

-- CreateIndex
CREATE INDEX "production_outputs_tenantId_productionOrderId_idx" ON "production_outputs"("tenantId", "productionOrderId");

-- AddForeignKey
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "production_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_stockPieceId_fkey" FOREIGN KEY ("stockPieceId") REFERENCES "stock_pieces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_pieces" ADD CONSTRAINT "stock_pieces_articleVariantId_fkey" FOREIGN KEY ("articleVariantId") REFERENCES "article_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_pieces" ADD CONSTRAINT "stock_pieces_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_pieces" ADD CONSTRAINT "stock_pieces_parentPieceId_fkey" FOREIGN KEY ("parentPieceId") REFERENCES "stock_pieces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_of_materials" ADD CONSTRAINT "bill_of_materials_outputArticleVariantId_fkey" FOREIGN KEY ("outputArticleVariantId") REFERENCES "article_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom_lines" ADD CONSTRAINT "bom_lines_bomId_fkey" FOREIGN KEY ("bomId") REFERENCES "bill_of_materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom_lines" ADD CONSTRAINT "bom_lines_inputArticleVariantId_fkey" FOREIGN KEY ("inputArticleVariantId") REFERENCES "article_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom_byproducts" ADD CONSTRAINT "bom_byproducts_bomId_fkey" FOREIGN KEY ("bomId") REFERENCES "bill_of_materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom_byproducts" ADD CONSTRAINT "bom_byproducts_outputArticleVariantId_fkey" FOREIGN KEY ("outputArticleVariantId") REFERENCES "article_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_outputArticleVariantId_fkey" FOREIGN KEY ("outputArticleVariantId") REFERENCES "article_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_bomId_fkey" FOREIGN KEY ("bomId") REFERENCES "bill_of_materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_consumptions" ADD CONSTRAINT "production_consumptions_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "production_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_consumptions" ADD CONSTRAINT "production_consumptions_inputArticleVariantId_fkey" FOREIGN KEY ("inputArticleVariantId") REFERENCES "article_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_consumptions" ADD CONSTRAINT "production_consumptions_stockPieceId_fkey" FOREIGN KEY ("stockPieceId") REFERENCES "stock_pieces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_consumptions" ADD CONSTRAINT "production_consumptions_offcutPieceId_fkey" FOREIGN KEY ("offcutPieceId") REFERENCES "stock_pieces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_outputs" ADD CONSTRAINT "production_outputs_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "production_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_outputs" ADD CONSTRAINT "production_outputs_articleVariantId_fkey" FOREIGN KEY ("articleVariantId") REFERENCES "article_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS + GRANT para las 7 tablas nuevas, mismo criterio que cualquier otra
-- tabla tenant-scoped (ver 20260916000000_pos_cash_registers).
ALTER TABLE "stock_pieces" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stock_pieces" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "stock_pieces"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "stock_pieces" TO plexo_app;

ALTER TABLE "bill_of_materials" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bill_of_materials" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "bill_of_materials"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "bill_of_materials" TO plexo_app;

ALTER TABLE "bom_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bom_lines" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "bom_lines"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "bom_lines" TO plexo_app;

ALTER TABLE "bom_byproducts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bom_byproducts" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "bom_byproducts"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "bom_byproducts" TO plexo_app;

ALTER TABLE "production_orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "production_orders" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "production_orders"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "production_orders" TO plexo_app;

ALTER TABLE "production_consumptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "production_consumptions" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "production_consumptions"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "production_consumptions" TO plexo_app;

ALTER TABLE "production_outputs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "production_outputs" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "production_outputs"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "production_outputs" TO plexo_app;
