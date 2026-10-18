-- Fuente de una foto sugerida en el alta guiada de artículos (Open Food
-- Facts / Pexels). Null en las fotos que sube el usuario.
ALTER TABLE "article_images" ADD COLUMN "credit" TEXT;
