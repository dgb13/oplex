-- Cobro con QR de Mercado Pago en Caja (modo híbrido, API de órdenes).
-- Mockup aprobado 2026-10-01. Ver MercadoPagoQrService.

-- AlterTable
ALTER TABLE "cash_registers" ADD COLUMN     "mpExternalPosId" TEXT,
ADD COLUMN     "mpPosId" TEXT,
ADD COLUMN     "mpQrActivatedAt" TIMESTAMP(3),
ADD COLUMN     "mpQrImageUrl" TEXT,
ADD COLUMN     "mpQrTemplateUrl" TEXT;

-- AlterTable
ALTER TABLE "payment_intents" ADD COLUMN     "consumedByInvoiceId" TEXT,
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "externalStatus" TEXT;

-- CreateTable
CREATE TABLE "mercadopago_stores" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "mpStoreId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "streetName" TEXT NOT NULL,
    "streetNumber" TEXT NOT NULL,
    "cityName" TEXT NOT NULL,
    "stateName" TEXT NOT NULL,
    "latitude" DECIMAL(10,7) NOT NULL,
    "longitude" DECIMAL(10,7) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mercadopago_stores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mercadopago_stores_branchId_key" ON "mercadopago_stores"("branchId");

-- CreateIndex
CREATE INDEX "mercadopago_stores_tenantId_idx" ON "mercadopago_stores"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_intents_consumedByInvoiceId_key" ON "payment_intents"("consumedByInvoiceId");

-- AddForeignKey
ALTER TABLE "mercadopago_stores" ADD CONSTRAINT "mercadopago_stores_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- RLS + GRANT para la tabla nueva, mismo patrón que cash_registers.
ALTER TABLE "mercadopago_stores" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mercadopago_stores" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "mercadopago_stores"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "mercadopago_stores" TO plexo_app;

-- El aviso "Order (Mercado Pago)" de un cobro QR llega sin ?client=<tenant>
-- (lo manda la configuración de webhooks de la app, no una notification_url
-- por orden) y antes de que haya contexto de tenant - mismo problema que
-- find_whatsapp_link_by_phone. El id de la orden de MP (externalId) sólo lo
-- conocen MP y el tenant que la creó: con eso se resuelve el tenant y recién
-- ahí se abre withTenantContext. Sólo lectura, sólo cobros POS_QR.
CREATE FUNCTION find_payment_intent_tenant_by_external_id(p_external_id text)
RETURNS TABLE(tenant_id text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT "tenantId" FROM payment_intents
  WHERE "externalId" = p_external_id AND "documentType" = 'POS_QR';
$$;

GRANT EXECUTE ON FUNCTION find_payment_intent_tenant_by_external_id(text) TO plexo_app;
