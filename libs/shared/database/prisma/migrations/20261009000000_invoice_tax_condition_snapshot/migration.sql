-- Condición frente al IVA del emisor y del cliente al momento de emitir,
-- para que el PDF reimpreso no cambie si cambia la condición después.

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "issuerTaxCondition" "TenantTaxCondition",
ADD COLUMN     "customerTaxCondition" TEXT;

-- Facturas existentes: A, B y M sólo las emite un Responsable Inscripto.
-- Las C pueden ser de Monotributo o Exento: quedan null (el PDF usa la
-- condición actual, igual que antes).
UPDATE "invoices" SET "issuerTaxCondition" = 'RESPONSABLE_INSCRIPTO' WHERE "documentLetter" IN ('A', 'B', 'M');
UPDATE "invoices" i SET "customerTaxCondition" = c."taxCondition"
FROM "companies" c WHERE c."id" = i."customerId" AND c."tenantId" = i."tenantId";
