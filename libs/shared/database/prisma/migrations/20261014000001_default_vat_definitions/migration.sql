-- Backfill: el alta de un tenant no creaba ninguna alícuota de IVA, así que
-- los artículos cargados a mano quedaban sin IVA (la factura de un
-- Responsable Inscripto salía al 0% salvo que se cambiara cada línea) y no
-- se podía calcular el costo real con IVA de un Monotributista. Desde ahora
-- el alta las crea (DEFAULT_VAT_DEFINITIONS en vat-cost.ts); esto se las da
-- a los tenants existentes. Un código que el tenant ya tenía (p. ej. IVA21
-- cargado a mano) no se toca. validFrom en el pasado para que también
-- resuelvan para fechas anteriores.
INSERT INTO "tax_definitions" ("id", "tenantId", "code", "name", "calculationType", "rate", "validFrom")
SELECT gen_random_uuid()::text, t."id", d.code, d.name, d."calculationType"::"TaxCalculationType", d.rate, TIMESTAMP '2000-01-01'
FROM "tenants" t
CROSS JOIN (VALUES
  ('IVA21', 'IVA 21%', 'PERCENTAGE', 21.00),
  ('IVA10_5', 'IVA 10,5%', 'PERCENTAGE', 10.50),
  ('IVA27', 'IVA 27%', 'PERCENTAGE', 27.00),
  ('IVA5', 'IVA 5%', 'PERCENTAGE', 5.00),
  ('IVA2_5', 'IVA 2,5%', 'PERCENTAGE', 2.50),
  ('IVA_EXENTO', 'Exento', 'EXENTO', NULL),
  ('IVA_NO_GRAVADO', 'No gravado', 'NO_GRAVADO', NULL)
) AS d(code, name, "calculationType", rate)
WHERE NOT EXISTS (
  SELECT 1 FROM "tax_definitions" td WHERE td."tenantId" = t."id" AND td."code" = d.code
);
