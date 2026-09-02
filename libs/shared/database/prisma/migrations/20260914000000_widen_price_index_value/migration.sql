-- Ampliado de Decimal(18,6) a Decimal(30,6) como defensa adicional, además
-- del corte a MIN_PERIOD (2017-01) en RealArgentinaDatosPriceIndexService -
-- confirmado con un overflow real de indexValue encadenando la serie
-- completa desde 1943 (desborda alrededor de 1988, en plena hiperinflación
-- argentina) antes de acotar la fuente a la ventana que RT6/NC39
-- efectivamente necesita.
ALTER TABLE "price_index_entries" ALTER COLUMN "indexValue" SET DATA TYPE DECIMAL(30,6);
