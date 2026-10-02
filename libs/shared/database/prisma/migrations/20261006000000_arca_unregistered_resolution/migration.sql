-- Cómo se resolvió cada comprobante de ARCA sin registrar (anulado con nota
-- de crédito o marcado como resuelto) - ver InvoicingService.

-- AlterTable
ALTER TABLE "arca_unregistered_vouchers" ADD COLUMN     "cancelledByCae" TEXT,
ADD COLUMN     "cancelledByNumber" TEXT,
ADD COLUMN     "resolution" TEXT,
ADD COLUMN     "resolvedByUserId" TEXT;
