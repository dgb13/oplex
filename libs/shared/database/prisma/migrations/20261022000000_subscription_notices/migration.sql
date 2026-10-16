-- Fin de prueba y cobro de planes: avisos por mail y motivo de rechazo.

-- Avisos ya mandados al cliente, para no repetirlos.
ALTER TABLE "tenant_subscriptions" ADD COLUMN "trialEndingNoticeSentAt" TIMESTAMP(3),
ADD COLUMN "renewalNoticeSentFor" TIMESTAMP(3);

-- Motivo del rechazo de una transferencia y quién la avisó.
ALTER TABLE "subscription_payments" ADD COLUMN "reviewNote" TEXT,
ADD COLUMN "reportedBy" TEXT;
