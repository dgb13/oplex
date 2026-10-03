import type { FinancialAccount, Prisma } from '../generated/client.js';

/** Las cuentas de dinero que Oplex crea solo, una por tenant. */
export type SystemFinancialAccountKind = 'PENDING_DEPOSIT' | 'MERCADOPAGO';

const SYSTEM_ACCOUNT_NAME: Record<SystemFinancialAccountKind, string> = {
  PENDING_DEPOSIT: 'Cobranzas a depositar',
  MERCADOPAGO: 'Mercado Pago',
};

/**
 * La cuenta de dinero de sistema del tenant, creándola si todavía no existe:
 * - PENDING_DEPOSIT, "Cobranzas a depositar": cuenta puente para los cobros
 *   que no dicen en qué cuenta entró la plata (tarjeta, transferencia sin
 *   banco, Facturación sin cuenta). Se vacía con una transferencia entre
 *   cuentas cuando la plata llega al banco.
 * - MERCADOPAGO: donde entran los cobros por QR y por link de pago. Si el
 *   tenant ya tenía una cuenta de Mercado Pago cargada a mano, se usa esa.
 *
 * Una función y no un Service (mismo criterio que resolveCurrentTaxDefinition):
 * la necesitan Ventas/Compras (para elegir la cuenta) y Contabilidad (para
 * reclasificar), que no se inyectan entre sí.
 */
export async function getOrCreateSystemFinancialAccount(
  db: Prisma.TransactionClient,
  tenantId: string,
  kind: SystemFinancialAccountKind,
): Promise<FinancialAccount> {
  const existing = await db.financialAccount.findFirst({
    where: { provider: kind, currencyId: null },
    orderBy: { name: 'asc' },
  });
  if (existing) {
    return existing;
  }
  // El nombre es único por tenant: si alguien ya usó "Mercado Pago" para
  // otra cosa, no se pisa - se usa un nombre que no choque.
  const baseName = SYSTEM_ACCOUNT_NAME[kind];
  const taken = await db.financialAccount.findFirst({ where: { name: baseName }, select: { id: true } });
  return db.financialAccount.create({
    data: {
      tenantId,
      name: taken ? `${baseName} (Oplex)` : baseName,
      provider: kind,
    },
  });
}
