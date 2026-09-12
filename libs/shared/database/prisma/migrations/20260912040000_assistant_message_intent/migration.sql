-- CreateEnum
CREATE TYPE "AssistantIntent" AS ENUM ('AYUDA', 'DATOS');

-- AlterTable
ALTER TABLE "assistant_messages" ADD COLUMN "intent" "AssistantIntent";

-- CreateIndex
CREATE INDEX "assistant_messages_role_intent_createdAt_idx" ON "assistant_messages"("role", "intent", "createdAt");
