-- Sección Mercado Pago, etapa 4: links de pago prendidos/apagados y cuenta de
-- dinero para los cobros. Ver docs/planesdemodulos/plan-seccion-mercadopago.md.

-- AlterTable
ALTER TABLE "tenant_settings"
  ADD COLUMN "mercadoPagoLinksEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "mercadoPagoFinancialAccountId" TEXT;
