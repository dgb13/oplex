import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AccountingService } from '@plexo/accounting';
import { getOrCreateSystemFinancialAccount, getTenantDb, getTenantId, getUserId, Prisma } from '@plexo/database';
import {
  PurchaseInvoiceService,
  type CreatePurchaseInvoiceDto,
  type ListPurchaseInvoicesQueryDto,
  type RecordSupplierPaymentDto,
} from '@plexo/purchases';
import { ReportsFinancialService } from '@plexo/reports-financial';
import { CheckService } from '@plexo/treasury';

/**
 * Composes PurchaseInvoiceService (libs/modules/purchases - creates the
 * Factura de Compra itself and computes the GRNI split) with
 * AccountingService (posts the actual journal entry - clears the GRNI
 * bridge, books IVA Crédito/Percepciones, credits Proveedores; and, for
 * payments, debits Proveedores/credits Caja) - same shape as
 * GoodsReceiptsService/SupplierReturnsService. PurchaseInvoiceService
 * can't call AccountingService itself (this repo's rule: a lib module
 * never imports another module's Service), so this is the composition
 * root.
 *
 * Atomicity for free, same reason as the other composition roots:
 * everything runs through getTenantDb(), the same per-request transaction
 * - if the accounting call throws, the whole transaction rolls back,
 * including the PurchaseInvoice/SupplierPayment just created above.
 */
@Injectable()
export class PurchaseInvoicesService {
  constructor(
    private readonly purchaseInvoiceService: PurchaseInvoiceService,
    private readonly accountingService: AccountingService,
    private readonly reportsFinancialService: ReportsFinancialService,
    private readonly checkService: CheckService,
  ) {}

  list(query?: ListPurchaseInvoicesQueryDto) {
    return this.purchaseInvoiceService.list(query);
  }

  get(id: string) {
    return this.purchaseInvoiceService.get(id);
  }

  /** Returns the invoice itself (not the {invoice, grniClearedAmount,
   * nonGrniAmount} wrapper PurchaseInvoiceService.create() returns) -
   * @AuditEntity('purchaseInvoice', {idParam: null}) on the controller
   * reads its `.id`/label off whatever this method returns, same lesson
   * already learned the hard way for QuoteRequestService.convert(). */
  async createInvoice(dto: CreatePurchaseInvoiceDto) {
    const { invoice, grniClearedAmount, nonGrniAmount } = await this.purchaseInvoiceService.create(dto);

    const ivaCredito = invoice.taxLines
      .filter((line) => line.type === 'IVA_CREDITO')
      .reduce((sum, line) => sum.add(line.amount), new Prisma.Decimal(0));
    const percepciones = invoice.taxLines
      .filter((line) => line.type === 'PERCEPCION')
      .map((line) => ({ concept: line.concept, amount: line.amount }));

    await this.accountingService.postPurchaseInvoiceJournalEntry({
      purchaseInvoiceId: invoice.id,
      grniClearedAmount,
      nonGrniAmount,
      ivaCredito,
      percepciones,
      total: invoice.total,
      // The supplier's own invoice date, not "now" - a paper invoice dated
      // last month entered today must land in last month's P&L, same
      // criterion SalesService already applies via invoice.issueDate.
      date: invoice.supplierInvoiceDate,
    });

    return invoice;
  }

  async recordPayment(invoiceId: string, dto: RecordSupplierPaymentDto) {
    if (dto.endorseCheckId && dto.ownCheck) {
      throw new BadRequestException('No se puede endosar un cheque de cartera y emitir uno propio en el mismo pago');
    }

    // Antes de mover cualquier saldo (ver AccountingService.ensureMoneyAccounts).
    await this.accountingService.ensureMoneyAccounts();

    // De dónde sale la plata: un cheque de cartera endosado, un cheque propio
    // diferido (sale del banco recién al cobrarse), o la cuenta elegida - sin
    // cuenta elegida, "Cobranzas a depositar" (mismo criterio que los cobros).
    const paysWithCheck = Boolean(dto.endorseCheckId || dto.ownCheck);
    const financialAccountId = paysWithCheck
      ? undefined
      : (dto.financialAccountId ??
        (await getOrCreateSystemFinancialAccount(getTenantDb(), getTenantId(), 'PENDING_DEPOSIT')).id);

    const payment = await this.purchaseInvoiceService.recordPayment(invoiceId, { ...dto, financialAccountId });
    await this.accountingService.postSupplierPaymentJournalEntry({
      supplierPaymentId: payment.id,
      amount: payment.amount,
      withholdings: payment.withholdings.map((w) => ({ taxType: w.taxType, amount: w.amount })),
      money: dto.ownCheck
        ? { kind: 'OWN_CHECKS_PAYABLE' }
        : dto.endorseCheckId || !financialAccountId
          ? { kind: 'CHECKS_IN_PORTFOLIO' }
          : { financialAccountId },
      // The date the payment was actually made, not "now" - same reasoning
      // as createInvoice's supplierInvoiceDate above.
      date: payment.paidAt,
    });

    // El pago también mueve el saldo de la cuenta de dinero, igual que el
    // asiento de arriba. Endosar un cheque de cartera o emitir uno propio
    // diferido son las únicas excepciones (ver el comentario debajo).
    if (financialAccountId) {
      const account = await getTenantDb().financialAccount.findUnique({
        where: { id: financialAccountId },
      });
      if (!account) {
        throw new NotFoundException('Financial account not found');
      }
      const purchaseInvoice = await getTenantDb().purchaseInvoice.findUnique({
        where: { id: invoiceId },
        include: { currency: true },
      });
      if (account.currencyId && purchaseInvoice && account.currencyId !== purchaseInvoice.currencyId) {
        throw new BadRequestException(
          `Esta cuenta está en otra moneda que la factura de compra (factura en ${purchaseInvoice.currency.code})`,
        );
      }
      await this.reportsFinancialService.recordFinancialTransaction({
        financialAccountId,
        amount: -payment.amount.toNumber(),
        externalRef: `Pago factura de compra ${invoiceId}`,
      });
    }

    // Un pago puede cancelarse endosando un cheque de cartera o emitiendo
    // uno propio diferido, en vez de efectivo/transferencia - a lo sumo
    // uno de los dos (validado arriba). Ninguno de los dos mueve
    // FinancialAccount.currentBalance acá: endosar nunca tocó una cuenta
    // propia (el cheque cambia de manos, no pasó por nuestro banco); un
    // propio recién emitido es diferido, sale de la cuenta al acreditarse
    // (ver apps/api/src/app/treasury/).
    if (dto.endorseCheckId || dto.ownCheck) {
      const invoice = await getTenantDb().purchaseInvoice.findUnique({
        where: { id: invoiceId },
        select: { supplierId: true },
      });
      const userId = getUserId();
      if (!userId) {
        throw new BadRequestException('An authenticated user is required to record a check');
      }
      if (dto.endorseCheckId) {
        await this.checkService.endorseCheck(dto.endorseCheckId, payment.id, invoice?.supplierId ?? null);
      } else if (dto.ownCheck) {
        await this.checkService.issueOwnCheck({
          supplierPaymentId: payment.id,
          supplierId: invoice?.supplierId ?? null,
          amount: payment.amount.toNumber(),
          number: dto.ownCheck.number,
          bankName: dto.ownCheck.bankName,
          format: dto.ownCheck.format,
          issueDate: new Date(dto.ownCheck.issueDate),
          dueDate: new Date(dto.ownCheck.dueDate),
          financialAccountId: dto.ownCheck.financialAccountId,
          createdByUserId: userId,
        });
      }
    }

    return payment;
  }
}
