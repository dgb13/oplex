-- CreateEnum
CREATE TYPE "MembershipDirection" AS ENUM ('CLIENT_INVITED', 'ACCOUNTANT_REQUESTED');
CREATE TYPE "MembershipStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'REVOKED');

-- CreateTable
CREATE TABLE "tenant_memberships" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "homeTenantId" TEXT NOT NULL,
    "inviteeIdentifier" TEXT,
    "direction" "MembershipDirection" NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'PENDING',
    "initiatedByUserId" TEXT NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_membership_links" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "studioUserId" TEXT NOT NULL,
    "linkedUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_membership_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenant_memberships_tenantId_id_key" ON "tenant_memberships"("tenantId", "id");

-- CreateIndex
CREATE INDEX "tenant_memberships_tenantId_idx" ON "tenant_memberships"("tenantId");

-- CreateIndex
CREATE INDEX "tenant_memberships_homeTenantId_idx" ON "tenant_memberships"("homeTenantId");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_membership_links_membershipId_studioUserId_key" ON "tenant_membership_links"("membershipId", "studioUserId");

-- CreateIndex
CREATE INDEX "tenant_membership_links_tenantId_idx" ON "tenant_membership_links"("tenantId");

-- AddForeignKey
ALTER TABLE "tenant_membership_links" ADD CONSTRAINT "tenant_membership_links_tenantId_membershipId_fkey" FOREIGN KEY ("tenantId", "membershipId") REFERENCES "tenant_memberships"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
-- FK simple a propósito, no compuesta: linkedUserId lo arma siempre el
-- propio backend dentro de withTenantContext(tenant cliente) en el mismo
-- momento que crea el User referenciado, nunca sale de un body de request -
-- ver comentario en schema.prisma.
ALTER TABLE "tenant_membership_links" ADD CONSTRAINT "tenant_membership_links_linkedUserId_fkey" FOREIGN KEY ("linkedUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "platform_settings" ADD COLUMN "membershipSessionDurationHours" INTEGER NOT NULL DEFAULT 2;

ALTER TABLE "tenant_memberships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_memberships" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "tenant_memberships"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "tenant_memberships" TO plexo_app;

ALTER TABLE "tenant_membership_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_membership_links" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "tenant_membership_links"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "tenant_membership_links" TO plexo_app;

-- Lee las membresías de UN estudio (homeTenantId) sin importar en qué
-- tenant esté parado el caller ahora mismo - RLS estándar de
-- tenant_memberships no alcanza para esto porque la fila vive scoped al
-- tenant CLIENTE, no al estudio. Mismo mecanismo ya probado que
-- list_tenant_ids()/find_tenants_by_email (SECURITY DEFINER, GRANT EXECUTE
-- acotado a plexo_app) - el único chequeo de seguridad que le corresponde a
-- esta función es que quien la invoque pase su propio tenantId, nunca uno
-- ajeno (responsabilidad del código de aplicación que la llama, ver
-- MembershipsService).
CREATE FUNCTION list_studio_memberships(p_studio_tenant_id text)
RETURNS TABLE(
  id text,
  tenant_id text,
  client_tenant_name text,
  direction text,
  status text,
  invitee_identifier text,
  created_at timestamp(3),
  responded_at timestamp(3)
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.id, m."tenantId", t.name, m.direction::text, m.status::text, m."inviteeIdentifier", m."createdAt", m."respondedAt"
  FROM tenant_memberships m JOIN tenants t ON t.id = m."tenantId"
  WHERE m."homeTenantId" = p_studio_tenant_id
  ORDER BY m."createdAt" DESC;
$$;

GRANT EXECUTE ON FUNCTION list_studio_memberships(text) TO plexo_app;
