-- `prisma migrate dev --create-only` también propuso el mismo drift
-- cosmético ya documentado y descartado en otras migraciones de este repo
-- (DROP+ADD de "purchase_invoices_purchaseOrderId_fkey" y un RENAME de
-- índice de tenant_membership_assignments) - descartado a mano, sin
-- relación con este cambio.

-- CreateTable: pending de vinculación (docs/plan-asistente-ia-conversacional.md,
-- sección 3.3) - un código activo por usuario a la vez (userId único),
-- reintentar sobreescribe el mismo row en vez de acumular filas viejas.
-- Se borra apenas el código coincide y se crea la fila en whatsapp_links.
CREATE TABLE "whatsapp_link_requests" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "phoneE164" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastSentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_link_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable: el link ya verificado. phoneE164 único GLOBAL (no por
-- tenant) - un número de WhatsApp resuelve a un único tenant+usuario en
-- toda la plataforma, mismo criterio que
-- oauth_accounts_provider_providerAccountId_key.
CREATE TABLE "whatsapp_links" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "phoneE164" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_link_requests_userId_key" ON "whatsapp_link_requests"("userId");
CREATE INDEX "whatsapp_link_requests_tenantId_idx" ON "whatsapp_link_requests"("tenantId");

CREATE UNIQUE INDEX "whatsapp_links_userId_key" ON "whatsapp_links"("userId");
CREATE UNIQUE INDEX "whatsapp_links_phoneE164_key" ON "whatsapp_links"("phoneE164");
CREATE INDEX "whatsapp_links_tenantId_idx" ON "whatsapp_links"("tenantId");

-- AddForeignKey
ALTER TABLE "whatsapp_link_requests" ADD CONSTRAINT "whatsapp_link_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "whatsapp_links" ADD CONSTRAINT "whatsapp_links_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS: mismo patrón que toda otra tabla tenant-scoped nueva (ver
-- 20260826000000_auth_onboarding) - las 2 tablas son tenant-scoped, la
-- unicidad global de phoneE164 en whatsapp_links no depende de RLS (un
-- índice único no se filtra por policy, sigue siendo global aunque cada
-- SELECT normal sólo vea las filas del propio tenant).
ALTER TABLE "whatsapp_link_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "whatsapp_link_requests" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "whatsapp_link_requests"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "whatsapp_link_requests" TO plexo_app;

ALTER TABLE "whatsapp_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "whatsapp_links" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "whatsapp_links"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "whatsapp_links" TO plexo_app;
