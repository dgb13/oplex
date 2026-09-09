-- Nota: `prisma migrate dev --create-only` también propuso el mismo drift
-- cosmético ya documentado (DROP+ADD de "purchase_invoices_purchaseOrderId_fkey"
-- y un RENAME de índice de tenant_membership_assignments) - descartado a
-- mano, sin relación con este cambio.

-- CreateEnum
CREATE TYPE "AssistantMessageFeedback" AS ENUM ('UP', 'DOWN');

-- AlterTable
ALTER TABLE "assistant_messages" ADD COLUMN     "feedback" "AssistantMessageFeedback";

-- AlterTable
ALTER TABLE "plans" ADD COLUMN     "aiAssistantMonthlyQueryQuota" INTEGER;
