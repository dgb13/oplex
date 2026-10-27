-- Marcas y modelos de vehículos para las fichas (Marca y Modelo se eligen de
-- una lista en vez de escribirse). Tablas de plataforma, sin RLS, como
-- business_templates. Sin DELETE: se ocultan (active).
CREATE TABLE "vehicle_brands" (
    "id" TEXT NOT NULL,
    "vehicleKind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "reviewed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "vehicle_brands_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "vehicle_brands_vehicleKind_name_key" ON "vehicle_brands"("vehicleKind", "name");

CREATE TABLE "vehicle_models" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "reviewed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "vehicle_models_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "vehicle_models_brandId_name_key" ON "vehicle_models"("brandId", "name");
ALTER TABLE "vehicle_models" ADD CONSTRAINT "vehicle_models_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "vehicle_brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "vehicle_catalog_suggestions" (
    "id" TEXT NOT NULL,
    "vehicleKind" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "brandName" TEXT,
    "text" TEXT NOT NULL,
    "matchKey" TEXT NOT NULL,
    "tenantIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "vehicle_catalog_suggestions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "vehicle_catalog_suggestions_matchKey_key" ON "vehicle_catalog_suggestions"("matchKey");
CREATE INDEX "vehicle_catalog_suggestions_status_updatedAt_idx" ON "vehicle_catalog_suggestions"("status", "updatedAt");

GRANT SELECT, INSERT, UPDATE ON "vehicle_brands" TO plexo_app;
GRANT SELECT, INSERT, UPDATE ON "vehicle_models" TO plexo_app;
GRANT SELECT, INSERT, UPDATE ON "vehicle_catalog_suggestions" TO plexo_app;

-- Lista inicial armada por Oplex SIN verificar contra una fuente oficial
-- (reviewed = false): se revisa y corrige desde /admin › Marcas y modelos.
CREATE TEMP TABLE "_vehicle_seed" ("kind" TEXT, "brand" TEXT, "models" TEXT[]);
INSERT INTO "_vehicle_seed" VALUES
  ('AUTO', 'Audi', ARRAY['A1', 'A3', 'A4', 'A5', 'Q2', 'Q3', 'Q5', 'Q7']),
  ('AUTO', 'BMW', ARRAY['Serie 1', 'Serie 3', 'Serie 5', 'X1', 'X3', 'X5']),
  ('AUTO', 'BYD', ARRAY['Dolphin', 'Dolphin Mini', 'Seal', 'Song Plus', 'Yuan Pro']),
  ('AUTO', 'Chery', ARRAY['Arrizo 5', 'QQ', 'Tiggo 2', 'Tiggo 3', 'Tiggo 4', 'Tiggo 7', 'Tiggo 8']),
  ('AUTO', 'Chevrolet', ARRAY['Agile', 'Astra', 'Aveo', 'Celta', 'Classic', 'Corsa', 'Cruze', 'Equinox', 'Meriva', 'Montana', 'Onix', 'Prisma', 'S10', 'Sonic', 'Spin', 'Tracker', 'Trailblazer', 'Vectra']),
  ('AUTO', 'Citroën', ARRAY['Berlingo', 'C3', 'C3 Aircross', 'C4', 'C4 Cactus', 'C4 Lounge', 'C5 Aircross', 'Jumper', 'Xsara Picasso']),
  ('AUTO', 'DS', ARRAY['DS3', 'DS7']),
  ('AUTO', 'Fiat', ARRAY['500', 'Argo', 'Cronos', 'Doblò', 'Ducato', 'Fastback', 'Fiorino', 'Grand Siena', 'Idea', 'Mobi', 'Palio', 'Pulse', 'Punto', 'Siena', 'Strada', 'Toro', 'Uno']),
  ('AUTO', 'Ford', ARRAY['Bronco', 'EcoSport', 'Escape', 'F-100', 'F-150', 'Fiesta', 'Focus', 'Ka', 'Kuga', 'Maverick', 'Mondeo', 'Ranger', 'Territory', 'Transit']),
  ('AUTO', 'Haval', ARRAY['H6', 'Jolion']),
  ('AUTO', 'Honda', ARRAY['City', 'Civic', 'CR-V', 'Fit', 'HR-V', 'WR-V', 'ZR-V']),
  ('AUTO', 'Hyundai', ARRAY['Creta', 'H1', 'HB20', 'i10', 'Santa Fe', 'Tucson']),
  ('AUTO', 'Iveco', ARRAY['Daily']),
  ('AUTO', 'Jeep', ARRAY['Commander', 'Compass', 'Grand Cherokee', 'Renegade', 'Wrangler']),
  ('AUTO', 'Kia', ARRAY['Cerato', 'K2500', 'Picanto', 'Rio', 'Seltos', 'Sorento', 'Sportage']),
  ('AUTO', 'Mercedes-Benz', ARRAY['Clase A', 'Clase C', 'Clase E', 'GLA', 'GLC', 'Sprinter', 'Vito']),
  ('AUTO', 'Mitsubishi', ARRAY['ASX', 'L200', 'Outlander']),
  ('AUTO', 'Nissan', ARRAY['Frontier', 'Kicks', 'March', 'Note', 'Sentra', 'Tiida', 'Versa', 'X-Trail']),
  ('AUTO', 'Peugeot', ARRAY['2008', '206', '207', '208', '3008', '307', '308', '408', '5008', 'Boxer', 'Expert', 'Partner']),
  ('AUTO', 'RAM', ARRAY['1500', '2500', '700', 'Rampage']),
  ('AUTO', 'Renault', ARRAY['Alaskan', 'Arkana', 'Captur', 'Clio', 'Duster', 'Duster Oroch', 'Fluence', 'Kangoo', 'Koleos', 'Kwid', 'Logan', 'Master', 'Megane', 'Sandero', 'Sandero Stepway', 'Symbol']),
  ('AUTO', 'Suzuki', ARRAY['Grand Vitara', 'Jimny', 'Swift', 'Vitara']),
  ('AUTO', 'Toyota', ARRAY['Camry', 'Corolla', 'Corolla Cross', 'Etios', 'Hiace', 'Hilux', 'Land Cruiser', 'RAV4', 'SW4', 'Yaris']),
  ('AUTO', 'Volkswagen', ARRAY['Amarok', 'Bora', 'Fox', 'Gol', 'Gol Trend', 'Golf', 'Nivus', 'Passat', 'Polo', 'Saveiro', 'Suran', 'T-Cross', 'Taos', 'Tiguan', 'Up!', 'Vento', 'Virtus', 'Voyage']),
  ('AUTO', 'Volvo', ARRAY['XC40', 'XC60', 'XC90']),
  ('MOTO', 'Bajaj', ARRAY['Boxer', 'Dominar 250', 'Dominar 400', 'Pulsar NS 160', 'Pulsar NS 200', 'Rouser 135']),
  ('MOTO', 'Benelli', ARRAY['Leoncino 500', 'TNT 15', 'TNT 300', 'TRK 502']),
  ('MOTO', 'Corven', ARRAY['Energy 110', 'Expert 150', 'Hunter 150', 'Mirage 110', 'Triax 150', 'Triax 250']),
  ('MOTO', 'Gilera', ARRAY['Frontier 150', 'Sahel 150', 'Smash 110', 'VC 150']),
  ('MOTO', 'Guerrero', ARRAY['Day 70', 'G 110', 'GXL 150', 'Trip 110']),
  ('MOTO', 'Honda', ARRAY['Africa Twin', 'Biz 125', 'CB 190R', 'CB 250 Twister', 'CG 150 Titan', 'Elite 125', 'NC 750X', 'Wave 110', 'XR 150L', 'XR 190L', 'XR 250 Tornado']),
  ('MOTO', 'Kawasaki', ARRAY['KLR 650', 'Ninja 400', 'Versys 300', 'Z400']),
  ('MOTO', 'Keller', ARRAY['Miracle 150', 'Quasar 150', 'Stratus 110']),
  ('MOTO', 'KTM', ARRAY['390 Adventure', 'Duke 200', 'Duke 390']),
  ('MOTO', 'Mondial', ARRAY['HD 254', 'LD 110']),
  ('MOTO', 'Motomel', ARRAY['Blitz 110', 'CG 150 S2', 'Dakar 200', 'Max 110', 'Sirius 190', 'Skua 150', 'Skua 250', 'Strato 150']),
  ('MOTO', 'Royal Enfield', ARRAY['Classic 350', 'Himalayan', 'Interceptor 650', 'Meteor 350']),
  ('MOTO', 'Suzuki', ARRAY['AX 100', 'Gixxer 150', 'GN 125', 'V-Strom 650']),
  ('MOTO', 'Voge', ARRAY['300 AC', '500 DS']),
  ('MOTO', 'Yamaha', ARRAY['Crypton 110', 'FZ 16', 'FZ 25', 'MT-03', 'R3', 'Ray Z', 'XTZ 125', 'XTZ 250', 'YBR 125']),
  ('MOTO', 'Zanella', ARRAY['Ceccato 150', 'Patagonian Eagle 150', 'RX 150', 'Styler 150', 'ZB 110', 'ZR 150']);

INSERT INTO "vehicle_brands" ("id", "vehicleKind", "name", "updatedAt")
SELECT gen_random_uuid()::text, "kind", "brand", CURRENT_TIMESTAMP FROM "_vehicle_seed";

INSERT INTO "vehicle_models" ("id", "brandId", "name", "updatedAt")
SELECT gen_random_uuid()::text, b."id", m."name", CURRENT_TIMESTAMP
FROM "_vehicle_seed" s
JOIN "vehicle_brands" b ON b."vehicleKind" = s."kind" AND b."name" = s."brand"
CROSS JOIN LATERAL unnest(s."models") AS m("name");

-- Rubros con vehículos: Marca y Modelo pasan a elegirse de la lista. Versión
-- nueva de la plantilla: los negocios que ya eligieron el rubro lo reciben
-- como novedad ("Marca se elige de la lista") y deciden si lo aplican.
-- Sólo si el campo sigue siendo Texto (en /admin pudo haberse cambiado).
UPDATE "business_templates" t
SET "config" = jsonb_set(
      t."config",
      '{assetType,fields}',
      (
        SELECT jsonb_agg(
          CASE
            WHEN f->>'key' = 'marca' THEN f || jsonb_build_object('type', 'VEHICLE_BRAND', 'vehicleKind', CASE WHEN t."key" = 'taller-de-motos' THEN 'MOTO' ELSE 'AUTO' END)
            WHEN f->>'key' = 'modelo' THEN f || '{"type":"VEHICLE_MODEL"}'::jsonb
            ELSE f
          END
          ORDER BY o
        )
        FROM jsonb_array_elements(t."config"->'assetType'->'fields') WITH ORDINALITY AS a(f, o)
      )
    ),
    "version" = t."version" + 1,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE t."key" IN ('taller-mecanico', 'chapa-y-pintura', 'electricidad-del-automotor', 'gomeria', 'lavadero-de-autos', 'lubricentro', 'taller-de-motos')
  AND t."config"->'assetType'->>'name' = 'Vehículo'
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(t."config"->'assetType'->'fields') f
    WHERE f->>'key' = 'marca' AND f->>'type' = 'TEXT'
  )
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(t."config"->'assetType'->'fields') f
    WHERE f->>'key' = 'modelo' AND f->>'type' = 'TEXT'
  );

INSERT INTO "business_template_versions" ("id", "templateId", "version", "config", "publishedBy")
SELECT gen_random_uuid()::text, t."id", t."version", t."config", 'migración: marcas y modelos'
FROM "business_templates" t
WHERE t."key" IN ('taller-mecanico', 'chapa-y-pintura', 'electricidad-del-automotor', 'gomeria', 'lavadero-de-autos', 'lubricentro', 'taller-de-motos')
  AND NOT EXISTS (
    SELECT 1 FROM "business_template_versions" v WHERE v."templateId" = t."id" AND v."version" = t."version"
  );

DROP TABLE "_vehicle_seed";
