-- Una cuenta que se registró con el plan gratis arrancaba "en prueba" y al
-- vencer pasaba a sólo lectura. Ahora el plan gratis arranca activo y sin
-- vencimiento (SubscriptionService.startTrial); esto corrige las que ya
-- estaban en prueba con un plan gratis.
UPDATE "tenant_subscriptions" s
SET "status" = 'ACTIVE', "currentPeriodEnd" = NULL, "graceEndsAt" = NULL, "updatedAt" = CURRENT_TIMESTAMP
FROM "plans" p
WHERE p."id" = s."planId"
  AND p."priceMonthly" <= 0
  AND s."status" IN ('TRIALING', 'EXPIRED')
  AND NOT EXISTS (SELECT 1 FROM "subscription_payments" sp WHERE sp."tenantId" = s."tenantId" AND sp."status" = 'PENDING');
