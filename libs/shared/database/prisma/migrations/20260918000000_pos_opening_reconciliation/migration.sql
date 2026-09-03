-- AlterTable
-- Simétrico a 20260917000000_pos_denomination_breakdown pero para la
-- APERTURA (Fase 3 de Caja/POS): desglose de billetes/monedas con el que
-- el cajero entrante contó el cajón, y diferencia contra el countedAmount
-- del último turno CERRADO de la misma caja. Ambas columnas nullable a
-- propósito (primer turno de la caja, o cajero que usó el modo "monto
-- simple"). No requiere RLS nuevo - cash_sessions ya lo tiene desde
-- 20260916000000_pos_cash_registers.
ALTER TABLE "cash_sessions" ADD COLUMN "openingDenominationBreakdown" JSONB;
ALTER TABLE "cash_sessions" ADD COLUMN "openingDifference" DECIMAL(14,2);
