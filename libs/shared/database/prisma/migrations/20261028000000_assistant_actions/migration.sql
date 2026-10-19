-- Etapa 3 de la fase 2 del asistente: acciones (proponer → "SÍ" → ejecutar).
-- Ver docs/planesdemodulos/plan-asistente-fase2-gestion-acciones.md.

-- CreateEnum
CREATE TYPE "AssistantActionKind" AS ENUM ('REMINDER_CREATE', 'CUSTOMER_CREATE', 'QUOTE_CREATE', 'QUOTE_EMAIL', 'PAYMENT_LINK', 'INVOICE_PREPARE');

-- CreateEnum
CREATE TYPE "AssistantActionStatus" AS ENUM ('PENDING_CONFIRMATION', 'DONE', 'EXPIRED', 'CANCELLED', 'UNDONE', 'FAILED');

-- AlterTable
ALTER TABLE "assistant_tenant_config"
  ADD COLUMN "actionLevels" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "actionRoles" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "maxQuoteAmountWhatsapp" DECIMAL(14,2),
  ADD COLUMN "maxActionsPerDay" INTEGER NOT NULL DEFAULT 40,
  ADD COLUMN "confirmExpiryMinutes" INTEGER NOT NULL DEFAULT 10;

-- CreateTable
CREATE TABLE "assistant_actions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "questionMessageId" TEXT,
    "userId" TEXT NOT NULL,
    "channel" "AssistantChannel" NOT NULL,
    "kind" "AssistantActionKind" NOT NULL,
    "level" TEXT NOT NULL,
    "status" "AssistantActionStatus" NOT NULL,
    "payload" JSONB NOT NULL,
    "summary" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "undoneAt" TIMESTAMP(3),
    "undoneByUserId" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assistant_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assistant_actions_tenantId_createdAt_idx" ON "assistant_actions"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "assistant_actions_tenantId_userId_status_idx" ON "assistant_actions"("tenantId", "userId", "status");

-- CreateIndex
CREATE INDEX "assistant_actions_tenantId_questionMessageId_idx" ON "assistant_actions"("tenantId", "questionMessageId");

-- RLS: mismo aislamiento por empresa que el resto de las tablas.
ALTER TABLE "assistant_actions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "assistant_actions" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "assistant_actions"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "assistant_actions" TO plexo_app;
