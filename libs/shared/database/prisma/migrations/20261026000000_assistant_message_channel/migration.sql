-- Canal de cada turno del asistente (web / WhatsApp) para el Historial de
-- Preferencias › Asistente. Los mensajes viejos quedan en null: no hay forma
-- confiable de saber por dónde entraron.

-- CreateEnum
CREATE TYPE "AssistantChannel" AS ENUM ('WEB', 'WHATSAPP');

-- AlterTable
ALTER TABLE "assistant_messages" ADD COLUMN "channel" "AssistantChannel";

-- CreateIndex
CREATE INDEX "assistant_messages_tenantId_role_createdAt_idx" ON "assistant_messages"("tenantId", "role", "createdAt");
