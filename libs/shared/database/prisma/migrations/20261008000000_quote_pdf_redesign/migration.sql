-- Rediseño del PDF de Cotizaciones: datos del emisor, condiciones
-- comerciales, contacto del cliente y bonificación por línea.

-- AlterTable
ALTER TABLE "tenant_settings" ADD COLUMN     "tradeName" TEXT,
ADD COLUMN     "contactPhone" TEXT,
ADD COLUMN     "contactEmail" TEXT,
ADD COLUMN     "website" TEXT,
ADD COLUMN     "logoUrl" TEXT,
ADD COLUMN     "brandColor" TEXT,
ADD COLUMN     "bankName" TEXT,
ADD COLUMN     "bankCbu" TEXT,
ADD COLUMN     "bankAlias" TEXT,
ADD COLUMN     "quoteShowBankDetails" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "quoteDefaultPaymentTerms" TEXT,
ADD COLUMN     "quoteDefaultDeliveryTerms" TEXT,
ADD COLUMN     "quoteDefaultDeliveryPlace" TEXT,
ADD COLUMN     "quoteDefaultWarranty" TEXT;

-- AlterTable
ALTER TABLE "quotes" ADD COLUMN     "paymentTerms" TEXT,
ADD COLUMN     "deliveryTerms" TEXT,
ADD COLUMN     "deliveryPlace" TEXT,
ADD COLUMN     "warranty" TEXT,
ADD COLUMN     "contactPersonId" TEXT;

-- AlterTable
ALTER TABLE "quote_lines" ADD COLUMN     "discountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_contactPersonId_fkey" FOREIGN KEY ("contactPersonId") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;
