-- Resuelve un CUIT a un tenant, mismo mecanismo/motivo que
-- find_tenants_by_email (migración 20260826000000_auth_onboarding): esto
-- corre para un tenant (o estudio) que todavía no tiene ningún contexto RLS
-- sobre el tenant que está buscando - MembershipsService.resolveIdentifier
-- lo usa para "invitar por CUIT"/"pedir acceso por CUIT" en vez de por
-- email. Normaliza ambos lados (sólo dígitos) porque Tenant.taxId se
-- guarda tal cual lo tipeó el usuario, con o sin guiones.
CREATE FUNCTION find_tenant_by_tax_id(p_tax_id text)
RETURNS TABLE(tenant_id text, tenant_name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, name FROM tenants
  WHERE "taxId" IS NOT NULL
    AND regexp_replace("taxId", '\D', '', 'g') = regexp_replace(p_tax_id, '\D', '', 'g');
$$;

GRANT EXECUTE ON FUNCTION find_tenant_by_tax_id(text) TO plexo_app;
