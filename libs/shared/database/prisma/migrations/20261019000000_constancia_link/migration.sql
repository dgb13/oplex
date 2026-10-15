-- Enlace administrable a la consulta pública de la Constancia de Inscripción
-- de ARCA + resultado de su última verificación (ver ArcaConstanciaLinkService).
ALTER TABLE "platform_settings" ADD COLUMN "constanciaUrl" TEXT;
ALTER TABLE "platform_settings" ADD COLUMN "constanciaUrlCheckAt" TIMESTAMP(3);
ALTER TABLE "platform_settings" ADD COLUMN "constanciaUrlCheckStatus" TEXT;
ALTER TABLE "platform_settings" ADD COLUMN "constanciaUrlCheckMessage" TEXT;
