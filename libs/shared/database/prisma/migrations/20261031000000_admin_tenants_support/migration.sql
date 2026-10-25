-- Panel de Tenants del admin (fecha de ARCA en producción, notas internas)
-- y módulo de Soporte (consultas con capturas). Ver el boceto aprobado.
-- CreateEnum
CREATE TYPE "SupportTicketType" AS ENUM ('ERROR', 'QUESTION', 'SUGGESTION');

-- CreateEnum
CREATE TYPE "SupportTicketStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'WAITING_USER', 'RESOLVED');

-- CreateEnum
CREATE TYPE "SupportTicketPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH');

-- CreateEnum
CREATE TYPE "SupportAuthorKind" AS ENUM ('USER', 'ADMIN');

-- AlterTable
ALTER TABLE "tenant_settings" ADD COLUMN     "afipProductionAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "platform_tenant_notes" (
    "tenantId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "updatedByEmail" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_tenant_notes_pkey" PRIMARY KEY ("tenantId")
);

-- CreateTable
CREATE TABLE "support_tickets" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "userEmail" TEXT NOT NULL,
    "userName" TEXT,
    "type" "SupportTicketType" NOT NULL,
    "module" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "SupportTicketStatus" NOT NULL DEFAULT 'NEW',
    "priority" "SupportTicketPriority" NOT NULL DEFAULT 'NORMAL',
    "context" JSONB,
    "unreadByAdmin" BOOLEAN NOT NULL DEFAULT true,
    "unreadByUser" BOOLEAN NOT NULL DEFAULT false,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_messages" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "authorKind" "SupportAuthorKind" NOT NULL,
    "authorEmail" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "internal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_attachments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "support_tickets_number_key" ON "support_tickets"("number");

-- CreateIndex
CREATE INDEX "support_tickets_tenantId_userId_lastMessageAt_idx" ON "support_tickets"("tenantId", "userId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "support_tickets_tenantId_status_idx" ON "support_tickets"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "support_tickets_tenantId_id_key" ON "support_tickets"("tenantId", "id");

-- CreateIndex
CREATE INDEX "support_messages_tenantId_ticketId_createdAt_idx" ON "support_messages"("tenantId", "ticketId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "support_messages_tenantId_id_key" ON "support_messages"("tenantId", "id");

-- CreateIndex
CREATE INDEX "support_attachments_tenantId_ticketId_idx" ON "support_attachments"("tenantId", "ticketId");

-- AddForeignKey
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_tenantId_ticketId_fkey" FOREIGN KEY ("tenantId", "ticketId") REFERENCES "support_tickets"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_attachments" ADD CONSTRAINT "support_attachments_tenantId_ticketId_fkey" FOREIGN KEY ("tenantId", "ticketId") REFERENCES "support_tickets"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_attachments" ADD CONSTRAINT "support_attachments_tenantId_messageId_fkey" FOREIGN KEY ("tenantId", "messageId") REFERENCES "support_messages"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Tenants que ya están en producción: la fecha de su primera factura con
-- CAE (la más cercana que hay a "cuándo pasó a producción").
UPDATE "tenant_settings" ts
SET "afipProductionAt" = (
  SELECT MIN(i."issueDate") FROM "invoices" i
  WHERE i."tenantId" = ts."tenantId" AND i."afipCae" IS NOT NULL
)
WHERE ts."afipEnv" = 'PRODUCCION';

-- Sin factura todavía: la fecha del último cambio de la configuración.
UPDATE "tenant_settings"
SET "afipProductionAt" = "updatedAt"
WHERE "afipEnv" = 'PRODUCCION' AND "afipCertEncrypted" IS NOT NULL AND "afipProductionAt" IS NULL;

-- Notas del admin: tabla de plataforma, sin RLS (como legal_requests).
GRANT SELECT, INSERT, UPDATE, DELETE ON "platform_tenant_notes" TO plexo_app;

ALTER TABLE "support_tickets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "support_tickets" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "support_tickets"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "support_tickets" TO plexo_app;
-- El número visible (#0142) sale de esta secuencia.
GRANT USAGE, SELECT ON SEQUENCE "support_tickets_number_seq" TO plexo_app;

ALTER TABLE "support_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "support_messages" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "support_messages"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "support_messages" TO plexo_app;

ALTER TABLE "support_attachments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "support_attachments" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "support_attachments"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "support_attachments" TO plexo_app;
