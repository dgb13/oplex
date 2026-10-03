import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AccountingService } from '@plexo/accounting';
import { getTenantDb, Prisma } from '@plexo/database';
import { InvoicingService } from '@plexo/invoicing';
import { ReportsFinancialService } from '@plexo/reports-financial';
import { CheckService } from '@plexo/treasury';

/**
 * Composición-root para las acciones de Cartera de Cheques que necesitan
 * más de un lib module a la vez (CheckService no puede importar
 * @plexo/reports-financial/@plexo/invoicing/@plexo/accounting - regla del
 * repo). Mismo criterio que SalesService/PurchaseInvoicesService: la
 * atomicidad viene gratis porque todo corre por getTenantDb(), la misma
 * transacción por-request que TenantContextInterceptor ya abrió.
 */
@Injectable()
export class TreasuryService {
  constructor(
    private readonly checkService: CheckService,
    private readonly reportsFinancialService: ReportsFinancialService,
    private readonly invoicingService: InvoicingService,
    private readonly accountingService: AccountingService,
  ) {}

  listChecks(filters: Parameters<CheckService['listChecks']>[0]) {
    return this.checkService.listChecks(filters);
  }

  getCheck(id: string) {
    return this.checkService.getCheck(id);
  }

  /** PORTFOLIO -> DEPOSITED, y recién acá se acredita de verdad en la
   * cuenta bancaria elegida (antes de esto el cheque físicamente en
   * cartera nunca tocó ninguna FinancialAccount). */
  async depositCheck(checkId: string, financialAccountId: string) {
    await this.accountingService.ensureMoneyAccounts();
    const check = await this.checkService.depositCheck(checkId, financialAccountId);
    await this.reportsFinancialService.recordFinancialTransaction({
      financialAccountId,
      amount: check.amount.toNumber(),
      externalRef: `Depósito cheque ${check.number} (${check.bankName})`,
    });
    // Sale de Cheques en Cartera y entra al banco.
    await this.accountingService.postCheckDepositJournalEntry({
      checkId: check.id,
      financialAccountId,
      amount: check.amount,
    });
    return check;
  }

  /** DEPOSITED -> CLEARED (tercero, sólo confirma - el depósito ya había
   * acreditado la plata) o ISSUED -> CLEARED (propio, recién acá sale la
   * plata de verdad de la cuenta que lo respalda). */
  async markCleared(checkId: string) {
    await this.accountingService.ensureMoneyAccounts();
    const check = await this.checkService.markCleared(checkId);
    if (check.kind === 'OWN' && check.financialAccountId) {
      await this.reportsFinancialService.recordFinancialTransaction({
        financialAccountId: check.financialAccountId,
        amount: -check.amount.toNumber(),
        externalRef: `Pago cheque propio ${check.number} (${check.bankName})`,
      });
      // Se cancela "Cheques Diferidos a Pagar" y sale del banco.
      await this.accountingService.postOwnCheckClearedJournalEntry({
        checkId: check.id,
        financialAccountId: check.financialAccountId,
        amount: check.amount,
      });
    }
    return check;
  }

  /**
   * Transferencia entre dos cuentas de dinero propias (ej. "Cobranzas a
   * depositar" -> Banco cuando se acredita una tarjeta). Mueve los dos saldos
   * (ReportsFinancialService) y desde la cuenta contable por cuenta de dinero
   * también se asienta (antes las dos eran la misma "Caja", no hacía falta).
   * Las dos cuentas tienen que estar en la misma moneda: pasar de pesos a
   * dólares es una compra de divisas, no una transferencia.
   */
  async transferBetweenAccounts(dto: Parameters<ReportsFinancialService['transferBetweenAccounts']>[0]) {
    const db = getTenantDb();
    const [fromAccount, toAccount] = await Promise.all([
      db.financialAccount.findUnique({ where: { id: dto.fromFinancialAccountId } }),
      db.financialAccount.findUnique({ where: { id: dto.toFinancialAccountId } }),
    ]);
    if (fromAccount && toAccount && fromAccount.currencyId !== toAccount.currencyId) {
      throw new BadRequestException(
        'Las dos cuentas tienen que estar en la misma moneda: pasar de una moneda a otra es una compra o venta de divisas',
      );
    }
    // En pesos para el asiento: una cuenta en otra moneda se valúa a la
    // última cotización cargada de esa moneda.
    let rate = new Prisma.Decimal(1);
    if (fromAccount?.currencyId) {
      const latest = await db.exchangeRateHistory.findFirst({
        where: { currencyId: fromAccount.currencyId },
        orderBy: { effectiveAt: 'desc' },
      });
      if (!latest) {
        throw new BadRequestException('Cargá una cotización para la moneda de estas cuentas antes de transferir');
      }
      rate = latest.rate;
    }

    await this.accountingService.ensureMoneyAccounts();
    const result = await this.reportsFinancialService.transferBetweenAccounts(dto);
    await this.accountingService.postTransferJournalEntry({
      fromFinancialAccountId: dto.fromFinancialAccountId,
      toFinancialAccountId: dto.toFinancialAccountId,
      amount: new Prisma.Decimal(dto.amount).mul(rate).toDecimalPlaces(2),
      description: `Transferencia de ${fromAccount?.name ?? 'cuenta'} a ${toAccount?.name ?? 'cuenta'}${dto.note ? ` - ${dto.note}` : ''}`,
      date: dto.occurredAt ? new Date(dto.occurredAt) : undefined,
    });
    return result;
  }

