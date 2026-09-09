-- Nota: mismo drift cosmético ya documentado en migraciones anteriores
-- (FK de purchase_invoices + rename de índice), descartado a mano.

-- AlterTable
ALTER TABLE "platform_settings" ADD COLUMN     "assistantRateLimitMaxMessages" INTEGER NOT NULL DEFAULT 20,
ADD COLUMN     "assistantRateLimitWindowMinutes" INTEGER NOT NULL DEFAULT 5;
