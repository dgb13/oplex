-- Etapa 2 del plan de rubros (docs/planesdemodulos/plan-rubros-fichas-ordenes-trabajo.md).

-- Unidades para servicios que se cobran por tiempo (mano de obra, alquileres).
ALTER TYPE "UnitOfMeasure" ADD VALUE 'HOUR';
ALTER TYPE "UnitOfMeasure" ADD VALUE 'DAY';

-- Detalle libre por línea de factura (sale en el PDF, no va a ARCA). Columna
-- nueva y nullable: el trigger invoice_line_fiscal_lock no la afecta (sólo
-- frena UPDATE/DELETE de líneas de facturas con CAE).
ALTER TABLE "invoice_lines" ADD COLUMN "description" TEXT;
