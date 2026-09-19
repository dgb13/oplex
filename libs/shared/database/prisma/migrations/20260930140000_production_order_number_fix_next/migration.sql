-- Fix-forward de 20260930130000_production_order_number: ese backfill
-- numero las ordenes YA existentes tenant-wide (OP-000001..OP-0000N,
-- ordenadas por createdAt), pero dejo el productionOrderNextNumber de
-- CADA usuario sin tocar (seguia en 1, el default) - la proxima orden
-- creada por cualquier usuario de un tenant con ordenes backfilled iba a
-- pedir 'OP-000001' de nuevo y chocar con @@unique([tenantId, number]).
-- Empuja el contador de todo usuario de un tenant con ordenes a
-- (cantidad de ordenes del tenant + 1), asi ningun numero nuevo colisiona
-- con lo ya backfilled, sin importar quien cree la proxima orden.
UPDATE "users" u
SET "productionOrderNextNumber" = counts.total + 1
FROM (
  SELECT "tenantId", COUNT(*) AS total FROM "production_orders" GROUP BY "tenantId"
) counts
WHERE u."tenantId" = counts."tenantId" AND u."productionOrderNextNumber" <= counts.total;
