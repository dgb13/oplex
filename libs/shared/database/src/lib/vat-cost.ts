import { Prisma, type TaxDefinition, type TenantTaxCondition } from '../generated/client.js';

/**
 * "Costo real" de una compra: lo que la empresa efectivamente pierde.
 *
 * - Responsable Inscripto: el IVA de las compras lo recupera (crédito
 *   fiscal), así que su costo real es SIN IVA.
 * - Monotributo / Exento: el IVA no lo recupera, así que su costo real es
 *   CON IVA (y sus precios de venta son finales - facturan C).
 * - Sin condición cargada: no se puede saber, el costo se guarda tal cual se
 *   escribió (comportamiento de antes).
 *
 * Quien carga un costo (artículo, orden de compra, movimiento de stock,
 * importación) dice si lo escribió con o sin IVA (`includesVat`) y esto lo
 * lleva a la base que corresponde, con la alícuota del artículo. Todo lo que
 * sale del stock (ventas, ganancias, valuación, producción) usa ese costo.
 */
export function isVatRecoverable(condition: TenantTaxCondition | null | undefined): boolean | null {
  if (!condition) return null;
  return condition === 'RESPONSABLE_INSCRIPTO';
}

/** Alícuota de IVA (en %) de una definición de impuesto; 0 si es exento, no
 * gravado o no es un porcentaje. Mismo criterio que resolveLineTax de
 * Facturación para lo que sí soporta. */
export function vatRatePercent(taxDefinition: TaxDefinition | null | undefined): Prisma.Decimal {
  if (!taxDefinition || taxDefinition.calculationType !== 'PERCENTAGE' || !taxDefinition.rate) {
    return new Prisma.Decimal(0);
  }
  return new Prisma.Decimal(taxDefinition.rate);
}

export function realUnitCost(input: {
  amount: Prisma.Decimal | number | string;
  includesVat: boolean;
  vatRate: Prisma.Decimal | number;
  condition: TenantTaxCondition | null | undefined;
}): Prisma.Decimal {
  const amount = new Prisma.Decimal(input.amount);
  const recoverable = isVatRecoverable(input.condition);
  const factor = new Prisma.Decimal(1).add(new Prisma.Decimal(input.vatRate).div(100));
  if (recoverable === null || factor.equals(1)) return amount;
  if (recoverable) return input.includesVat ? amount.div(factor) : amount;
  return input.includesVat ? amount : amount.mul(factor);
}

/** La condición frente al IVA del tenant actual (TenantSettings), o null. */
export async function getOwnTaxCondition(db: Prisma.TransactionClient): Promise<TenantTaxCondition | null> {
  const settings = await db.tenantSettings.findFirst({ select: { ownTaxCondition: true } });
  return settings?.ownTaxCondition ?? null;
}

/**
 * Alícuotas de IVA de Argentina con las que arranca toda empresa (ver
 * TenantProvisioningService y la migración default_vat_definitions para
 * las que ya existían). El tenant las puede revisar en Impuestos; los
 * códigos son los que usan Facturación y la importación de artículos.
 */
export const DEFAULT_VAT_DEFINITIONS: ReadonlyArray<{
  code: string;
  name: string;
  calculationType: 'PERCENTAGE' | 'EXENTO' | 'NO_GRAVADO';
  rate: number | null;
}> = [
  { code: 'IVA21', name: 'IVA 21%', calculationType: 'PERCENTAGE', rate: 21 },
  { code: 'IVA10_5', name: 'IVA 10,5%', calculationType: 'PERCENTAGE', rate: 10.5 },
  { code: 'IVA27', name: 'IVA 27%', calculationType: 'PERCENTAGE', rate: 27 },
  { code: 'IVA5', name: 'IVA 5%', calculationType: 'PERCENTAGE', rate: 5 },
  { code: 'IVA2_5', name: 'IVA 2,5%', calculationType: 'PERCENTAGE', rate: 2.5 },
  { code: 'IVA_EXENTO', name: 'Exento', calculationType: 'EXENTO', rate: null },
  { code: 'IVA_NO_GRAVADO', name: 'No gravado', calculationType: 'NO_GRAVADO', rate: null },
];
