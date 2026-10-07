-- Backfill: hasta ahora el alta de un tenant (TenantProvisioningService) no
-- creaba ningún depósito, así que un tenant nuevo no podía cargar stock
-- inicial en un artículo (el selector de depósito aparecía vacío), ni
-- recibir mercadería ni abrir una caja hasta crear uno a mano en
-- Inventario. Desde ahora el alta crea "Depósito principal" - esto se lo
-- da a los tenants que ya existían sin ninguno. Los que ya tienen al menos
-- un depósito no se tocan.
INSERT INTO "warehouses" ("id", "tenantId", "name")
SELECT gen_random_uuid()::text, t."id", 'Depósito principal'
FROM "tenants" t
WHERE NOT EXISTS (
  SELECT 1 FROM "warehouses" w WHERE w."tenantId" = t."id"
);
