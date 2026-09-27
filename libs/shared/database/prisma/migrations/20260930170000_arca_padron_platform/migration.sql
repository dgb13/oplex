-- Padrón de ARCA con el certificado de Oplex (autocompletar por CUIT en toda
-- la plataforma) + caché global de consultas + tipo de Ingresos Brutos.
ALTER TABLE "platform_settings" ADD COLUMN "arcaPadronEnv" "AfipEnvironment" NOT NULL DEFAULT 'HOMOLOGACION';
ALTER TABLE "platform_settings" ADD COLUMN "arcaPadronCertEncrypted" TEXT;
ALTER TABLE "platform_settings" ADD COLUMN "arcaPadronKeyEncrypted" TEXT;
ALTER TABLE "platform_settings" ADD COLUMN "arcaPadronCertAlias" TEXT;
ALTER TABLE "platform_settings" ADD COLUMN "arcaPadronCuit" TEXT;
ALTER TABLE "platform_settings" ADD COLUMN "arcaPadronCertExpiresAt" TIMESTAMP(3);
ALTER TABLE "platform_settings" ADD COLUMN "arcaPadronTicketsEncrypted" TEXT;
ALTER TABLE "platform_settings" ADD COLUMN "arcaPadronLastCheckAt" TIMESTAMP(3);
ALTER TABLE "platform_settings" ADD COLUMN "arcaPadronLastCheckOk" BOOLEAN;
ALTER TABLE "platform_settings" ADD COLUMN "arcaPadronLastCheckMessage" TEXT;
ALTER TABLE "platform_settings" ADD COLUMN "arcaPadronQueriesMonth" TEXT;
ALTER TABLE "platform_settings" ADD COLUMN "arcaPadronQueriesCount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "tenant_settings" ADD COLUMN "grossIncomeType" TEXT;

-- Global, SIN RLS (mismo criterio que platform_settings): los datos públicos
-- de un CUIT son iguales para todos los tenants.
CREATE TABLE "arca_padron_cache" (
    "cuit" TEXT NOT NULL,
    "env" "AfipEnvironment" NOT NULL,
    "data" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "arca_padron_cache_pkey" PRIMARY KEY ("cuit")
);
GRANT SELECT, INSERT, UPDATE, DELETE ON "arca_padron_cache" TO plexo_app;
