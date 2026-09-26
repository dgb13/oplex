-- Asistente "Conexión con ARCA" (Preferencias): clave+CSR generados por
-- Oplex, alias del certificado, tickets de WSAA persistidos (cifrados) y
-- resultado de "Probar conexión". Todo aditivo y nullable.
ALTER TABLE "tenant_settings" ADD COLUMN "afipCertAlias" TEXT;
ALTER TABLE "tenant_settings" ADD COLUMN "afipPendingKeyEncrypted" TEXT;
ALTER TABLE "tenant_settings" ADD COLUMN "afipPendingCsr" TEXT;
ALTER TABLE "tenant_settings" ADD COLUMN "afipPendingAlias" TEXT;
ALTER TABLE "tenant_settings" ADD COLUMN "afipWsaaTicketsEncrypted" TEXT;
ALTER TABLE "tenant_settings" ADD COLUMN "afipLastCheckAt" TIMESTAMP(3);
ALTER TABLE "tenant_settings" ADD COLUMN "afipLastCheckOk" BOOLEAN;
ALTER TABLE "tenant_settings" ADD COLUMN "afipLastCheckMessage" TEXT;
