-- Teléfono y sitio web de la empresa/sucursal, para el encabezado del
-- comprobante - a pedido del usuario. Nullable, sin backfill: ninguna
-- empresa existente cambia de comportamiento.

-- AlterTable
ALTER TABLE "companies" ADD COLUMN "phone" TEXT;
ALTER TABLE "companies" ADD COLUMN "website" TEXT;
