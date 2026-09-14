-- Módulo de Producción (ver docs/OPLEX-Produccion-Plan-Tecnico-14-9.md, Fase
-- 1): on/off puro por plan, sin cupo de uso. El DEFAULT false de la columna
-- ya cubre altas futuras de planes - este backfill sólo ajusta los planes
-- existentes: BASIC (gratis) se queda sin el módulo, BRONZE en adelante lo
-- tiene incluido desde el día uno (decisión con el usuario, 2026-09-14). El
-- SuperAdmin puede después prender/apagar por plan libremente desde
-- /admin/plans, esto es sólo el estado inicial.
ALTER TABLE "plans" ADD COLUMN "productionModuleEnabled" BOOLEAN NOT NULL DEFAULT false;

UPDATE "plans" SET "productionModuleEnabled" = true WHERE "sortOrder" >= 2;
