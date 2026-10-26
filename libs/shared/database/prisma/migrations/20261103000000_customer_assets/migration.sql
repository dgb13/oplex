-- Etapa 3 del plan de rubros: Fichas del cliente (vehículos, equipos,
-- mascotas...). Ver docs/planesdemodulos/plan-rubros-fichas-ordenes-trabajo.md.

CREATE TABLE "customer_asset_types" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pluralName" TEXT NOT NULL,
    "fields" JSONB NOT NULL,
    "notice" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "customer_asset_types_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "customer_asset_types_tenantId_id_key" ON "customer_asset_types"("tenantId", "id");
CREATE INDEX "customer_asset_types_tenantId_idx" ON "customer_asset_types"("tenantId");

CREATE TABLE "customer_assets" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "identifierKey" TEXT NOT NULL,
    "values" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "customer_assets_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "customer_assets_tenantId_id_key" ON "customer_assets"("tenantId", "id");
CREATE INDEX "customer_assets_tenantId_identifierKey_idx" ON "customer_assets"("tenantId", "identifierKey");
CREATE INDEX "customer_assets_tenantId_companyId_idx" ON "customer_assets"("tenantId", "companyId");

ALTER TABLE "customer_assets" ADD CONSTRAINT "customer_assets_tenantId_typeId_fkey" FOREIGN KEY ("tenantId", "typeId") REFERENCES "customer_asset_types"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_assets" ADD CONSTRAINT "customer_assets_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Por negocio, con RLS como el resto de las tablas de tenant. Sin DELETE:
-- una ficha o un tipo se desactivan (active), no se borran.
ALTER TABLE "customer_asset_types" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customer_asset_types" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "customer_asset_types"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE ON "customer_asset_types" TO plexo_app;

ALTER TABLE "customer_assets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customer_assets" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "customer_assets"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE ON "customer_assets" TO plexo_app;
