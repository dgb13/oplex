-- Backfill: hasta la migración anterior (financial_account_currency_dimension)
-- no existía ninguna forma de dar de alta una moneda desde la UI (ver
-- InvoicingService.createCurrency/setBaseCurrency, agregados recién ahí), así
-- que ningún tenant creado antes de ese momento tiene una moneda marcada
-- isBase = true. Cotizaciones (y el resto del motor multi-moneda) ya exigen
-- Quote.currencyId no-nulo, así que sin esto esos tenants quedan sin poder
-- crear cotizaciones hasta que alguien entre a Preferencias a configurar una
-- moneda a mano. TenantProvisioningService ya crea la moneda base para los
-- tenants nuevos desde ahora - esto es sólo para los que ya existían.

-- Paso 1: si el tenant ya tenía una moneda ARS (creada a mano, sin base) y
-- todavía no tiene ninguna marcada base, promoverla en vez de duplicarla -
-- evitaría chocar con el unique (tenantId, code).
UPDATE "currencies" c
SET "isBase" = true
WHERE c."code" = 'ARS'
  AND NOT EXISTS (
    SELECT 1 FROM "currencies" c2 WHERE c2."tenantId" = c."tenantId" AND c2."isBase" = true
  );

-- Paso 2: al resto (la gran mayoría - tenants sin ninguna moneda cargada)
-- se le crea una ARS base nueva. ARS a secas porque el producto entero
-- asume Argentina (AFIP, CUIT, IIBB) - no hay noción de tenant multi-país.
INSERT INTO "currencies" ("id", "tenantId", "code", "name", "isBase")
SELECT gen_random_uuid()::text, t."id", 'ARS', 'Peso argentino', true
FROM "tenants" t
WHERE NOT EXISTS (
  SELECT 1 FROM "currencies" c WHERE c."tenantId" = t."id" AND c."isBase" = true
);
