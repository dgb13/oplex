-- Discriminador de tipo de medición por artículo (ver
-- docs/OPLEX-Produccion-Plan-Tecnico-14-9.md, Fase 3/4.1). Sólo los campos
-- que CONTINUO necesita llegan en esta migración (purchaseSize/baseUnit) -
-- isManufactured y los campos propios de 1D/2D llegan recién con
-- StockPiece/BOM/ProductionOrder en la Fase 4.
--
-- DEFAULT 'DISCRETE' hace que ningún artículo existente cambie de
-- comportamiento: sin backfill de datos, todo queda DISCRETE tal cual
-- estaba (decisión ya confirmada con el usuario, ver Fase 4.1 del plan).

-- CreateEnum
CREATE TYPE "MeasurementType" AS ENUM ('DISCRETE', 'CONTINUOUS', 'LINEAL_1D', 'SURFACE_2D');

-- AlterTable
ALTER TABLE "articles" ADD COLUMN "measurementType" "MeasurementType" NOT NULL DEFAULT 'DISCRETE',
                        ADD COLUMN "purchaseSize" DECIMAL(14,3),
                        ADD COLUMN "baseUnit" TEXT;
