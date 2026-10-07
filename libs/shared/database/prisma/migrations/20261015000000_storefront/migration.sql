-- Tienda online (etapa A) + fotos múltiples por artículo.

-- CreateEnum
CREATE TYPE "StorefrontStockDisplay" AS ENUM ('LOW', 'ALWAYS', 'NEVER');

-- CreateEnum
CREATE TYPE "StorefrontOrderStatus" AS ENUM ('NEW', 'CONFIRMED', 'DONE', 'CANCELLED');

-- AlterEnum
ALTER TYPE "NotificationCategory" ADD VALUE 'SALES';

-- AlterTable
ALTER TABLE "plans" ADD COLUMN     "storefrontEnabled" BOOLEAN NOT NULL DEFAULT false;

-- Desde Silver (sortOrder 3) en adelante - decisión con el usuario.
UPDATE "plans" SET "storefrontEnabled" = true WHERE "sortOrder" >= 3;

-- CreateTable
CREATE TABLE "article_images" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "article_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "storefront_settings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "subdomain" TEXT NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "template" TEXT NOT NULL DEFAULT 'aire',
    "accentColor" TEXT,
    "warehouseId" TEXT,
    "stockDisplay" "StorefrontStockDisplay" NOT NULL DEFAULT 'LOW',
    "whatsappNumber" TEXT,
    "notifyEmail" TEXT,
    "heroTitle" TEXT,
    "heroSubtitle" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "storefront_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "storefront_orders" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT,
    "note" TEXT,
    "total" DECIMAL(14,2) NOT NULL,
    "status" "StorefrontOrderStatus" NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "storefront_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "storefront_order_lines" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "articleVariantId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "storefront_order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "article_images_tenantId_articleId_idx" ON "article_images"("tenantId", "articleId");

-- CreateIndex
CREATE UNIQUE INDEX "storefront_settings_tenantId_key" ON "storefront_settings"("tenantId");

-- CreateIndex: la dirección de la tienda es única entre TODAS las empresas.
CREATE UNIQUE INDEX "storefront_settings_subdomain_key" ON "storefront_settings"("subdomain");

-- CreateIndex
CREATE INDEX "storefront_orders_tenantId_createdAt_idx" ON "storefront_orders"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "storefront_orders_tenantId_number_key" ON "storefront_orders"("tenantId", "number");

-- CreateIndex
CREATE INDEX "storefront_order_lines_tenantId_orderId_idx" ON "storefront_order_lines"("tenantId", "orderId");

-- AddForeignKey
ALTER TABLE "article_images" ADD CONSTRAINT "article_images_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storefront_order_lines" ADD CONSTRAINT "storefront_order_lines_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "storefront_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- La foto que cada artículo ya tenía pasa a ser su foto principal.
INSERT INTO "article_images" ("id", "tenantId", "articleId", "url", "sortOrder")
SELECT gen_random_uuid()::text, "tenantId", "id", "imageUrl", 0
FROM "articles" WHERE "imageUrl" IS NOT NULL;

-- RLS + GRANT, mismo patrón que el resto de las tablas por tenant.
ALTER TABLE "article_images" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "article_images" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "article_images"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "article_images" TO plexo_app;

ALTER TABLE "storefront_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "storefront_settings" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "storefront_settings"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "storefront_settings" TO plexo_app;

ALTER TABLE "storefront_orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "storefront_orders" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "storefront_orders"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "storefront_orders" TO plexo_app;

ALTER TABLE "storefront_order_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "storefront_order_lines" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "storefront_order_lines"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "storefront_order_lines" TO plexo_app;

-- La tienda pública recibe visitas sin sesión: con esto (y sólo con esto)
-- resuelve a qué empresa pertenece una dirección antes de abrir el
-- contexto del tenant. Sólo lectura. Mismo mecanismo que
-- find_whatsapp_link_by_phone.
CREATE FUNCTION find_storefront_by_subdomain(p_subdomain text)
RETURNS TABLE(tenant_id text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT "tenantId" FROM storefront_settings WHERE "subdomain" = p_subdomain;
$$;

GRANT EXECUTE ON FUNCTION find_storefront_by_subdomain(text) TO plexo_app;

-- "¿Esta dirección ya la tiene OTRA empresa?" - para avisar mientras se
-- escribe. La garantía real es el índice único de arriba.
CREATE FUNCTION storefront_subdomain_taken(p_subdomain text, p_tenant_id text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM storefront_settings WHERE "subdomain" = p_subdomain AND "tenantId" <> p_tenant_id
  );
$$;

GRANT EXECUTE ON FUNCTION storefront_subdomain_taken(text, text) TO plexo_app;
