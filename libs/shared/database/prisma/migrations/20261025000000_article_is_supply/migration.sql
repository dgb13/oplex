-- Insumo explícito (no se vende). Los artículos que ya eran insumos de
-- hecho - sin precio de venta en ninguna variante, fuera del catálogo y que
-- no son servicios - quedan marcados, así nadie tiene que corregirlos.
ALTER TABLE "articles" ADD COLUMN "isSupply" BOOLEAN NOT NULL DEFAULT false;

UPDATE "articles" a
SET "isSupply" = true
WHERE a."isService" = false
  AND a."isPublished" = false
  AND EXISTS (SELECT 1 FROM "article_variants" v WHERE v."articleId" = a.id)
  AND NOT EXISTS (SELECT 1 FROM "article_variants" v WHERE v."articleId" = a.id AND v."unitPrice" > 0);
