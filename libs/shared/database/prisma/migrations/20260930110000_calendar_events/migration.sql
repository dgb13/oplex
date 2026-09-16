-- CreateEnum
CREATE TYPE "CalendarEventKind" AS ENUM ('MEETING', 'TASK', 'REMINDER', 'CUSTOM');

-- CreateEnum
CREATE TYPE "CalendarEventStatus" AS ENUM ('PENDING', 'DONE', 'CANCELLED');

-- CreateTable
CREATE TABLE "calendar_events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "kind" "CalendarEventKind" NOT NULL DEFAULT 'CUSTOM',
    "status" "CalendarEventStatus" NOT NULL DEFAULT 'PENDING',
    "linkType" TEXT,
    "linkId" TEXT,
    "assignedTo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "calendar_events_tenantId_startsAt_idx" ON "calendar_events"("tenantId", "startsAt");

ALTER TABLE "calendar_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "calendar_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "calendar_events"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "calendar_events" TO plexo_app;
