-- AlterTable
ALTER TABLE "purchase_invoices" ADD COLUMN "aiScanConfidence" DECIMAL(4,3),
ADD COLUMN "aiScanEdited" BOOLEAN;
