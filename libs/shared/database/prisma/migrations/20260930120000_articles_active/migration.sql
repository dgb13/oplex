-- "Eliminar" un artículo en realidad lo desactiva (no hard delete) - mismo
-- criterio que Company.active/CashRegister.active. DEFAULT true hace que
-- ningún artículo existente cambie de comportamiento (sigue apareciendo en
-- listArticles como hasta ahora).

-- AlterTable
ALTER TABLE "articles" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "articles_tenantId_active_idx" ON "articles"("tenantId", "active");
