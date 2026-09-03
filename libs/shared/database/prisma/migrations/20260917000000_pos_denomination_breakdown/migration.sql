-- AlterTable
-- Desglose de billetes/monedas del cierre (estilo Odoo, Fase 2 de Caja/POS).
-- Nullable a propósito: sólo se completa si el cajero usó el modo desglose
-- en el cierre en vez de tipear un total a mano. No requiere RLS nuevo -
-- cash_sessions ya lo tiene desde 20260916000000_pos_cash_registers.
ALTER TABLE "cash_sessions" ADD COLUMN "denominationBreakdown" JSONB;
