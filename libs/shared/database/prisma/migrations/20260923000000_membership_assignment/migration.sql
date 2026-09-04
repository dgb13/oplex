-- CreateTable
CREATE TABLE "tenant_membership_assignments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "studioUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_membership_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenant_membership_assignments_tenantId_membershipId_studi_key" ON "tenant_membership_assignments"("tenantId", "membershipId", "studioUserId");

-- CreateIndex
CREATE INDEX "tenant_membership_assignments_tenantId_membershipId_idx" ON "tenant_membership_assignments"("tenantId", "membershipId");

-- AddForeignKey
ALTER TABLE "tenant_membership_assignments" ADD CONSTRAINT "tenant_membership_assignments_tenantId_membershipId_fkey" FOREIGN KEY ("tenantId", "membershipId") REFERENCES "tenant_memberships"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "tenant_membership_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_membership_assignments" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "tenant_membership_assignments"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "tenant_membership_assignments" TO plexo_app;

-- list_studio_memberships() ahora también devuelve el conjunto de
-- contadores asignados por fila (vacío = visible para todo el estudio,
-- ver docs/plan_modulo_contadores.txt Fase 2 punto 4) - Postgres no
-- permite cambiar las columnas de RETURNS TABLE con CREATE OR REPLACE,
-- hace falta DROP + CREATE de nuevo.
DROP FUNCTION list_studio_memberships(text);

CREATE FUNCTION list_studio_memberships(p_studio_tenant_id text)
RETURNS TABLE(
  id text,
  tenant_id text,
  client_tenant_name text,
  direction text,
  status text,
  invitee_identifier text,
  created_at timestamp(3),
  responded_at timestamp(3),
  assigned_studio_user_ids text[]
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.id, m."tenantId", t.name, m.direction::text, m.status::text, m."inviteeIdentifier", m."createdAt", m."respondedAt",
    COALESCE(array_agg(a."studioUserId") FILTER (WHERE a."studioUserId" IS NOT NULL), '{}')
  FROM tenant_memberships m
  JOIN tenants t ON t.id = m."tenantId"
  LEFT JOIN tenant_membership_assignments a ON a."tenantId" = m."tenantId" AND a."membershipId" = m.id
  WHERE m."homeTenantId" = p_studio_tenant_id
  GROUP BY m.id, m."tenantId", t.name, m.direction, m.status, m."inviteeIdentifier", m."createdAt", m."respondedAt"
  ORDER BY m."createdAt" DESC;
$$;

GRANT EXECUTE ON FUNCTION list_studio_memberships(text) TO plexo_app;
