-- Detalle de Inteligencia artificial (Anthropic) en /admin: última prueba
-- sin costo por función + usos y fallas de las funciones de IA.
ALTER TABLE "platform_settings" ADD COLUMN "aiLastTestAt" TIMESTAMP(3);
ALTER TABLE "platform_settings" ADD COLUMN "aiLastTestResults" JSONB;

-- Global, SIN RLS (mismo criterio que arca_padron_cache): lo lee el admin de
-- la plataforma y se escribe fuera de la transacción del request.
CREATE TABLE "ai_feature_events" (
    "id" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "tenantId" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_feature_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ai_feature_events_feature_createdAt_idx" ON "ai_feature_events"("feature", "createdAt");
CREATE INDEX "ai_feature_events_ok_createdAt_idx" ON "ai_feature_events"("ok", "createdAt");
GRANT SELECT, INSERT, UPDATE, DELETE ON "ai_feature_events" TO plexo_app;
