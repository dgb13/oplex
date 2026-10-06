-- Programación de backups configurable desde /admin/backups (ver
-- BackupSchedulerService). Defaults = lo que ya corría: todos los días a las
-- 23 h de Argentina (2 AM UTC), 5 copias en el servidor, 30 días en R2.
ALTER TABLE "platform_settings"
    ADD COLUMN "backupFrequencyHours" INTEGER NOT NULL DEFAULT 24,
    ADD COLUMN "backupHour" INTEGER NOT NULL DEFAULT 23,
    ADD COLUMN "backupKeepLocal" INTEGER NOT NULL DEFAULT 5,
    ADD COLUMN "backupKeepOffsiteDays" INTEGER NOT NULL DEFAULT 30;

-- CreateTable: mediciones del servidor para /admin/server. Global, sin RLS
-- (mismo criterio que "database_backups").
CREATE TABLE "server_metric_samples" (
    "id" TEXT NOT NULL,
    "takenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cpuPercent" DOUBLE PRECISION NOT NULL,
    "memUsedBytes" BIGINT NOT NULL,
    "memTotalBytes" BIGINT NOT NULL,
    "swapUsedBytes" BIGINT NOT NULL,
    "diskUsedBytes" BIGINT NOT NULL,
    "diskTotalBytes" BIGINT NOT NULL,

    CONSTRAINT "server_metric_samples_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "server_metric_samples_takenAt_idx" ON "server_metric_samples"("takenAt");

-- CreateTable: avisos por email a los admins de la plataforma. Global, sin RLS.
CREATE TABLE "ops_alerts" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ops_alerts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ops_alerts_kind_sentAt_idx" ON "ops_alerts"("kind", "sentAt");

GRANT SELECT, INSERT, DELETE ON "server_metric_samples" TO plexo_app;
GRANT SELECT, INSERT, DELETE ON "ops_alerts" TO plexo_app;
