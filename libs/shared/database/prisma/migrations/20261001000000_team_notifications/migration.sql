-- Trabajo en equipo: avisos (campana), comentarios con @menciones, tareas
-- asignadas (sobre calendar_events) y quién hizo cada paso de una orden.

-- CreateEnum
CREATE TYPE "NotificationCategory" AS ENUM ('PRODUCTION', 'PURCHASES', 'STOCK', 'MENTION', 'TASK');

-- AlterTable
ALTER TABLE "users" ADD COLUMN "mutedNotificationTypes" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "production_orders"
  ADD COLUMN "startedByUserId" TEXT,
  ADD COLUMN "finishedByUserId" TEXT,
  ADD COLUMN "cancelledByUserId" TEXT;

-- AlterTable
ALTER TABLE "calendar_events"
  ADD COLUMN "createdByUserId" TEXT,
  ADD COLUMN "completedAt" TIMESTAMP(3),
  ADD COLUMN "completedByUserId" TEXT;

-- CreateIndex
CREATE INDEX "calendar_events_tenantId_assignedTo_status_idx" ON "calendar_events"("tenantId", "assignedTo", "status");

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "recipientUserId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "category" "NotificationCategory" NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "quote" TEXT,
    "link" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_tenantId_recipientUserId_createdAt_idx" ON "notifications"("tenantId", "recipientUserId", "createdAt");

-- CreateTable
CREATE TABLE "document_comments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "mentionedUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "document_comments_tenantId_entityType_entityId_createdAt_idx" ON "document_comments"("tenantId", "entityType", "entityId", "createdAt");

-- RLS: mismo aislamiento por empresa que el resto de las tablas.
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "notifications"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "notifications" TO plexo_app;

ALTER TABLE "document_comments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "document_comments" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "document_comments"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "document_comments" TO plexo_app;
