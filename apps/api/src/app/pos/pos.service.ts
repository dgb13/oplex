import { BadRequestException, Injectable } from '@nestjs/common';
import { AccountingService } from '@plexo/accounting';
import { getTenantDb, getTenantId, Prisma } from '@plexo/database';
import { MercadoPagoQrService } from '@plexo/mercadopago';
import { CashRegistersService, CashSessionsService } from '@plexo/pos';
import { ReportsFinancialService } from '@plexo/reports-financial';
import { instanceToPlain } from 'class-transformer';
import type { CheckoutDto, CheckoutSaleDto } from './dto/checkout.dto.js';
import type { CreateRegisterDto } from './dto/create-register.dto.js';
import type { CreateQrChargeDto } from './dto/mercadopago-qr.dto.js';
import { SalesService } from '../sales/sales.service.js';

/**
 * Composes @plexo/pos (CashRegistersService/CashSessionsService) +
 * SalesService (Factura+Stock+Asiento+Cobro, ya compuesto aparte) +
 * ReportsFinancialService + AccountingService para lo que ninguno de ellos
 * resuelve solo: "vender por mostrador también deja el rastro correcto en
 * el arqueo de la caja y en el cajón real (FinancialAccount.currentBalance)".
 * Mismo criterio que apps/api/src/app/sales/sales.service.ts - atomicidad
 * gratis vía getTenantDb() (transacción por request).
 */
@Injectable()
export class PosService {
  constructor(
    private readonly cashRegistersService: CashRegistersService,
    private readonly cashSessionsService: CashSessionsService,
    private readonly salesService: SalesService,
    private readonly accountingService: AccountingService,
    private readonly reportsFinancialService: ReportsFinancialService,
    private readonly mercadoPagoQrService: MercadoPagoQrService,
  ) {}

  async createRegister(dto: CreateRegisterDto) {
    const account = await this.reportsFinancialService.createFinancialAccount({
      name: `Caja - ${dto.name}`,
      provider: 'CASH',
    });
    return this.cashRegistersService.create({ ...dto, financialAccountId: account.id });
  }

  /**
   * Reusa SalesService.createSale/recordReceipt tal cual - cero código
   * nuevo para factura/stock/asiento/cobro. Lo único propio de Caja: exigir
   * un turno abierto, resolver Consumidor Final si no vino un cliente, y
   * dejar el rastro del pago en efectivo tanto en el ledger de la sesión
   * (arqueo) como en FinancialAccount.currentBalance (recordReceipt NO lo
   * hace por sí solo - ver la nota en InvoicingService.recordReceipt).
   */
  async checkout(dto: CheckoutDto) {
    const register = await this.cashRegistersService.getById(dto.registerId);
    const session = await this.cashSessionsService.getOpenSession(dto.registerId);
    if (!session) {
      throw new BadRequestException('Abrí un turno antes de vender en esta caja');
    }

    const customerId = dto.customerId ?? (await this.resolveDefaultCustomer()).id;

    const invoice = await this.salesService.createSale({
      customerId,
      warehouseId: register.warehouseId,
      documentLetter: dto.documentLetter,
      branchId: register.branchId,
      currencyId: dto.currencyId,
      exchangeRate: dto.exchangeRate,
      globalDiscountPercent: dto.globalDiscountPercent,
      pricesIncludeTax: dto.pricesIncludeTax,
      lines: dto.lines,
    });

    const totalPaid = dto.payments.reduce((sum, p) => sum.add(p.amount), new Prisma.Decimal(0));
    if (!totalPaid.eq(invoice.total)) {
      throw new BadRequestException(
        `El total pagado (${totalPaid.toFixed(2)}) no coincide con el total de la venta (${invoice.total.toFixed(2)})`,
      );
    }

    for (const payment of dto.payments) {
      // Cobro con el QR de la caja: la venta recién se confirma con el pago
      // ya acreditado, y ese cobro paga esta venta y ninguna otra. Si algo
      // falla después, el throw revierte también esta marca.
      if (payment.paymentIntentId) {
        if (payment.method !== 'MERCADOPAGO') {
          throw new BadRequestException('Un cobro QR sólo puede pagar una fila de Mercado Pago');
        }
        await this.mercadoPagoQrService.consumeForSale({
          intentId: payment.paymentIntentId,
          registerId: register.id,
          amount: payment.amount,
          invoiceId: invoice.id,
        });
      }

      const isCash = payment.method === 'CASH';
      await this.salesService.recordReceipt({
        invoiceId: invoice.id,
        amount: payment.amount,
        method: payment.method,
        financialAccountId: isCash ? register.financialAccountId : undefined,
        check: payment.check,
      });

      if (isCash) {
        await this.cashSessionsService.recordSaleMovement(session.id, invoice.id, payment.amount);
        await this.reportsFinancialService.recordFinancialTransaction({
          financialAccountId: register.financialAccountId,
          amount: payment.amount,
          externalRef: `Venta ${invoice.documentLetter}-${invoice.number}`,
        });
      }
    }

    return invoice;
  }

  /** Cobro con QR: guarda la venta junto con el cobro (ver
   * CreateQrChargeDto.sale) para poder retomarla con confirmQrSale. */
  async createQrCharge(dto: CreateQrChargeDto) {
    if (dto.sale) {
      const mpRows = dto.sale.payments.filter((p) => p.method === 'MERCADOPAGO');
      if (mpRows.length !== 1 || !new Prisma.Decimal(mpRows[0].amount).eq(new Prisma.Decimal(dto.amount))) {
        throw new BadRequestException('La venta tiene que tener una sola fila de Mercado Pago, por el monto del QR');
      }
    }
    return this.mercadoPagoQrService.createCharge(
      dto.registerId,
      dto.amount,
      dto.sale ? (instanceToPlain(dto.sale) as Prisma.InputJsonValue) : undefined,
    );
  }

