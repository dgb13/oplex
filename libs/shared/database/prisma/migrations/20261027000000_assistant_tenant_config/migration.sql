-- Etapa 2 de la fase 2 del asistente: qué temas puede consultar cada rol,
-- qué canales están prendidos, y qué consultas se negaron por permisos.
-- Ver docs/planesdemodulos/plan-asistente-fase2-gestion-acciones.md.

-- AlterTable
ALTER TABLE "assistant_messages" ADD COLUMN "blockedTopic" TEXT;

-- CreateTable
CREATE TABLE "assistant_tenant_config" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "webEnabled" BOOLEAN NOT NULL DEFAULT true,
    "whatsappEnabled" BOOLEAN NOT NULL DEFAULT true,
    "salesOwnDataOnly" BOOLEAN NOT NULL DEFAULT true,
    "topicsByRole" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assistant_tenant_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "assistant_tenant_config_tenantId_key" ON "assistant_tenant_config"("tenantId");

-- RLS: mismo aislamiento por empresa que el resto de las tablas.
ALTER TABLE "assistant_tenant_config" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "assistant_tenant_config" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "assistant_tenant_config"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "assistant_tenant_config" TO plexo_app;
