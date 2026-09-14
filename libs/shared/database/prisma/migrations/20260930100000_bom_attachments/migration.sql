-- Documentación (PDF/ZIP) adjunta a una versión puntual de receta - ver
-- BomAttachment en el schema. bomId referencia la fila puntual de
-- bill_of_materials (la versión), no el producto en general - decisión
-- explícita: guardar una receta como versión nueva no arrastra los
-- adjuntos de la versión anterior.

-- CreateEnum
CREATE TYPE "BomAttachmentType" AS ENUM ('PDF', 'ZIP');

-- CreateTable
CREATE TABLE "bom_attachments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "bomId" TEXT NOT NULL,
    "fileType" "BomAttachmentType" NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "uploadedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bom_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bom_attachments_tenantId_bomId_idx" ON "bom_attachments"("tenantId", "bomId");

-- AddForeignKey
ALTER TABLE "bom_attachments" ADD CONSTRAINT "bom_attachments_bomId_fkey" FOREIGN KEY ("bomId") REFERENCES "bill_of_materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom_attachments" ADD CONSTRAINT "bom_attachments_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS + GRANT, mismo criterio que cualquier otra tabla tenant-scoped (ver
-- 20260930060000_stock_reservations para el mismo bloque).
ALTER TABLE "bom_attachments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bom_attachments" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "bom_attachments"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "bom_attachments" TO plexo_app;
