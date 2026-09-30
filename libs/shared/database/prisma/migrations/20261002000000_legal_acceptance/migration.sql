-- Contrato de uso: aceptación registrada de Términos/Política/Anexo de
-- datos, y pedidos de arrepentimiento o de baja.

ALTER TABLE "users"
  ADD COLUMN "acceptedTermsVersion" TEXT,
  ADD COLUMN "acceptedTermsAt" TIMESTAMP(3);

CREATE TABLE "legal_acceptances" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "userAgent" TEXT,
    CONSTRAINT "legal_acceptances_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "legal_acceptances_tenantId_userId_idx" ON "legal_acceptances"("tenantId", "userId");

ALTER TABLE "legal_acceptances" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "legal_acceptances" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "legal_acceptances"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
-- Sólo insertar y leer: la prueba de aceptación no se modifica ni se borra.
GRANT SELECT, INSERT ON "legal_acceptances" TO plexo_app;

CREATE TYPE "LegalRequestType" AS ENUM ('WITHDRAWAL', 'CANCELLATION');

CREATE TABLE "legal_requests" (
    "id" TEXT NOT NULL,
    "type" "LegalRequestType" NOT NULL,
    "code" TEXT NOT NULL,
    "tenantId" TEXT,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "taxId" TEXT,
    "message" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "legal_requests_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "legal_requests_code_key" ON "legal_requests"("code");
CREATE INDEX "legal_requests_createdAt_idx" ON "legal_requests"("createdAt");
GRANT SELECT, INSERT ON "legal_requests" TO plexo_app;
