-- Rediseño del PDF de facturas y notas de crédito (5 estilos como las
-- cotizaciones).

-- Estilo por defecto del PDF de Facturación, por usuario (junto al tamaño
-- de papel que ya existía).
ALTER TABLE "users" ADD COLUMN "invoicePdfStyle" "PdfStyle" NOT NULL DEFAULT 'MODERNO';

-- Mostrar los datos bancarios en las facturas (los de cotizaciones tienen
-- su propia casilla).
ALTER TABLE "tenant_settings" ADD COLUMN "invoiceShowBankDetails" BOOLEAN NOT NULL DEFAULT true;

-- Observaciones opcionales de la factura y domicilio del cliente al
-- momento de emitir (antes el PDF lo leía de la ficha al imprimir).
ALTER TABLE "invoices" ADD COLUMN "notes" TEXT,
ADD COLUMN "customerFiscalAddress" TEXT;

-- Facturas existentes: el domicilio actual de la ficha es lo mejor que hay.
UPDATE "invoices" i SET "customerFiscalAddress" = c."fiscalAddress"
FROM "companies" c WHERE c."id" = i."customerId" AND c."tenantId" = i."tenantId";