  /** PORTFOLIO|DEPOSITED|ENDORSED -> REJECTED. Reabre la deuda del
   * cliente (reversando exactamente el cobro original, sin importar si
   * después se depositó/endosó) y, si estaba depositado, revierte el
   * crédito que ese depósito le había dado a la cuenta bancaria. No
   * reabre automáticamente la cuenta por pagar del proveedor si el
   * cheque ya estaba endosado - ver el límite de alcance documentado en
   * el plan de esta feature. */
  async rejectCheck(checkId: string, data: { reason: string; feeAmount?: number }) {
    await this.accountingService.ensureMoneyAccounts();
    const { check, wasDeposited, previousStatus } = await this.checkService.rejectCheck(checkId, data);

    if (wasDeposited && check.financialAccountId) {
      await this.reportsFinancialService.recordFinancialTransaction({
        financialAccountId: check.financialAccountId,
        amount: -check.amount.toNumber(),
        externalRef: `Rechazo cheque ${check.number} (${check.bankName})`,
      });
    }

    if (!check.receiptId) {
      // No debería pasar (rejectCheck sólo acepta THIRD_PARTY, que siempre
      // nace de un Recibo) - defensa en profundidad, no un camino real.
      throw new NotFoundException('Rejected check has no originating receipt');
    }
    const receipt = await getTenantDb().receipt.findUnique({
      where: { id: check.receiptId },
      select: { invoiceId: true },
    });
    if (!receipt) {
      throw new NotFoundException('Originating receipt not found');
    }

    await this.invoicingService.reopenInvoiceBalance(
      receipt.invoiceId,
      check.amount,
      check.rejectionFeeAmount ?? 0,
    );
    await this.accountingService.postCheckRejectionJournalEntry({
      checkId: check.id,
      amount: check.amount,
      feeAmount: check.rejectionFeeAmount ?? 0,
      // Sale de donde estaba: el banco donde se depositó, la cartera, o
      // vuelve a ser deuda con el proveedor al que se endosó.
      money:
        previousStatus === 'DEPOSITED' && check.financialAccountId
          ? { financialAccountId: check.financialAccountId }
          : previousStatus === 'ENDORSED'
            ? { kind: 'ACCOUNTS_PAYABLE' }
            : { kind: 'CHECKS_IN_PORTFOLIO' },
      date: check.rejectedAt ?? new Date(),
    });

    return check;
  }

  /** Botón "Actualizar cotización" en FinancialTab.tsx sobre una cuenta en
   * moneda no-base - la cuenta sigue con su currentBalance de siempre, sin
   * tocar, esto sólo registra a qué tipo de cambio se la está valuando hoy
   * y postea la diferencia contra la revaluación anterior (ver
   * AccountingService.postExchangeRateRevaluation). rate opcional: si no
   * viene, usa el último ExchangeRateHistory cargado para esa moneda. */
  async revalueFinancialAccount(financialAccountId: string, rate?: number) {
    await this.accountingService.ensureMoneyAccounts();
    const db = getTenantDb();
    const account = await db.financialAccount.findUnique({ where: { id: financialAccountId } });
    if (!account) {
      throw new NotFoundException('Financial account not found');
    }
    if (!account.currencyId) {
      throw new NotFoundException('Esta cuenta está en la moneda base del tenant, no se revalúa');
    }

    let newRate = rate;
    if (newRate === undefined) {
      const latest = await db.exchangeRateHistory.findFirst({
        where: { currencyId: account.currencyId },
        orderBy: { effectiveAt: 'desc' },
      });
      if (!latest) {
        throw new NotFoundException('No hay ninguna cotización cargada para la moneda de esta cuenta');
      }
      newRate = latest.rate.toNumber();
    }

    const entry = await this.accountingService.postExchangeRateRevaluation({
      financialAccountId,
      currentBalance: account.currentBalance,
      previousRate: account.lastRevaluationRate,
      newRate,
    });

    const updated = await db.financialAccount.update({
      where: { id: financialAccountId },
      data: { lastRevaluationRate: newRate },
    });

    return { account: updated, journalEntry: entry };
  }
}
