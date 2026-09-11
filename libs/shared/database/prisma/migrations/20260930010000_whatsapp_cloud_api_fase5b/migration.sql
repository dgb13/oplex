-- Fase 5b del asistente de IA (docs/plan-asistente-ia-conversacional.md,
-- sección 6.3): el webhook de WhatsApp Cloud API recibe un mensaje ANTES de
-- que exista cualquier contexto de tenant (no hay JWT, no hay sesión) - igual
-- problema que resolver "a qué tenant pertenece este email" en el login
-- (find_tenants_by_email) o "a qué tenant pertenece esta cuenta de Google"
-- en OAuth (find_tenant_by_oauth_account). Mismo mecanismo acá: dos
-- funciones SECURITY DEFINER, sólo lectura, que un service normal (RLS
-- activo) no podría ejecutar por sí mismo porque no hay `app.tenant_id`
-- seteado todavía - son la ÚNICA forma en que el webhook resuelve identidad
-- antes de abrir withTenantContext.

-- Un número YA vinculado y verificado (WhatsAppLink.phoneE164 es único
-- global) - a lo sumo una fila. Usado en CADA mensaje entrante para resolver
-- {tenantId, userId} y armar el mismo objeto de identidad que usaría un JWT
-- decodificado (sección 3.1 del plan).
CREATE FUNCTION find_whatsapp_link_by_phone(p_phone text)
RETURNS TABLE(tenant_id text, user_id text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT "tenantId", "userId" FROM whatsapp_links WHERE "phoneE164" = p_phone;
$$;

GRANT EXECUTE ON FUNCTION find_whatsapp_link_by_phone(text) TO plexo_app;

-- Un código pendiente de confirmar (WhatsAppLinkRequest.phoneE164 NO es
-- único - dos usuarios de tenants distintos podrían tipear el mismo número a
-- la vez) - puede devolver 0, 1 o varias filas. El webhook prueba
-- WhatsAppLinkService.confirmCode() contra cada candidato hasta que uno
-- confirme, en vez de asumir que hay una única fila posible. Sólo trae
-- pendientes no vencidos - uno vencido nunca puede confirmarse igual
-- (confirmCode también lo revalida), evitarlo acá ahorra ese loop en el caso
-- común de un código viejo que nadie limpió.
CREATE FUNCTION find_whatsapp_link_requests_by_phone(p_phone text)
RETURNS TABLE(tenant_id text, user_id text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT "tenantId", "userId" FROM whatsapp_link_requests
  WHERE "phoneE164" = p_phone AND "expiresAt" > now();
$$;

GRANT EXECUTE ON FUNCTION find_whatsapp_link_requests_by_phone(text) TO plexo_app;
