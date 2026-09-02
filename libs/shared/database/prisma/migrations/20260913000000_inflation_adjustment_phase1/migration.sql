-- CreateEnum
CREATE TYPE "PriceIndexSource" AS ENUM ('API_ARGENTINADATOS', 'MANUAL');

-- AlterTable: clasificación monetaria/no monetaria para RT6/NC39 - default
-- true (la mayoría de las cuentas existentes son monetarias), corregido
-- abajo para la única excepción hardcodeada conocida (Mercaderías).
ALTER TABLE "accounting_accounts" ADD COLUMN "isMonetary" BOOLEAN NOT NULL DEFAULT true;

-- Mercaderías (código 1.1.04, INVENTORY_ASSET_ACCOUNT en accounting.service.ts)
-- es un bien de cambio - no monetaria bajo RT6, para cualquier tenant que ya
-- la tenga creada.
UPDATE "accounting_accounts" SET "isMonetary" = false WHERE "code" = '1.1.04';

-- AlterTable: sync diario de "Índices de Inflación" (IPC), mismo criterio
-- que bnaSyncEnabled/bnaSyncHour ya existentes en esta tabla.
ALTER TABLE "platform_settings" ADD COLUMN "ipcSyncEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "platform_settings" ADD COLUMN "ipcSyncHour" INTEGER NOT NULL DEFAULT 10;
UPDATE "platform_settings" SET "ipcSyncEnabled" = true, "ipcSyncHour" = 10 WHERE "id" = 'global';

-- CreateTable: global, SIN tenantId y SIN RLS más abajo - mismo criterio que
-- "platform_settings" (ver esa tabla): el IPC es un único dato nacional,
-- igual para todos los tenants.
CREATE TABLE "price_index_entries" (
    "id" TEXT NOT NULL,
    "period" TIMESTAMP(3) NOT NULL,
    "monthlyVariationPct" DECIMAL(8,4) NOT NULL,
    "indexValue" DECIMAL(18,6) NOT NULL,
    "source" "PriceIndexSource" NOT NULL,
    "updatedByUserId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "price_index_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "price_index_entries_period_key" ON "price_index_entries"("period");

-- "price_index_entries" es global (sin RLS, ver arriba) - se le da a
-- plexo_app lectura + alta/edición (para el sync y la corrección manual),
-- sin DELETE (un período no se borra, se corrige).
GRANT SELECT, INSERT, UPDATE ON "price_index_entries" TO plexo_app;