  /** "Cobros con QR sin venta" de la caja: el cliente pagó y la venta no se
   * confirmó. Con la venta guardada resuelta a nombres para mostrarla. */
  async listUnclaimedQrCharges(registerId: string) {
    const charges = await this.mercadoPagoQrService.listUnclaimedCharges(registerId);
    if (charges.length === 0) {
      return [];
    }
    const db = getTenantDb();
    const drafts = charges.map((c) => c.saleDraft as unknown as CheckoutSaleDto | null);
    const variantIds = [...new Set(drafts.flatMap((d) => d?.lines.map((l) => l.articleVariantId) ?? []))];
    const customerIds = [...new Set(drafts.map((d) => d?.customerId).filter((id): id is string => !!id))];
    const userIds = [...new Set(charges.map((c) => c.createdByUserId).filter((id): id is string => !!id))];
    const [variants, customers, users] = await Promise.all([
      db.articleVariant.findMany({ where: { id: { in: variantIds } }, select: { id: true, sku: true, article: { select: { name: true } } } }),
      db.company.findMany({ where: { id: { in: customerIds } }, select: { id: true, name: true } }),
      db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } }),
    ]);
    const variantName = new Map(variants.map((v) => [v.id, v.article.name]));
    const customerName = new Map(customers.map((c) => [c.id, c.name]));
    const userName = new Map(users.map((u) => [u.id, u.name?.trim() || u.email]));

    return charges.map((charge, i) => {
      const draft = drafts[i];
      return {
        id: charge.id,
        amount: charge.amount,
        paidAt: charge.paidAt,
        createdAt: charge.createdAt,
        externalPaymentId: charge.externalPaymentId,
        createdByName: charge.createdByUserId ? (userName.get(charge.createdByUserId) ?? null) : null,
        sale: draft
          ? {
              customerName: draft.customerId ? (customerName.get(draft.customerId) ?? 'Cliente') : 'Consumidor Final',
              documentLetter: draft.documentLetter,
              lines: draft.lines.map((l) => ({
                articleName: variantName.get(l.articleVariantId) ?? 'Artículo',
                quantity: l.quantity,
                unitPrice: l.unitPrice ?? null,
              })),
            }
          : null,
      };
    });
  }

  /** Confirma la venta guardada de un cobro QR acreditado que no llegó a
   * venderse: la misma checkout() de siempre, con ese cobro pagando la fila
   * de Mercado Pago. Si falla (stock, ARCA), el cobro sigue pendiente y se
   * puede reintentar - nunca se le vuelve a cobrar al cliente. */
  async confirmQrSale(intentId: string) {
    const charge = await this.mercadoPagoQrService.getUnclaimedCharge(intentId);
    const sale = charge.saleDraft as unknown as CheckoutSaleDto | null;
    if (!sale) {
      throw new BadRequestException(
        'Este cobro no tiene la venta guardada: cargá los artículos en la Caja y, al cobrar con Mercado Pago, elegí usar este cobro',
      );
    }
    return this.checkout({
      ...sale,
      registerId: charge.registerId,
      payments: sale.payments.map((p) => (p.method === 'MERCADOPAGO' ? { ...p, paymentIntentId: charge.id } : p)),
    });
  }

  async closeSession(sessionId: string, dto: Parameters<CashSessionsService['closeSession']>[1]) {
    // Un cobro QR acreditado sin venta es plata que entró sin factura: el
    // arqueo no puede cerrar así (decisión del usuario, 2026-10-01).
    const summary = await this.cashSessionsService.getSessionSummary(sessionId);
    const unclaimed = await this.mercadoPagoQrService.listUnclaimedCharges(summary.session.registerId);
    if (unclaimed.length > 0) {
      throw new BadRequestException(
        unclaimed.length === 1
          ? 'Hay un cobro con QR acreditado sin venta en esta caja: confirmá la venta antes de cerrar el turno'
          : `Hay ${unclaimed.length} cobros con QR acreditados sin venta en esta caja: confirmá las ventas antes de cerrar el turno`,
      );
    }
    const { session } = await this.cashSessionsService.closeSession(sessionId, dto);
    if (session.difference !== null && !session.difference.isZero()) {
      await this.accountingService.postCashSessionAdjustmentJournalEntry({
        cashSessionId: session.id,
        difference: session.difference,
        date: session.closedAt ?? undefined,
      });
    }
    return session;
  }

  /** Company placeholder para venta de mostrador sin cliente elegido -
   * Invoice.customerId es obligatorio, no hay "sin cliente". Buscada por
   * name+taxId null (no hay otro campo que la identifique de forma única)
   * y creada perezosamente la primera vez que un tenant usa Caja, mismo
   * patrón que AccountingService.getOrCreateAccount para el plan de
   * cuentas. documentLetter.ts en el frontend ya fuerza Factura B para un
   * cliente sin CUIT, cero lógica nueva de ese lado. */
  private async resolveDefaultCustomer() {
    const db = getTenantDb();
    const existing = await db.company.findFirst({ where: { name: 'Consumidor Final', taxId: null } });
    if (existing) {
      return existing;
    }
    const tenantId = getTenantId();
    return db.company.create({
      data: {
        tenantId,
        name: 'Consumidor Final',
        roles: { create: { tenantId, role: 'CUSTOMER' } },
      },
    });
  }
}
