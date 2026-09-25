-- Fecha de inicio PROGRAMADA de la orden de producción (la elige el
-- usuario al crearla o al repetir una del Historial, y se puede
-- reprogramar mientras no se inició). Distinta de "startedAt", que es el
-- inicio REAL (botón "Iniciar producción", PLANNED -> IN_PROGRESS). Null
-- en órdenes creadas antes de este campo.
ALTER TABLE "production_orders" ADD COLUMN "scheduledStartAt" TIMESTAMP(3);
