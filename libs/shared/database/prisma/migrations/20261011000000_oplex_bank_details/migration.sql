-- Datos bancarios de Oplex para que los tenants transfieran el pago del plan.

-- AlterTable
ALTER TABLE "platform_settings" ADD COLUMN     "oplexBankHolder" TEXT,
ADD COLUMN     "oplexBankCuit" TEXT,
ADD COLUMN     "oplexBankName" TEXT,
ADD COLUMN     "oplexBankCbu" TEXT,
ADD COLUMN     "oplexBankAlias" TEXT;
