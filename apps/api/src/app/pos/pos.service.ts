import { BadRequestException, Injectable } from '@nestjs/common';
import { AccountingService } from '@plexo/accounting';
import { getTenantDb, getTenantId, Prisma } from '@plexo/database';
import { CashRegistersService, CashSessionsService } from '@plexo/pos';
import { ReportsFinancialService } from '@plexo/reports-financial';
import type { CheckoutDto } from './dto/checkout.dto.js';
import type { CreateRegisterDto } from './dto/create-register.dto.js';
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

  async closeSession(sessionId: string, dto: Parameters<CashSessionsService['closeSession']>[1]) {
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
