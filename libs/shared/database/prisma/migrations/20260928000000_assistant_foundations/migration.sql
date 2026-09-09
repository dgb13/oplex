-- Nota: `prisma migrate dev --create-only` también propuso un DROP+ADD de
-- "purchase_invoices_purchaseOrderId_fkey" y un RENAME de un índice de
-- tenant_membership_assignments - drift cosmético entre la shadow DB y la
-- real (mismo tipo de ruido ya documentado en PROGRESS.md), sin relación con
-- este cambio. Se descartó a mano, esta migración sólo tiene lo del
-- asistente de IA (ver docs/plan-asistente-ia-conversacional.md, Fase 0).

-- CreateEnum
CREATE TYPE "AssistantMessageRole" AS ENUM ('USER', 'ASSISTANT');

-- AlterTable
ALTER TABLE "platform_settings" ADD COLUMN     "assistantDisplayName" TEXT;

-- CreateTable
CREATE TABLE "assistant_conversations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assistant_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assistant_messages" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" "AssistantMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "toolCalls" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assistant_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assistant_conversations_tenantId_userId_updatedAt_idx" ON "assistant_conversations"("tenantId", "userId", "updatedAt");

-- CreateIndex
CREATE INDEX "assistant_messages_tenantId_conversationId_createdAt_idx" ON "assistant_messages"("tenantId", "conversationId", "createdAt");

-- AddForeignKey
ALTER TABLE "assistant_messages" ADD CONSTRAINT "assistant_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "assistant_conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS: mismo patrón estándar que el resto del proyecto (ver tax_deadlines).
ALTER TABLE "assistant_conversations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "assistant_conversations" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "assistant_conversations"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "assistant_conversations" TO plexo_app;

ALTER TABLE "assistant_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "assistant_messages" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "assistant_messages"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "assistant_messages" TO plexo_app;
