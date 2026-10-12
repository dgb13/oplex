-- Precios y cupos de planes nuevos (decisión del usuario, 2026-10-12).
-- Precios en pesos SIN IVA, como siempre (ver subscription-pricing.ts). Se
-- leen en cada cobro, así que corren desde el próximo pago de cada
-- suscripción - no se toca tenant_subscriptions. Tampoco isActive,
-- productionModuleEnabled ni storefrontEnabled. Idempotente: se puede
-- correr dos veces sin cambiar el resultado.

-- AlterTable: null = clientes ilimitados.
ALTER TABLE "plans" ALTER COLUMN "maxClients" DROP NOT NULL;

-- AlterTable
ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "supportLevel" TEXT;
ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "aiAssistantUnlimited" BOOLEAN NOT NULL DEFAULT false;

UPDATE "plans" SET "name" = 'Basic Gratis', "priceMonthly" = 0, "maxUsers" = 1, "maxClients" = 50, "maxMonthlyInvoices" = 50,
  "aiInvoiceScanMonthlyQuota" = 20, "aiAssistantMonthlyQueryQuota" = 30, "aiAssistantUnlimited" = false,
  "debitDiscountPercent" = 0, "annualDiscountPercent" = 0, "supportLevel" = 'Email 72 h', "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'BASIC';

UPDATE "plans" SET "name" = 'Bronze', "priceMonthly" = 44900, "maxUsers" = 2, "maxClients" = 500, "maxMonthlyInvoices" = 400,
  "aiInvoiceScanMonthlyQuota" = 150, "aiAssistantMonthlyQueryQuota" = 200, "aiAssistantUnlimited" = false,
  "debitDiscountPercent" = 10, "annualDiscountPercent" = 20, "supportLevel" = 'Email 48 h', "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'BRONZE';

UPDATE "plans" SET "name" = 'Silver', "priceMonthly" = 79900, "maxUsers" = 4, "maxClients" = 2000, "maxMonthlyInvoices" = 1000,
  "aiInvoiceScanMonthlyQuota" = 400, "aiAssistantMonthlyQueryQuota" = 500, "aiAssistantUnlimited" = false,
  "debitDiscountPercent" = 10, "annualDiscountPercent" = 20, "supportLevel" = 'Email + chat 24 h', "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'SILVER';

UPDATE "plans" SET "name" = 'Gold', "priceMonthly" = 129900, "maxUsers" = 6, "maxClients" = 5000, "maxMonthlyInvoices" = 3000,
  "aiInvoiceScanMonthlyQuota" = 1000, "aiAssistantMonthlyQueryQuota" = 1500, "aiAssistantUnlimited" = false,
  "debitDiscountPercent" = 10, "annualDiscountPercent" = 20, "supportLevel" = 'Chat 8 h hábiles', "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'GOLD';

UPDATE "plans" SET "name" = 'Platinum', "priceMonthly" = 179900, "maxUsers" = 10, "maxClients" = 10000, "maxMonthlyInvoices" = 6000,
  "aiInvoiceScanMonthlyQuota" = 2000, "aiAssistantMonthlyQueryQuota" = 3000, "aiAssistantUnlimited" = false,
  "debitDiscountPercent" = 10, "annualDiscountPercent" = 20, "supportLevel" = 'Chat + WhatsApp 4 h', "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'PLATINUM';

-- Diamond: clientes y Asistente ilimitados.
UPDATE "plans" SET "name" = 'Diamond', "priceMonthly" = 299900, "maxUsers" = 20, "maxClients" = NULL, "maxMonthlyInvoices" = 15000,
  "aiInvoiceScanMonthlyQuota" = 5000, "aiAssistantMonthlyQueryQuota" = NULL, "aiAssistantUnlimited" = true,
  "debitDiscountPercent" = 10, "annualDiscountPercent" = 20, "supportLevel" = 'Prioritario 2 h, 99,5% uptime', "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'DIAMOND';
