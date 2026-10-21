import { BadRequestException, Injectable } from '@nestjs/common';
import { getMercadoPagoReceiptAccount, getTenantDb, getTenantId } from '@plexo/database';

export interface MercadoPagoSettingsView {
  linksEnabled: boolean;
  /** La cuenta donde se registran hoy los cobros por Mercado Pago. */
  financialAccountId: string;
  /** Cuentas de dinero de Mercado Pago en pesos que se pueden elegir. */
  financialAccounts: { id: string; name: string }[];
}

export interface UpdateMercadoPagoSettingsInput {
  linksEnabled?: boolean;
  financialAccountId?: string;
}

/** Lanza si la empresa apagó los links de pago (Mercado Pago ›
 * Configuración). Lo usan createPaymentLink y la acción del asistente. */
export async function assertPaymentLinksEnabled(): Promise<void> {
  const settings = await getTenantDb().tenantSettings.findUnique({
    where: { tenantId: getTenantId() },
    select: { mercadoPagoLinksEnabled: true },
  });
  if (settings && !settings.mercadoPagoLinksEnabled) {
    throw new BadRequestException(
      'Los links de pago de Mercado Pago están apagados. Se prenden en Mercado Pago › Configuración.',
    );
  }
}

/** Mercado Pago › Configuración, parte 2 (etapa 4 de plan-seccion-mercadopago.md). */
@Injectable()
export class MercadoPagoSettingsService {
  async get(): Promise<MercadoPagoSettingsView> {
    const db = getTenantDb();
    const [settings, financialAccountId] = await Promise.all([
      db.tenantSettings.findUnique({ where: { tenantId: getTenantId() }, select: { mercadoPagoLinksEnabled: true } }),
      getMercadoPagoReceiptAccount(db, getTenantId()).then((a) => a.id),
    ]);
    // Sólo cuentas de Mercado Pago en pesos: la plata de un cobro por MP
    // entra a una cuenta de MP; si hay más de una (por ejemplo, una por
    // sucursal), acá se elige cuál.
    const financialAccounts = await db.financialAccount.findMany({
      where: { provider: 'MERCADOPAGO', currencyId: null },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    return { linksEnabled: settings?.mercadoPagoLinksEnabled ?? true, financialAccountId, financialAccounts };
  }

  async update(input: UpdateMercadoPagoSettingsInput): Promise<MercadoPagoSettingsView> {
    const db = getTenantDb();
    if (input.financialAccountId) {
      const account = await db.financialAccount.findUnique({
        where: { id: input.financialAccountId },
        select: { provider: true, currencyId: true },
      });
      if (!account || account.provider !== 'MERCADOPAGO' || account.currencyId !== null) {
        throw new BadRequestException('Elegí una cuenta de dinero de Mercado Pago en pesos');
      }
    }
    await db.tenantSettings.updateMany({
      where: { tenantId: getTenantId() },
      data: {
        ...(input.linksEnabled !== undefined ? { mercadoPagoLinksEnabled: input.linksEnabled } : {}),
        ...(input.financialAccountId ? { mercadoPagoFinancialAccountId: input.financialAccountId } : {}),
      },
    });
    return this.get();
  }
}
