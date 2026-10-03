import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  getTenantDb,
  getTenantId,
  getOrCreateSystemFinancialAccount,
  getUserId,
  isDebitNormal,
  Prisma,
  type AccountingAccount,
  type AccountType,
  type JournalEntry,
  type JournalEntryLine,
  type WithholdingTaxType,
} from '@plexo/database';
import type { CreateAccountDto } from './dto/create-account.dto.js';
import type { CreateReversingEntryDto } from './dto/create-reversing-entry.dto.js';
import type { PostJournalEntryDto } from './dto/post-journal-entry.dto.js';

type JournalEntryWithLines = JournalEntry & { lines: JournalEntryLine[] };

/**
 * El lado "dinero" de un asiento de cobro/pago: una cuenta de Tesorería (su
 * cuenta contable propia, ver moneyAccountFor), o una cuenta que no es de
 * Tesorería - cheques en cartera, cheques propios a pagar, o Proveedores
 * (un cheque endosado que rebota vuelve a ser deuda con el proveedor).
 */
export type MoneySide =
  | { financialAccountId: string }
  | { kind: 'CHECKS_IN_PORTFOLIO' | 'OWN_CHECKS_PAYABLE' | 'ACCOUNTS_PAYABLE' };

/** System accounts auto-posting resolves by code, creating them on first
 * use if a tenant hasn't set up its chart of accounts yet. Codes/names are
 * just sensible AR-flavored defaults - nothing stops an accountant from
 * renaming the account afterwards, the code is what auto-posting keys on. */
const SALES_REVENUE_ACCOUNT = { code: '4.1.01', name: 'Ventas', type: 'INCOME' as const };
const ACCOUNTS_RECEIVABLE_ACCOUNT = {
  code: '1.1.02',
  name: 'Deudores por Ventas',
  type: 'ASSET' as const,
};
const VAT_PAYABLE_ACCOUNT = {
  code: '2.1.03',
  name: 'IVA Débito Fiscal',
  type: 'LIABILITY' as const,
};
const COGS_EXPENSE_ACCOUNT = {
  code: '5.1.01',
  name: 'Costo de Mercadería Vendida',
  type: 'EXPENSE' as const,
};
const INVENTORY_ASSET_ACCOUNT = {
  code: '1.1.04',
  name: 'Mercaderías',
  type: 'ASSET' as const,
};

/** Compras / Cuentas a Pagar - GRNI (Goods Received Not Invoiced) bridge +
 * the accounts a Factura de Compra clears it into. See
 * postGoodsReceiptAccrual/reverseSupplierReturnAccrual/
 * postPurchaseInvoiceJournalEntry/postSupplierPaymentJournalEntry below. */
const GRNI_ACCOUNT = {
  code: '2.1.04',
  name: 'Mercadería Recibida No Facturada',
  type: 'LIABILITY' as const,
};
const ACCOUNTS_PAYABLE_ACCOUNT = { code: '2.1.05', name: 'Proveedores', type: 'LIABILITY' as const };
const VAT_CREDIT_ACCOUNT = {
  code: '1.1.05',
  name: 'IVA Crédito Fiscal',
  type: 'ASSET' as const,
};
const PERCEPTIONS_ACCOUNT = {
  code: '1.1.06',
  name: 'Percepciones Sufridas',
  type: 'ASSET' as const,
};
// Whatever a Factura de Compra covers that ISN'T backed by a GRNI accrual -
// a service line (Article.isService never gets a remito) or a price
// variance between the receipt's PO-cost accrual and what the supplier
// actually billed. One aggregate account for both cases, same criterion as
// COGS_EXPENSE_ACCOUNT being one account regardless of which product sold.
const PURCHASES_NO_RECEIPT_ACCOUNT = {
  code: '5.1.02',
  name: 'Compras sin remito',
  type: 'EXPENSE' as const,
};
// La cuenta única de dinero de antes de ensureMoneyAccounts: hoy sólo se
// usa para reclasificar su saldo a la cuenta contable de cada cuenta de
// dinero (1.1.03.NN, ver moneyAccountFor), nunca para asientos nuevos.
const CASH_ACCOUNT = { code: '1.1.03', name: 'Caja', type: 'ASSET' as const };
const MONEY_ACCOUNT_CODE_PREFIX = `${CASH_ACCOUNT.code}.`;

// Cheques de terceros recibidos y todavía no depositados ni endosados (ver
// TreasuryService.depositCheck). No es una cuenta de Tesorería: un cheque
// en cartera no está en ningún banco.
const CHECKS_IN_PORTFOLIO_ACCOUNT = { code: '1.1.07', name: 'Cheques en Cartera', type: 'ASSET' as const };

// Cheques propios emitidos que todavía no se debitaron del banco (ver
// postOwnCheckClearedJournalEntry) - la plata sigue en el banco hasta que
// el cheque se cobra.
const OWN_CHECKS_PAYABLE_ACCOUNT = {
  code: '2.1.10',
  name: 'Cheques Diferidos a Pagar',
  type: 'LIABILITY' as const,
};

// Contrapartida de la reclasificación (ensureMoneyAccounts) cuando las
// cuentas de dinero tienen más saldo que lo que la contabilidad había
// registrado en "Caja": saldos iniciales y movimientos manuales que nunca
// se asentaron.
const MONEY_OPENING_BALANCES_ACCOUNT = {
  code: '3.1.02',
  name: 'Saldos Iniciales de Cuentas de Dinero',
  type: 'EQUITY' as const,
};

// Gasto de rechazo que se le recobra al cliente (ver
// postCheckRejectionJournalEntry) - un ingreso genuino, no una reversa de
// Ventas (el rechazo de un cheque no anula la venta original, sólo el
// cobro), así que va a su propia cuenta de Otros Ingresos, no a
// SALES_REVENUE_ACCOUNT.
const CHECK_REJECTION_FEE_ACCOUNT = {
  code: '4.2.01',
  name: 'Gastos de Cheques Rechazados Recuperados',
  type: 'INCOME' as const,
};

// Conciliación bancaria (ver postBankStatementAdjustmentJournalEntry) - un
// movimiento real del banco que nadie había registrado todavía (comisión
// cobrada, interés acreditado), no una reversa de nada.
const BANK_FEES_EXPENSE_ACCOUNT = { code: '5.1.03', name: 'Gastos Bancarios', type: 'EXPENSE' as const };
const BANK_INTEREST_INCOME_ACCOUNT = {
  code: '4.2.02',
  name: 'Intereses Ganados',
  type: 'INCOME' as const,
};

// Ajuste por Inflación (RT6/NC39, ver postInflationAdjustmentJournalEntry) -
// asiento neto de 2 líneas: Resultado (Pérdida o Ganancia, según el signo
// del RECPAM) contra una cuenta de Patrimonio dedicada. No hay ninguna
// cuenta EQUITY en este chart of accounts todavía - ésta es la primera.
// Decisión explícita del usuario: el asiento no reproduce el desglose por
// cuenta monetaria de la vista previa (eso queda sólo en pantalla), es un
// neto único - mismo criterio que el resto de los asientos de este sistema.
const INFLATION_LOSS_ACCOUNT = {
  code: '5.1.04',
  name: 'Pérdida por Exposición a la Inflación',
  type: 'EXPENSE' as const,
};
const INFLATION_GAIN_ACCOUNT = {
  code: '4.2.03',
  name: 'Ganancia por Exposición a la Inflación',
  type: 'INCOME' as const,
};
// isMonetary: false explícito - es EQUITY, uno de los 3 tipos donde el flag
// tiene efecto real en InflationAdjustmentService.getPreview (MONETARY_TYPES
// incluye EQUITY). Si quedara en el default true, el saldo que este mismo
// asiento le deja quedaría atrapado en el cálculo del RECPAM del período
// siguiente - un capital ajustado por inflación es por definición no
// monetario, nunca debe formar parte de la posición monetaria neta.
// Arqueo de Caja/POS (ver postCashSessionAdjustmentJournalEntry) - la
// diferencia entre lo contado y lo esperado al cerrar un turno. Faltante =
// gasto (el cajón físico tenía menos de lo que el ledger de movimientos
// dice que debería); Sobrante = ingreso (tenía más).
const CASH_SHORTAGE_ACCOUNT = { code: '5.1.05', name: 'Faltante de Caja', type: 'EXPENSE' as const };
const CASH_OVERAGE_ACCOUNT = { code: '4.2.04', name: 'Sobrante de Caja', type: 'INCOME' as const };

// Revaluación de una FinancialAccount en moneda extranjera (ver
// postExchangeRateRevaluation) - mismo molde que
// CASH_SHORTAGE/OVERAGE_ACCOUNT: dos cuentas de resultado, una para cada
// signo, nunca la misma cuenta con signo negativo.
const EXCHANGE_LOSS_ACCOUNT = {
  code: '5.1.06',
  name: 'Pérdida por Diferencia de Cambio',
  type: 'EXPENSE' as const,
};
const EXCHANGE_GAIN_ACCOUNT = {
  code: '4.2.05',
  name: 'Ganancia por Diferencia de Cambio',
  type: 'INCOME' as const,
};

// Traspaso interno de Mercaderías al completar una ProductionOrder (ver
// postProductionJournalEntry, Fase 5 del módulo de Producción) - Debe
// outputsCost / Haber inputsCost, misma cuenta única de Inventario (sin
// Materias Primas/Productos Terminados separadas, decisión ya confirmada
// con el usuario). Si inputsCost != outputsCost (merma/redondeo), mismo
// molde que CASH_SHORTAGE/OVERAGE_ACCOUNT y EXCHANGE_LOSS/GAIN_ACCOUNT: dos
// cuentas de resultado, una por signo. En la práctica
// ProductionService.completeOrder (apps/api) hace que el output principal
// absorba el remanente exacto del costo de insumos, así que esta rama es
// puramente defensiva hoy - documentado en el plan técnico como "detalle
// menor" pendiente de resolver con el usuario si algún día deja de cerrar
// exacto.
const PRODUCTION_VARIANCE_LOSS_ACCOUNT = {
  code: '5.1.07',
  name: 'Pérdida por Diferencia de Producción',
  type: 'EXPENSE' as const,
};
const PRODUCTION_VARIANCE_GAIN_ACCOUNT = {
  code: '4.2.06',
  name: 'Ganancia por Diferencia de Producción',
  type: 'INCOME' as const,
};

const INFLATION_CAPITAL_ADJUSTMENT_ACCOUNT = {
  code: '3.1.01',
  name: 'Ajuste de Capital por Inflación',
  type: 'EQUITY' as const,
  isMonetary: false,
};

// Retenciones que EL TENANT practica a sus proveedores al pagarles
// (Ganancias/IVA/IIBB) - ver postSupplierPaymentJournalEntry. Pasivo: lo
// retenido no es nuestro, hay que depositarlo en AFIP/ARBA/etc. (ese
// depósito queda para más adelante, vía un asiento manual - ver
// PROGRESS.md). Una cuenta agregada por tipo de impuesto, sin desagregar
// por jurisdicción en el caso de IIBB - mismo criterio que
// PERCEPTIONS_ACCOUNT arriba (el detalle por jurisdicción vive en
// SupplierPaymentWithholding, no multiplica cuentas contables).
const WITHHOLDING_INCOME_TAX_ACCOUNT = {
  code: '2.1.06',
  name: 'Retenciones de Ganancias a depositar',
  type: 'LIABILITY' as const,
};
const WITHHOLDING_VAT_ACCOUNT = {
  code: '2.1.07',
  name: 'Retenciones de IVA a depositar',
  type: 'LIABILITY' as const,
};
const WITHHOLDING_GROSS_INCOME_ACCOUNT = {
  code: '2.1.08',
  name: 'Retenciones de IIBB a depositar',
  type: 'LIABILITY' as const,
};
const WITHHOLDING_ACCOUNT_BY_TAX_TYPE: Record<WithholdingTaxType, typeof WITHHOLDING_INCOME_TAX_ACCOUNT> = {
  INCOME_TAX: WITHHOLDING_INCOME_TAX_ACCOUNT,
  VAT: WITHHOLDING_VAT_ACCOUNT,
  GROSS_INCOME: WITHHOLDING_GROSS_INCOME_ACCOUNT,
};
// Espejo de las cuentas de Retenciones de arriba, pero del lado Ventas: acá
// no retenemos, PERCIBIMOS (le cobramos de más a un cliente por cuenta de
// AFIP/ARBA/etc.) - mismo hecho económico (plata que no es nuestra, hay que
// depositarla), signo contrario (pasivo que crece con la venta, no con un
// pago). Una sola cuenta agregada sin desagregar por InvoiceTaxLineKind,
// mismo criterio que PERCEPTIONS_ACCOUNT/WITHHOLDING_* de arriba - el
// detalle por tributo vive en InvoiceTaxLine, no multiplica cuentas.
const PERCEPTIONS_PAYABLE_ACCOUNT = {
  code: '2.1.09',
  name: 'Percepciones cobradas a depositar',
  type: 'LIABILITY' as const,
};

export interface PostInvoiceJournalEntryInput {
  invoiceId: string;
  subtotal: Prisma.Decimal | number | string;
  taxTotal: Prisma.Decimal | number | string;
  total: Prisma.Decimal | number | string;
  date?: Date;
  // Weighted-average cost of the goods sold in this invoice, computed by
  // SalesService from the unitCost each SALE_OUT movement was stamped
  // with. Optional/zero is common (uncosted variant, no purchase history
  // yet) and simply skips the COGS lines below - not an error.
  cogsAmount?: Prisma.Decimal | number | string;
  // Suma de InvoiceTaxLine.amount (percepciones, ej. IIBB) - ya incluida
  // en `total` (ver InvoicingService.createInvoice), necesaria acá aparte
  // para no romper el balanceo Dr AR(total) = Cr Ventas+IVA+Percepciones.
  otherTaxesTotal?: Prisma.Decimal | number | string;
}

export interface PostCreditNoteJournalEntryInput {
  creditNoteId: string;
  invoiceId: string;
  subtotal: Prisma.Decimal | number | string;
  taxTotal: Prisma.Decimal | number | string;
  total: Prisma.Decimal | number | string;
  date?: Date;
  // Cost of the credited (returned) quantity - same optional/zero-is-fine
  // treatment as postInvoiceJournalEntry's cogsAmount.
  cogsAmount?: Prisma.Decimal | number | string;
}

export interface PostGoodsReceiptAccrualInput {
  goodsReceiptId: string;
  amount: Prisma.Decimal | number | string;
  date?: Date;
}

export interface ReverseSupplierReturnAccrualInput {
  supplierReturnId: string;
  amount: Prisma.Decimal | number | string;
  date?: Date;
}

export interface ReverseSupplierReturnAgainstPayableInput {
  supplierReturnId: string;
  amount: Prisma.Decimal | number | string;
  date?: Date;
}

export interface PurchaseInvoicePerceptionInput {
  concept: string;
  amount: Prisma.Decimal | number | string;
}

export interface PostPurchaseInvoiceJournalEntryInput {
  purchaseInvoiceId: string;
  // Portion of the invoice's subtotal backed by GRNI-accrued receipts -
  // clears (debits) that bridge liability. Zero for a pure-services
  // invoice with no linked GoodsReceipt.
  grniClearedAmount: Prisma.Decimal | number | string;
  // subtotal - grniClearedAmount: services or price variance not backed by
  // any receipt - see PURCHASES_NO_RECEIPT_ACCOUNT.
  nonGrniAmount: Prisma.Decimal | number | string;
  ivaCredito: Prisma.Decimal | number | string;
  percepciones: PurchaseInvoicePerceptionInput[];
  total: Prisma.Decimal | number | string;
  date?: Date;
}

export interface PostPurchaseCreditNoteJournalEntryInput {
  purchaseCreditNoteId: string;
  subtotal: Prisma.Decimal | number | string;
  taxTotal: Prisma.Decimal | number | string;
  total: Prisma.Decimal | number | string;
  date?: Date;
}

export interface SupplierPaymentWithholdingInput {
  taxType: WithholdingTaxType;
  amount: Prisma.Decimal | number | string;
}

export interface PostSupplierPaymentJournalEntryInput {
  supplierPaymentId: string;
  // Cash/bank actually paid - unchanged meaning even when withholdings is
  // non-empty (see PurchaseInvoiceService.recordPayment's own comment).
  amount: Prisma.Decimal | number | string;
  // One entry per withholding line already recorded on the SupplierPayment
  // - grouped/summed here by taxType (the composition root doesn't need to
  // pre-aggregate, see apps/api's PurchaseInvoicesService.recordPayment).
  withholdings?: SupplierPaymentWithholdingInput[];
  // De dónde salió la plata: la cuenta de Tesorería, un cheque de cartera
  // endosado (CHECKS_IN_PORTFOLIO) o un cheque propio diferido
  // (OWN_CHECKS_PAYABLE).
  money: MoneySide;
  date?: Date;
}

export interface PostReceiptJournalEntryInput {
  receiptId: string;
  amount: Prisma.Decimal | number | string;
  // Dónde entró la plata: la cuenta de Tesorería o, si se cobró con un
  // cheque de tercero, CHECKS_IN_PORTFOLIO.
  money: MoneySide;
  date?: Date;
}

export interface PostCheckRejectionJournalEntryInput {
  checkId: string;
  amount: Prisma.Decimal | number | string;
  feeAmount?: Prisma.Decimal | number | string;
  // Dónde estaba el cheque al rebotar: el banco donde se depositó, la
  // cartera, o ACCOUNTS_PAYABLE si se había endosado a un proveedor.
  money: MoneySide;
  date?: Date;
}

export interface PostTransferJournalEntryInput {
  fromFinancialAccountId: string;
  toFinancialAccountId: string;
  /** En la moneda base (pesos): quien llama ya convirtió si las cuentas son
   * en otra moneda. */
  amount: Prisma.Decimal | number | string;
  description: string;
  date?: Date;
}

export interface PostCheckDepositJournalEntryInput {
  checkId: string;
  financialAccountId: string;
  amount: Prisma.Decimal | number | string;
  date?: Date;
}

export interface PostOwnCheckClearedJournalEntryInput {
  checkId: string;
  financialAccountId: string;
  amount: Prisma.Decimal | number | string;
  date?: Date;
}

export interface PostBankStatementAdjustmentJournalEntryInput {
  bankStatementLineId: string;
  // La cuenta bancaria del extracto.
  financialAccountId: string;
  kind: 'EXPENSE' | 'INCOME';
  /** Siempre una magnitud positiva - el signo ya lo decide `kind`, no el
   * signo de este número. */
  amount: Prisma.Decimal | number | string;
  date?: Date;
}

export interface PostCashSessionAdjustmentJournalEntryInput {
  cashSessionId: string;
  // La cuenta de Tesorería de la caja (CashRegister.financialAccountId).
  financialAccountId: string;
  /** CashSession.difference tal cual (countedAmount - expectedAmount) -
   * positivo = sobrante, negativo = faltante, nunca cero (ver short-circuit
   * en el método). El signo decide qué cuenta de resultado se usa, el
   * asiento siempre postea la magnitud absoluta. */
  difference: Prisma.Decimal | number | string;
  date?: Date;
}

export interface PostInflationAdjustmentJournalEntryInput {
  inflationAdjustmentId: string;
  /** RECPAM tal cual lo devuelve InflationAdjustmentService.getPreview -
   * positivo = pérdida, negativo = ganancia, nunca cero (ver short-circuit
   * en el método). El signo decide qué cuenta de resultado se usa, el
   * asiento siempre postea la magnitud absoluta. */
  recpamAmount: Prisma.Decimal | number | string;
  date?: Date;
}

export interface PostExchangeRateRevaluationInput {
  financialAccountId: string;
  /** currentBalance de la FinancialAccount al momento de revaluar, en su
   * propia moneda (no en la base) - ver
   * ReportsFinancialService.revalueFinancialAccount, que ya lo trae. */
  currentBalance: Prisma.Decimal | number | string;
  /** Tipo de cambio anterior (FinancialAccount.lastRevaluationRate) contra
   * el que se compara. undefined/null = primera revaluación: sólo fija la
   * base, no hay asiento posible sin un valor previo del cual difiera. */
  previousRate: Prisma.Decimal | number | string | null | undefined;
  /** Tipo de cambio nuevo a aplicar (moneda de la cuenta por 1 base). */
  newRate: Prisma.Decimal | number | string;
  date?: Date;
}

export interface PostProductionJournalEntryInput {
  productionOrderId: string;
  /** Suma de ProductionConsumption.cost de la orden (todo lo consumido). */
  inputsCost: Prisma.Decimal | number | string;
  /** Suma de ProductionOutput.cost de la orden (principal + subproductos). */
  outputsCost: Prisma.Decimal | number | string;
  date?: Date;
}

export interface TrialBalanceRow {
  accountId: string;
  code: string;
  name: string;
  type: AccountType;
  debitTotal: Prisma.Decimal;
  creditTotal: Prisma.Decimal;
  balance: Prisma.Decimal;
}

@Injectable()
export class AccountingService {
  createAccount(dto: CreateAccountDto): Promise<AccountingAccount> {
    return getTenantDb().accountingAccount.create({
      data: { tenantId: getTenantId(), code: dto.code, name: dto.name, type: dto.type },
    });
  }

  listAccounts(): Promise<AccountingAccount[]> {
    return getTenantDb().accountingAccount.findMany({ orderBy: { code: 'asc' } });
  }

  /** Sólo `isMonetary` es editable hoy (ver UpdateAccountDto) - clasificación
   * monetaria/no monetaria para el Ajuste por Inflación (RT6/NC39). */
  async updateAccount(id: string, dto: { isMonetary: boolean }): Promise<AccountingAccount> {
    const account = await getTenantDb().accountingAccount.findUnique({ where: { id } });
    if (!account) {
      throw new NotFoundException('Account not found');
    }
    return getTenantDb().accountingAccount.update({ where: { id }, data: { isMonetary: dto.isMonetary } });
  }

  listJournalEntries(): Promise<JournalEntryWithLines[]> {
    return getTenantDb().journalEntry.findMany({
      include: { lines: true },
      orderBy: { date: 'desc' },
    });
  }

  async getJournalEntry(id: string): Promise<JournalEntryWithLines> {
    const entry = await getTenantDb().journalEntry.findUnique({
      where: { id },
      include: { lines: true },
    });
    if (!entry) {
      throw new NotFoundException('Journal entry not found');
    }
    return entry;
  }

  /**
   * Posts entry + lines atomically (same per-request transaction as
   * everything else via getTenantDb()) after checking the fundamental
   * double-entry invariant: total debits must equal total credits. Once
   * posted, the journal_entry_lock trigger makes both the entry and its
   * lines immutable - see createReversingEntry() for how corrections work.
   */
  async postJournalEntry(dto: PostJournalEntryDto): Promise<JournalEntryWithLines> {
    const tenantId = getTenantId();
    const createdById = getUserId();
    if (!createdById) {
      throw new BadRequestException('An authenticated user is required to post a journal entry');
    }

    let debitTotal = new Prisma.Decimal(0);
    let creditTotal = new Prisma.Decimal(0);
    for (const line of dto.lines) {
      const amount = new Prisma.Decimal(line.amount);
      if (line.direction === 'DEBIT') {
        debitTotal = debitTotal.add(amount);
      } else {
        creditTotal = creditTotal.add(amount);
      }
    }

    if (!debitTotal.eq(creditTotal)) {
      throw new BadRequestException(
        `Journal entry is not balanced: debits ${debitTotal.toFixed(2)} != credits ${creditTotal.toFixed(2)}`,
      );
    }

    return getTenantDb().journalEntry.create({
      data: {
        tenantId,
        description: dto.description,
        date: dto.date ? new Date(dto.date) : undefined,
        invoiceId: dto.invoiceId,
        createdById,
        lines: {
          createMany: {
            data: dto.lines.map((line) => ({
              accountId: line.accountId,
              direction: line.direction,
              amount: line.amount,
            })),
          },
        },
      },
      include: { lines: true },
    });
  }

  private async getOrCreateAccount(spec: {
    code: string;
    name: string;
    type: AccountType;
    isMonetary?: boolean;
  }): Promise<AccountingAccount> {
    const db = getTenantDb();
    const existing = await db.accountingAccount.findFirst({ where: { code: spec.code } });
    if (existing) {
      return existing;
    }
    return db.accountingAccount.create({
      data: {
        tenantId: getTenantId(),
        code: spec.code,
        name: spec.name,
        type: spec.type,
        ...(spec.isMonetary !== undefined ? { isMonetary: spec.isMonetary } : {}),
      },
    });
  }

  /**
   * Pasa al tenant de la cuenta contable única "Caja" a una cuenta contable
   * por cada cuenta de dinero de Tesorería. Corre una sola vez por tenant
   * (TenantSettings.moneyAccountsSplitAt) y reclasifica con un asiento: el
   * saldo de "Caja" va a la cuenta de cada cuenta de dinero según su saldo
   * actual; lo que la contabilidad tenía de más (cobros sin cuenta) va a
   * "Cobranzas a depositar" - también como movimiento de Tesorería, para que
   * esa cuenta muestre lo mismo -, y lo que tenía de menos (saldos iniciales
   * y movimientos manuales nunca asentados) contra "Saldos Iniciales de
   * Cuentas de Dinero".
   *
   * Quien registre un movimiento de dinero la llama ANTES de tocar
   * FinancialAccount.currentBalance: si corriera después, la reclasificación
   * contaría dos veces ese mismo movimiento (ya en el saldo de la cuenta y
   * otra vez en su asiento). moneyAccountFor exige que ya haya corrido.
   */
  async ensureMoneyAccounts(): Promise<void> {
    const db = getTenantDb();
    const tenantId = getTenantId();
    const isDone = async () =>
      Boolean(
        (await db.tenantSettings.findUnique({ where: { tenantId }, select: { moneyAccountsSplitAt: true } }))
          ?.moneyAccountsSplitAt,
      );
    if (await isDone()) {
      return;
    }
    // Dos requests a la vez no reclasifican dos veces.
    const lockKey = `money-accounts:${tenantId}`;
    await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
    if (await isDone()) {
      return;
    }

    const legacy = await db.accountingAccount.findFirst({ where: { code: CASH_ACCOUNT.code } });
    const legacyBalance = legacy ? await this.accountBalance(legacy.id) : new Prisma.Decimal(0);

    const lines: PostJournalEntryDto['lines'] = [];
    const push = (accountId: string, value: Prisma.Decimal) => {
      if (value.isZero()) return;
      lines.push({
        accountId,
        direction: value.gt(0) ? 'DEBIT' : 'CREDIT',
        amount: value.abs().toNumber(),
      });
    };

    let assigned = new Prisma.Decimal(0);
    const financialAccounts = await db.financialAccount.findMany({ orderBy: { name: 'asc' } });
    for (const financialAccount of financialAccounts) {
      const account = await this.linkMoneyAccount(financialAccount.id);
      // En pesos: una cuenta en otra moneda vale su saldo al último tipo de
      // cambio al que se revaluó; nunca revaluada = todavía no tiene valor
      // contable (la primera revaluación lo fija, ver postExchangeRateRevaluation).
      const value = financialAccount.currencyId
        ? financialAccount.currentBalance.mul(financialAccount.lastRevaluationRate ?? 0).toDecimalPlaces(2)
        : financialAccount.currentBalance;
      push(account.id, value);
      assigned = assigned.add(value);
    }

    // Lo que "Caja" registró y no está en ninguna cuenta de dinero, separado
    // por qué es (lecturas directas de cobros/pagos/cheques: es una
    // migración de una sola vez, no lógica de esos módulos):
    // - Cheques de terceros todavía en cartera -> Cheques en Cartera.
    const portfolio = await this.sumChecks({ kind: 'THIRD_PARTY', status: 'PORTFOLIO' });
    if (!portfolio.isZero()) {
      push((await this.getOrCreateAccount(CHECKS_IN_PORTFOLIO_ACCOUNT)).id, portfolio);
    }
    // - Cheques propios emitidos que el banco todavía no debitó: "Caja" ya
    //   los había restado, son deuda -> Cheques Diferidos a Pagar.
    const ownIssued = await this.sumChecks({ kind: 'OWN', status: 'ISSUED' });
    if (!ownIssued.isZero()) {
      push((await this.getOrCreateAccount(OWN_CHECKS_PAYABLE_ACCOUNT)).id, ownIssued.neg());
    }
    // - Cobros (y pagos) sin cuenta de dinero ni cheque: la plata está en
    //   algún lado que Oplex no sabe -> "Cobranzas a depositar", para que se
    //   pase a donde está.
    //   Se mide lo que "Caja" registró por ellos (en pesos y neto de
    //   retenciones), no el importe del documento.
    let pendingValue = legacy
      ? await this.accountBalance(legacy.id, {
          OR: [
            { receipt: { financialAccountId: null, check: null } },
            { supplierPayment: { financialAccountId: null, check: null } },
          ],
        })
      : new Prisma.Decimal(0);

    // Lo que quede sin explicar: si "Caja" tenía de más, también va a
    // "Cobranzas a depositar" (plata que entró sin cuenta); si tenía de
    // menos, son saldos que nunca se asentaron (saldos iniciales de las
    // cuentas, movimientos manuales) -> Saldos Iniciales de Cuentas de Dinero.
    const unexplained = legacyBalance.sub(assigned).sub(pendingValue).sub(portfolio).add(ownIssued);
    if (unexplained.gt(0)) {
      pendingValue = pendingValue.add(unexplained);
    } else if (unexplained.lt(0)) {
      push((await this.getOrCreateAccount(MONEY_OPENING_BALANCES_ACCOUNT)).id, unexplained);
    }
    if (!pendingValue.isZero()) {
      const pending = await getOrCreateSystemFinancialAccount(db, tenantId, 'PENDING_DEPOSIT');
      push((await this.linkMoneyAccount(pending.id)).id, pendingValue);
      // Tesorería tiene que mostrar lo mismo que la contabilidad.
      await db.financialTransaction.create({
        data: {
          tenantId,
          financialAccountId: pending.id,
          amount: pendingValue,
          externalRef: 'Cobros sin cuenta de dinero asignada (reclasificación de "Caja")',
        },
      });
      await db.financialAccount.update({
        where: { id: pending.id },
        data: { currentBalance: { increment: pendingValue } },
      });
    }
    if (legacy) {
      push(legacy.id, legacyBalance.neg());
    }

    if (lines.length > 0) {
      await this.createBalancedEntry(
        'Reclasificación: de "Caja" a una cuenta contable por cada cuenta de dinero',
        lines,
        {},
      );
    }
    await db.tenantSettings.upsert({
      where: { tenantId },
      create: { tenantId, moneyAccountsSplitAt: new Date() },
      update: { moneyAccountsSplitAt: new Date() },
    });
  }

  /** La cuenta contable de una cuenta de dinero (Tesorería). */
  private async moneyAccountFor(financialAccountId: string): Promise<AccountingAccount> {
    const settings = await getTenantDb().tenantSettings.findUnique({
      where: { tenantId: getTenantId() },
      select: { moneyAccountsSplitAt: true },
    });
    if (!settings?.moneyAccountsSplitAt) {
      // Error de programación, no del usuario: ver ensureMoneyAccounts.
      throw new Error('ensureMoneyAccounts() tiene que correr antes de asentar un movimiento de dinero');
    }
    return this.linkMoneyAccount(financialAccountId);
  }

  /** Crea (la primera vez) y vincula la cuenta contable 1.1.03.NN de una
   * cuenta de dinero, con su mismo nombre. */
  private async linkMoneyAccount(financialAccountId: string): Promise<AccountingAccount> {
    const db = getTenantDb();
    const financialAccount = await db.financialAccount.findUnique({
      where: { id: financialAccountId },
      include: { accountingAccount: true },
    });
    if (!financialAccount) {
      throw new NotFoundException('Financial account not found');
    }
    if (financialAccount.accountingAccount) {
      return financialAccount.accountingAccount;
    }
    const siblings = await db.accountingAccount.findMany({
      where: { code: { startsWith: MONEY_ACCOUNT_CODE_PREFIX } },
      select: { code: true },
    });
    const next =
      siblings.reduce((max, s) => Math.max(max, Number.parseInt(s.code.slice(MONEY_ACCOUNT_CODE_PREFIX.length), 10) || 0), 0) +
      1;
    const account = await db.accountingAccount.create({
      data: {
        tenantId: getTenantId(),
        code: `${MONEY_ACCOUNT_CODE_PREFIX}${String(next).padStart(2, '0')}`,
        name: financialAccount.name,
        type: CASH_ACCOUNT.type,
      },
    });
    await db.financialAccount.update({
      where: { id: financialAccountId },
      data: { accountingAccountId: account.id },
    });
    return account;
  }

  private async resolveMoneySide(side: MoneySide): Promise<AccountingAccount> {
    if ('financialAccountId' in side) {
      return this.moneyAccountFor(side.financialAccountId);
    }
    switch (side.kind) {
      case 'CHECKS_IN_PORTFOLIO':
        return this.getOrCreateAccount(CHECKS_IN_PORTFOLIO_ACCOUNT);
      case 'OWN_CHECKS_PAYABLE':
        return this.getOrCreateAccount(OWN_CHECKS_PAYABLE_ACCOUNT);
      case 'ACCOUNTS_PAYABLE':
        return this.getOrCreateAccount(ACCOUNTS_PAYABLE_ACCOUNT);
    }
  }

  private async sumChecks(where: { kind: 'THIRD_PARTY' | 'OWN'; status: 'PORTFOLIO' | 'ISSUED' }): Promise<Prisma.Decimal> {
    const result = await getTenantDb().check.aggregate({ where, _sum: { amount: true } });
    return result._sum.amount ?? new Prisma.Decimal(0);
  }

  /** Debe - Haber de una cuenta, todos los asientos (o sólo los que cumplan journalEntry). */
  private async accountBalance(accountId: string, journalEntry?: Prisma.JournalEntryWhereInput): Promise<Prisma.Decimal> {
    const db = getTenantDb();
    const [debit, credit] = await Promise.all([
      db.journalEntryLine.aggregate({ where: { accountId, direction: 'DEBIT', journalEntry }, _sum: { amount: true } }),
      db.journalEntryLine.aggregate({ where: { accountId, direction: 'CREDIT', journalEntry }, _sum: { amount: true } }),
    ]);
    return (debit._sum.amount ?? new Prisma.Decimal(0)).sub(credit._sum.amount ?? new Prisma.Decimal(0));
  }

  /**
   * Auto-posting entry point for the sales flow: called by SalesService
   * (apps/api) right after an invoice is created, in the same per-request
   * transaction, so a rollback of one rolls back the other. Books the
   * standard accrual sale - debit Accounts Receivable for the full total,
   * credit Sales Revenue for the pre-tax subtotal, credit VAT payable for
   * the tax - which is always balanced by construction, since
   * Invoice.total is defined as subtotal + taxTotal. Reuses
   * postJournalEntry()'s balance check as a defense-in-depth sanity check,
   * not because it's expected to ever fail here.
   *
   * Resolves accounts by well-known code, creating them tenant-side on
   * first use - see the *_ACCOUNT constants above. A tenant that already
   * created its own account with one of those codes (e.g. via
   * POST /accounting/accounts) gets that account reused instead.
   *
   * Skips posting entirely for a zero-total invoice (nothing financial
   * happened) rather than writing a degenerate zero-amount entry. Same
   * treatment for the optional COGS pair (debit Costo de Mercadería
   * Vendida / credit Mercaderías) - appended to this SAME entry rather
   * than a second one, since JournalEntry.invoiceId is @unique: a second
   * entry per invoice isn't possible without a schema change. The two COGS
   * lines always carry the identical amount to each other, so the
   * debit=credit balance holds regardless of whether they're present -
   * independent of the AR/revenue/VAT lines above.
   *
   * Credit notes do NOT reverse this entry (see postCreditNoteJournalEntry
   * below) - invoiceId being @unique means only one entry can ever exist
   * per invoice, so a credit note (possibly partial, possibly more than
   * one over time) posts its own independent entry instead.
   */
  async postInvoiceJournalEntry(
    input: PostInvoiceJournalEntryInput,
  ): Promise<JournalEntryWithLines | undefined> {
    const total = new Prisma.Decimal(input.total);
    if (total.lte(0)) {
      return undefined;
    }
    const subtotal = new Prisma.Decimal(input.subtotal);
    const taxTotal = new Prisma.Decimal(input.taxTotal);
    const cogsAmount = new Prisma.Decimal(input.cogsAmount ?? 0);
    const otherTaxesTotal = new Prisma.Decimal(input.otherTaxesTotal ?? 0);

    const [ar, revenue, vat, perceptionsPayable, cogsAccounts] = await Promise.all([
      this.getOrCreateAccount(ACCOUNTS_RECEIVABLE_ACCOUNT),
      this.getOrCreateAccount(SALES_REVENUE_ACCOUNT),
      taxTotal.gt(0) ? this.getOrCreateAccount(VAT_PAYABLE_ACCOUNT) : Promise.resolve(undefined),
      otherTaxesTotal.gt(0)
        ? this.getOrCreateAccount(PERCEPTIONS_PAYABLE_ACCOUNT)
        : Promise.resolve(undefined),
      cogsAmount.gt(0)
        ? Promise.all([
            this.getOrCreateAccount(COGS_EXPENSE_ACCOUNT),
            this.getOrCreateAccount(INVENTORY_ASSET_ACCOUNT),
          ])
        : Promise.resolve(undefined),
    ]);

    const lines: PostJournalEntryDto['lines'] = [
      { accountId: ar.id, direction: 'DEBIT', amount: total.toNumber() },
      { accountId: revenue.id, direction: 'CREDIT', amount: subtotal.toNumber() },
    ];
    if (vat && taxTotal.gt(0)) {
      lines.push({ accountId: vat.id, direction: 'CREDIT', amount: taxTotal.toNumber() });
    }
    if (perceptionsPayable && otherTaxesTotal.gt(0)) {
      lines.push({ accountId: perceptionsPayable.id, direction: 'CREDIT', amount: otherTaxesTotal.toNumber() });
    }
    if (cogsAccounts && cogsAmount.gt(0)) {
      const [cogs, inventory] = cogsAccounts;
      lines.push({ accountId: cogs.id, direction: 'DEBIT', amount: cogsAmount.toNumber() });
      lines.push({ accountId: inventory.id, direction: 'CREDIT', amount: cogsAmount.toNumber() });
    }

    return this.postJournalEntry({
      description: `Venta - comprobante ${input.invoiceId}`,
      date: input.date?.toISOString(),
      invoiceId: input.invoiceId,
      lines,
    });
  }

  /**
   * Auto-posting entry point for credit notes - called by SalesService
   * .voidSale() (apps/api) right after InvoicingService.createCreditNote(),
   * same per-request transaction as everything else. Deliberately does NOT
   * use createReversingEntry()/mirror postInvoiceJournalEntry's entry: a
   * credit note can be partial (crediting only some quantity of some
   * lines), and both invoiceId and reversalOfId are @unique on
   * JournalEntry - a second partial credit note on the same invoice
   * couldn't link back to the same original sale entry either way. Instead
   * this posts its own independently-balanced entry, resolved later by
   * creditNoteId (also @unique - one entry per credit note).
   *
   * Books the mirror image of postInvoiceJournalEntry: credit Accounts
   * Receivable (the customer owes less), debit Sales Revenue and VAT
   * Payable (both go down), and - if the credited quantity had a cost
   * basis - credit Costo de Mercadería Vendida / debit Mercaderías (the
   * expense reverses, the goods are back in stock). Balanced by
   * construction the same way the sale side is: creditNote.total is
   * defined as subtotal + taxTotal, and the COGS pair always carries the
   * same amount on both sides.
   *
   * Skips posting entirely for a zero-total credit note (shouldn't happen -
   * CreateCreditNoteDto requires at least one line - but mirrors
   * postInvoiceJournalEntry's defensive skip rather than writing a
   * degenerate entry).
   */
  async postCreditNoteJournalEntry(
    input: PostCreditNoteJournalEntryInput,
  ): Promise<JournalEntryWithLines | undefined> {
    const total = new Prisma.Decimal(input.total);
    if (total.lte(0)) {
      return undefined;
    }
    const subtotal = new Prisma.Decimal(input.subtotal);
    const taxTotal = new Prisma.Decimal(input.taxTotal);
    const cogsAmount = new Prisma.Decimal(input.cogsAmount ?? 0);

    const [ar, revenue, vat, cogsAccounts] = await Promise.all([
      this.getOrCreateAccount(ACCOUNTS_RECEIVABLE_ACCOUNT),
      this.getOrCreateAccount(SALES_REVENUE_ACCOUNT),
      taxTotal.gt(0) ? this.getOrCreateAccount(VAT_PAYABLE_ACCOUNT) : Promise.resolve(undefined),
      cogsAmount.gt(0)
        ? Promise.all([
            this.getOrCreateAccount(COGS_EXPENSE_ACCOUNT),
            this.getOrCreateAccount(INVENTORY_ASSET_ACCOUNT),
          ])
        : Promise.resolve(undefined),
    ]);

    const lines: PostJournalEntryDto['lines'] = [
      { accountId: ar.id, direction: 'CREDIT', amount: total.toNumber() },
      { accountId: revenue.id, direction: 'DEBIT', amount: subtotal.toNumber() },
    ];
    if (vat && taxTotal.gt(0)) {
      lines.push({ accountId: vat.id, direction: 'DEBIT', amount: taxTotal.toNumber() });
    }
    if (cogsAccounts && cogsAmount.gt(0)) {
      const [cogs, inventory] = cogsAccounts;
      lines.push({ accountId: cogs.id, direction: 'CREDIT', amount: cogsAmount.toNumber() });
      lines.push({ accountId: inventory.id, direction: 'DEBIT', amount: cogsAmount.toNumber() });
    }

    const tenantId = getTenantId();
    const createdById = getUserId();
    if (!createdById) {
      throw new BadRequestException('An authenticated user is required to post a journal entry');
    }

    let debitTotal = new Prisma.Decimal(0);
    let creditTotal = new Prisma.Decimal(0);
    for (const line of lines) {
      const amount = new Prisma.Decimal(line.amount);
      if (line.direction === 'DEBIT') {
        debitTotal = debitTotal.add(amount);
      } else {
        creditTotal = creditTotal.add(amount);
      }
    }
    if (!debitTotal.eq(creditTotal)) {
      throw new BadRequestException(
        `Credit note journal entry is not balanced: debits ${debitTotal.toFixed(2)} != credits ${creditTotal.toFixed(2)}`,
      );
    }

    return getTenantDb().journalEntry.create({
      data: {
        tenantId,
        description: `Nota de crédito - comprobante ${input.invoiceId}`,
        date: input.date,
        creditNoteId: input.creditNoteId,
        createdById,
        lines: {
          createMany: {
            data: lines.map((line) => ({
              accountId: line.accountId,
              direction: line.direction,
              amount: line.amount,
            })),
          },
        },
      },
      include: { lines: true },
    });
  }

  /** Shared by the 4 Compras/Cuentas a Pagar posting methods below - same
   * balance-check-then-create shape as postJournalEntry(), duplicated
   * rather than reused because PostJournalEntryDto (the public "asiento
   * manual" endpoint's DTO) only accepts invoiceId, not these newer FKs -
   * same reason postCreditNoteJournalEntry already has its own inline
   * balance check instead of calling postJournalEntry(). Widening that
   * DTO would let a manually-posted entry claim one of these FKs from the
   * public API, which isn't something a user should be able to do by hand. */
  private async createBalancedEntry(
    description: string,
    lines: PostJournalEntryDto['lines'],
    opts: {
      date?: Date;
      goodsReceiptId?: string;
      supplierReturnId?: string;
      purchaseInvoiceId?: string;
      purchaseCreditNoteId?: string;
      supplierPaymentId?: string;
      receiptId?: string;
      checkId?: string;
      bankStatementLineId?: string;
      inflationAdjustmentId?: string;
      cashSessionId?: string;
      productionOrderId?: string;
    },
  ): Promise<JournalEntryWithLines> {
    const tenantId = getTenantId();
    const createdById = getUserId();
    if (!createdById) {
      throw new BadRequestException('An authenticated user is required to post a journal entry');
    }

    let debitTotal = new Prisma.Decimal(0);
    let creditTotal = new Prisma.Decimal(0);
    for (const line of lines) {
      const amount = new Prisma.Decimal(line.amount);
      if (line.direction === 'DEBIT') {
        debitTotal = debitTotal.add(amount);
      } else {
        creditTotal = creditTotal.add(amount);
      }
    }
    if (!debitTotal.eq(creditTotal)) {
      throw new BadRequestException(
        `Journal entry is not balanced: debits ${debitTotal.toFixed(2)} != credits ${creditTotal.toFixed(2)}`,
      );
    }

    return getTenantDb().journalEntry.create({
      data: {
        tenantId,
        description,
        date: opts.date,
        goodsReceiptId: opts.goodsReceiptId,
        supplierReturnId: opts.supplierReturnId,
        purchaseInvoiceId: opts.purchaseInvoiceId,
        purchaseCreditNoteId: opts.purchaseCreditNoteId,
        supplierPaymentId: opts.supplierPaymentId,
        receiptId: opts.receiptId,
        checkId: opts.checkId,
        bankStatementLineId: opts.bankStatementLineId,
        inflationAdjustmentId: opts.inflationAdjustmentId,
        cashSessionId: opts.cashSessionId,
        productionOrderId: opts.productionOrderId,
        createdById,
        lines: {
          createMany: {
            data: lines.map((line) => ({
              accountId: line.accountId,
              direction: line.direction,
              amount: line.amount,
            })),
          },
        },
      },
      include: { lines: true },
    });
  }

  /**
   * Posted when a GoodsReceipt (remito) is recorded, in the same
   * transaction as the stock movement it drives (see apps/api's
   * GoodsReceiptsService) - the GRNI accrual: we now hold the goods
   * (debit Mercaderías) but haven't seen the supplier's invoice yet
   * (credit the GRNI bridge liability instead of Proveedores directly).
   * Cleared later by postPurchaseInvoiceJournalEntry. Skipped for a
   * zero-amount receipt (shouldn't happen - a PurchaseOrderLine always has
   * a real unitCost - but mirrors the other post* methods' defensive skip).
   */
  async postGoodsReceiptAccrual(
    input: PostGoodsReceiptAccrualInput,
  ): Promise<JournalEntryWithLines | undefined> {
    const amount = new Prisma.Decimal(input.amount);
    if (amount.lte(0)) {
      return undefined;
    }
    const [inventory, grni] = await Promise.all([
      this.getOrCreateAccount(INVENTORY_ASSET_ACCOUNT),
      this.getOrCreateAccount(GRNI_ACCOUNT),
    ]);
    return this.createBalancedEntry(
      `Recepción de mercadería - remito ${input.goodsReceiptId}`,
      [
        { accountId: inventory.id, direction: 'DEBIT', amount: amount.toNumber() },
        { accountId: grni.id, direction: 'CREDIT', amount: amount.toNumber() },
      ],
      { date: input.date, goodsReceiptId: input.goodsReceiptId },
    );
  }

  /**
   * Posted when a SupplierReturn is recorded against a remito that already
   * accrued GRNI - mirror image of postGoodsReceiptAccrual for the
   * returned quantity's cost: the goods are going back (credit
   * Mercaderías) and we owe the supplier that much less once invoiced
   * (debit down the GRNI bridge). Its own independent entry, not
   * createReversingEntry() against the original accrual - same reason
   * postCreditNoteJournalEntry doesn't mirror postInvoiceJournalEntry:
   * this is a partial amount tied to specific returned lines, not
   * necessarily the whole receipt.
   */
  async reverseSupplierReturnAccrual(
    input: ReverseSupplierReturnAccrualInput,
  ): Promise<JournalEntryWithLines | undefined> {
    const amount = new Prisma.Decimal(input.amount);
    if (amount.lte(0)) {
      return undefined;
    }
    const [inventory, grni] = await Promise.all([
      this.getOrCreateAccount(INVENTORY_ASSET_ACCOUNT),
      this.getOrCreateAccount(GRNI_ACCOUNT),
    ]);
    return this.createBalancedEntry(
      `Devolución a proveedor - ${input.supplierReturnId}`,
      [
        { accountId: grni.id, direction: 'DEBIT', amount: amount.toNumber() },
        { accountId: inventory.id, direction: 'CREDIT', amount: amount.toNumber() },
      ],
      { date: input.date, supplierReturnId: input.supplierReturnId },
    );
  }

  /**
   * Posted when a SupplierReturn is recorded against a remito that was
   * ALREADY invoiced (see reverseSupplierReturnAccrual just above for the
   * not-yet-invoiced case). By the time a PurchaseInvoice exists for a
   * receipt, that receipt's GRNI accrual was already cleared into
   * Proveedores (postPurchaseInvoiceJournalEntry) - crediting GRNI again
   * here would leave a debit balance nothing will ever clear, since no
   * future invoice is coming for this receipt to clear it against. What's
   * actually owed less now is Proveedores itself: Dr Proveedores (we owe
   * less) / Cr Mercaderías (the goods are going back). Composition root
   * (apps/api's SupplierReturnsService) is what decides which of these two
   * methods to call, based on whether the receipt has a PurchaseInvoice
   * linked yet - this service has no notion of that itself.
   */
  async reverseSupplierReturnAgainstPayable(
    input: ReverseSupplierReturnAgainstPayableInput,
  ): Promise<JournalEntryWithLines | undefined> {
    const amount = new Prisma.Decimal(input.amount);
    if (amount.lte(0)) {
      return undefined;
    }
    const [payable, inventory] = await Promise.all([
      this.getOrCreateAccount(ACCOUNTS_PAYABLE_ACCOUNT),
      this.getOrCreateAccount(INVENTORY_ASSET_ACCOUNT),
    ]);
    return this.createBalancedEntry(
      `Devolución a proveedor (remito ya facturado) - ${input.supplierReturnId}`,
      [
        { accountId: payable.id, direction: 'DEBIT', amount: amount.toNumber() },
        { accountId: inventory.id, direction: 'CREDIT', amount: amount.toNumber() },
      ],
      { date: input.date, supplierReturnId: input.supplierReturnId },
    );
  }

  /**
   * Posted when a Factura de Compra is created (see apps/api's
   * PurchaseInvoicesService, composing PurchaseInvoiceService +
   * AccountingService). Clears the GRNI bridge for whatever this invoice
   * settles (debit GRNI), books whatever isn't backed by a receipt as an
   * expense (services, price variance - debit Compras sin remito), books
   * the real fiscal detail the supplier's invoice carries (debit IVA
   * Crédito Fiscal, debit Percepciones Sufridas - aggregate accounts, the
   * per-concept detail lives on PurchaseInvoiceTaxLine), and credits
   * Proveedores for the total now owed. Balanced by construction: the
   * composition root computes grniClearedAmount + nonGrniAmount as an
   * exact split of the invoice's subtotal, so
   * grniClearedAmount + nonGrniAmount + ivaCredito + Σpercepciones ==
   * total always holds - createBalancedEntry's check is a defense-in-depth
   * safety net, not expected to ever fire here.
   */
  async postPurchaseInvoiceJournalEntry(
    input: PostPurchaseInvoiceJournalEntryInput,
  ): Promise<JournalEntryWithLines | undefined> {
    const total = new Prisma.Decimal(input.total);
    if (total.lte(0)) {
      return undefined;
    }
    const grniClearedAmount = new Prisma.Decimal(input.grniClearedAmount);
    const nonGrniAmount = new Prisma.Decimal(input.nonGrniAmount);
    const ivaCredito = new Prisma.Decimal(input.ivaCredito);
    const percepcionesTotal = input.percepciones.reduce(
      (sum, p) => sum.add(new Prisma.Decimal(p.amount)),
      new Prisma.Decimal(0),
    );

    const [payable, grni, expense, vatCredit, perceptions] = await Promise.all([
      this.getOrCreateAccount(ACCOUNTS_PAYABLE_ACCOUNT),
      grniClearedAmount.gt(0) ? this.getOrCreateAccount(GRNI_ACCOUNT) : Promise.resolve(undefined),
      nonGrniAmount.gt(0)
        ? this.getOrCreateAccount(PURCHASES_NO_RECEIPT_ACCOUNT)
        : Promise.resolve(undefined),
      ivaCredito.gt(0) ? this.getOrCreateAccount(VAT_CREDIT_ACCOUNT) : Promise.resolve(undefined),
      percepcionesTotal.gt(0) ? this.getOrCreateAccount(PERCEPTIONS_ACCOUNT) : Promise.resolve(undefined),
    ]);

    const lines: PostJournalEntryDto['lines'] = [
      { accountId: payable.id, direction: 'CREDIT', amount: total.toNumber() },
    ];
    if (grni && grniClearedAmount.gt(0)) {
      lines.push({ accountId: grni.id, direction: 'DEBIT', amount: grniClearedAmount.toNumber() });
    }
    if (expense && nonGrniAmount.gt(0)) {
      lines.push({ accountId: expense.id, direction: 'DEBIT', amount: nonGrniAmount.toNumber() });
    }
    if (vatCredit && ivaCredito.gt(0)) {
      lines.push({ accountId: vatCredit.id, direction: 'DEBIT', amount: ivaCredito.toNumber() });
    }
    if (perceptions && percepcionesTotal.gt(0)) {
      lines.push({ accountId: perceptions.id, direction: 'DEBIT', amount: percepcionesTotal.toNumber() });
    }

    return this.createBalancedEntry(
      `Factura de compra - comprobante ${input.purchaseInvoiceId}`,
      lines,
      { date: input.date, purchaseInvoiceId: input.purchaseInvoiceId },
    );
  }

  /**
   * Posted when a Nota de Crédito de Compra is recorded (see apps/api's
   * PurchaseCreditNotesService, composing PurchaseCreditNoteService +
   * AccountingService) - the mirror image of postPurchaseInvoiceJournalEntry,
   * simplified for a header-level document with no GRNI/receipt split: debit
   * Proveedores for the total (we owe the supplier less), credit IVA
   * Crédito Fiscal for the tax portion (less credit to claim) and credit
   * Mercaderías for the subtotal. Balanced by construction the same way the
   * invoice side is: total is defined as subtotal + taxTotal.
   *
   * Skips posting entirely for a zero-total credit note, same defensive
   * skip as every other post* method here.
   */
  async postPurchaseCreditNoteJournalEntry(
    input: PostPurchaseCreditNoteJournalEntryInput,
  ): Promise<JournalEntryWithLines | undefined> {
    const total = new Prisma.Decimal(input.total);
    if (total.lte(0)) {
      return undefined;
    }
    const subtotal = new Prisma.Decimal(input.subtotal);
    const taxTotal = new Prisma.Decimal(input.taxTotal);

    const [payable, vatCredit, inventory] = await Promise.all([
      this.getOrCreateAccount(ACCOUNTS_PAYABLE_ACCOUNT),
      taxTotal.gt(0) ? this.getOrCreateAccount(VAT_CREDIT_ACCOUNT) : Promise.resolve(undefined),
      subtotal.gt(0) ? this.getOrCreateAccount(INVENTORY_ASSET_ACCOUNT) : Promise.resolve(undefined),
    ]);

    const lines: PostJournalEntryDto['lines'] = [
      { accountId: payable.id, direction: 'DEBIT', amount: total.toNumber() },
    ];
    if (vatCredit && taxTotal.gt(0)) {
      lines.push({ accountId: vatCredit.id, direction: 'CREDIT', amount: taxTotal.toNumber() });
    }
    if (inventory && subtotal.gt(0)) {
      lines.push({ accountId: inventory.id, direction: 'CREDIT', amount: subtotal.toNumber() });
    }

    return this.createBalancedEntry(
      `Nota de crédito de compra - comprobante ${input.purchaseCreditNoteId}`,
      lines,
      { date: input.date, purchaseCreditNoteId: input.purchaseCreditNoteId },
    );
  }

  /**
   * Posted when a SupplierPayment is recorded (see apps/api's
   * PurchaseInvoicesService.recordPayment) - debit Proveedores for the
   * FULL amount cancelled (cash paid + anything withheld - withheld money
   * doesn't reach the supplier, but it does extinguish what we owed them,
   * now owed to the tax authority instead), credit Caja for the cash
   * actually paid, and credit one liability account per withholding
   * taxType for what was retained (conditional lines, same pattern as
   * postPurchaseInvoiceJournalEntry's ivaCredito/percepciones). Without the
   * Proveedores debit, Proveedores would only ever grow from
   * postPurchaseInvoiceJournalEntry and never shrink, reproducing the exact
   * same class of bug this whole feature exists to fix for Mercaderías. See
   * postReceiptJournalEntry below for the AR-side mirror of this same fix.
   */
  async postSupplierPaymentJournalEntry(
    input: PostSupplierPaymentJournalEntryInput,
  ): Promise<JournalEntryWithLines | undefined> {
    const amount = new Prisma.Decimal(input.amount);
    const withheldByTaxType = new Map<WithholdingTaxType, Prisma.Decimal>();
    for (const w of input.withholdings ?? []) {
      const current = withheldByTaxType.get(w.taxType) ?? new Prisma.Decimal(0);
      withheldByTaxType.set(w.taxType, current.add(new Prisma.Decimal(w.amount)));
    }
    let totalWithheld = new Prisma.Decimal(0);
    for (const amt of withheldByTaxType.values()) {
      totalWithheld = totalWithheld.add(amt);
    }
    const appliedAmount = amount.add(totalWithheld);
    if (appliedAmount.lte(0)) {
      return undefined;
    }

    const [payable, cash] = await Promise.all([
      this.getOrCreateAccount(ACCOUNTS_PAYABLE_ACCOUNT),
      amount.gt(0) ? this.resolveMoneySide(input.money) : Promise.resolve(undefined),
    ]);
    const withholdingAccounts = await Promise.all(
      Array.from(withheldByTaxType.entries()).map(async ([taxType, withheldAmount]) => ({
        account: await this.getOrCreateAccount(WITHHOLDING_ACCOUNT_BY_TAX_TYPE[taxType]),
        amount: withheldAmount,
      })),
    );

    const lines: PostJournalEntryDto['lines'] = [
      { accountId: payable.id, direction: 'DEBIT', amount: appliedAmount.toNumber() },
    ];
    if (cash && amount.gt(0)) {
      lines.push({ accountId: cash.id, direction: 'CREDIT', amount: amount.toNumber() });
    }
    for (const { account, amount: withheldAmount } of withholdingAccounts) {
      if (withheldAmount.gt(0)) {
        lines.push({ accountId: account.id, direction: 'CREDIT', amount: withheldAmount.toNumber() });
      }
    }

    return this.createBalancedEntry(
      `Pago a proveedor - ${input.supplierPaymentId}`,
      lines,
      { date: input.date, supplierPaymentId: input.supplierPaymentId },
    );
  }

  /**
   * Posted when a Receipt (cobro a cliente) is recorded (see apps/api's
   * SalesService.recordReceipt) - debit the money account it came into (or
   * Cheques en Cartera), credit Deudores por Ventas (they owe less). AR-side
   * mirror of postSupplierPaymentJournalEntry
   * above: Deudores por Ventas was only ever debited by
   * postInvoiceJournalEntry and never credited on collection, same
   * structural gap Compras had for Mercaderías before this feature existed.
   */
  async postReceiptJournalEntry(
    input: PostReceiptJournalEntryInput,
  ): Promise<JournalEntryWithLines | undefined> {
    const amount = new Prisma.Decimal(input.amount);
    if (amount.lte(0)) {
      return undefined;
    }
    const [cash, receivable] = await Promise.all([
      this.resolveMoneySide(input.money),
      this.getOrCreateAccount(ACCOUNTS_RECEIVABLE_ACCOUNT),
    ]);
    return this.createBalancedEntry(
      `Cobro a cliente - ${input.receiptId}`,
      [
        { accountId: cash.id, direction: 'DEBIT', amount: amount.toNumber() },
        { accountId: receivable.id, direction: 'CREDIT', amount: amount.toNumber() },
      ],
      { date: input.date, receiptId: input.receiptId },
    );
  }

  /**
   * Transferencia entre dos cuentas de dinero propias (ver apps/api's
   * TreasuryService.transferBetweenAccounts): Debe destino / Haber origen.
   * Antes no se asentaba porque las dos eran la misma "Caja"; con una cuenta
   * contable por cuenta de dinero, sin esto el balance no sabría que la
   * plata se movió (ej. "Cobranzas a depositar" -> Banco).
   */
  async postTransferJournalEntry(input: PostTransferJournalEntryInput): Promise<JournalEntryWithLines | undefined> {
    const amount = new Prisma.Decimal(input.amount);
    if (amount.lte(0)) {
      return undefined;
    }
    const [from, to] = await Promise.all([
      this.moneyAccountFor(input.fromFinancialAccountId),
      this.moneyAccountFor(input.toFinancialAccountId),
    ]);
    return this.createBalancedEntry(
      input.description,
      [
        { accountId: to.id, direction: 'DEBIT', amount: amount.toNumber() },
        { accountId: from.id, direction: 'CREDIT', amount: amount.toNumber() },
      ],
      { date: input.date },
    );
  }

  /** Depósito de un cheque de tercero (TreasuryService.depositCheck): sale
   * de Cheques en Cartera y entra al banco elegido. */
  async postCheckDepositJournalEntry(
    input: PostCheckDepositJournalEntryInput,
  ): Promise<JournalEntryWithLines | undefined> {
    const amount = new Prisma.Decimal(input.amount);
    if (amount.lte(0)) {
      return undefined;
    }
    const [bank, portfolio] = await Promise.all([
      this.moneyAccountFor(input.financialAccountId),
      this.getOrCreateAccount(CHECKS_IN_PORTFOLIO_ACCOUNT),
    ]);
    return this.createBalancedEntry(
      `Depósito de cheque - ${input.checkId}`,
      [
        { accountId: bank.id, direction: 'DEBIT', amount: amount.toNumber() },
        { accountId: portfolio.id, direction: 'CREDIT', amount: amount.toNumber() },
      ],
      { date: input.date },
    );
  }

  /** Un cheque propio diferido se cobró (TreasuryService.markCleared): la
   * deuda en "Cheques Diferidos a Pagar" se cancela y recién ahí sale la
   * plata del banco. */
  async postOwnCheckClearedJournalEntry(
    input: PostOwnCheckClearedJournalEntryInput,
  ): Promise<JournalEntryWithLines | undefined> {
    const amount = new Prisma.Decimal(input.amount);
    if (amount.lte(0)) {
      return undefined;
    }
    const [payable, bank] = await Promise.all([
      this.getOrCreateAccount(OWN_CHECKS_PAYABLE_ACCOUNT),
      this.moneyAccountFor(input.financialAccountId),
    ]);
    return this.createBalancedEntry(
      `Débito de cheque propio - ${input.checkId}`,
      [
        { accountId: payable.id, direction: 'DEBIT', amount: amount.toNumber() },
        { accountId: bank.id, direction: 'CREDIT', amount: amount.toNumber() },
      ],
      { date: input.date },
    );
  }

  /**
   * Rebote de un cheque de tercero (ver CheckService.rejectCheck /
   * apps/api's TreasuryService) - reabre la deuda del cliente y saca el
   * cheque de donde estaba al rebotar (input.money): la cartera, el banco
   * donde se depositó, o Proveedores si se había endosado (el proveedor
   * vuelve a reclamar ese pago). El gasto de rechazo opcional que se le
   * recobra al cliente es un ingreso genuino aparte, no una reversa - tres
   * líneas balanceadas: Dr Deudores (amount+fee) = Cr donde estaba el
   * cheque (amount) + Cr Gastos de Cheques Rechazados (fee). Mismo molde
   * inmutable que
   * reverseSupplierReturnAgainstPayable - nunca se edita el asiento
   * original, se postea uno nuevo.
   */
  async postCheckRejectionJournalEntry(
    input: PostCheckRejectionJournalEntryInput,
  ): Promise<JournalEntryWithLines | undefined> {
    const amount = new Prisma.Decimal(input.amount);
    const feeAmount = new Prisma.Decimal(input.feeAmount ?? 0);
    if (amount.lte(0) && feeAmount.lte(0)) {
      return undefined;
    }
    const [receivable, cash, fee] = await Promise.all([
      this.getOrCreateAccount(ACCOUNTS_RECEIVABLE_ACCOUNT),
      amount.gt(0) ? this.resolveMoneySide(input.money) : Promise.resolve(undefined),
      feeAmount.gt(0) ? this.getOrCreateAccount(CHECK_REJECTION_FEE_ACCOUNT) : Promise.resolve(undefined),
    ]);
    const lines: PostJournalEntryDto['lines'] = [
      { accountId: receivable.id, direction: 'DEBIT', amount: amount.add(feeAmount).toNumber() },
    ];
    if (cash) {
      lines.push({ accountId: cash.id, direction: 'CREDIT', amount: amount.toNumber() });
    }
    if (fee) {
      lines.push({ accountId: fee.id, direction: 'CREDIT', amount: feeAmount.toNumber() });
    }
    return this.createBalancedEntry(`Rechazo de cheque - ${input.checkId}`, lines, {
      date: input.date,
      checkId: input.checkId,
    });
  }

  /**
   * Ajuste posteado al convertir una línea de extracto bancario sin
   * matchear en un movimiento nuevo (ver apps/api's BankReconciliationService.
   * createTransactionFromLine) - un gasto/ingreso bancario real que el
   * extracto reveló y nadie había cargado todavía (comisión, interés).
   * Contra la cuenta contable de la cuenta bancaria del extracto.
   */
  async postBankStatementAdjustmentJournalEntry(
    input: PostBankStatementAdjustmentJournalEntryInput,
  ): Promise<JournalEntryWithLines | undefined> {
    const amount = new Prisma.Decimal(input.amount);
    if (amount.lte(0)) {
      return undefined;
    }
    const [cash, other] = await Promise.all([
      this.moneyAccountFor(input.financialAccountId),
      this.getOrCreateAccount(input.kind === 'EXPENSE' ? BANK_FEES_EXPENSE_ACCOUNT : BANK_INTEREST_INCOME_ACCOUNT),
    ]);
    const lines: PostJournalEntryDto['lines'] =
      input.kind === 'EXPENSE'
        ? [
            { accountId: other.id, direction: 'DEBIT', amount: amount.toNumber() },
            { accountId: cash.id, direction: 'CREDIT', amount: amount.toNumber() },
          ]
        : [
            { accountId: cash.id, direction: 'DEBIT', amount: amount.toNumber() },
            { accountId: other.id, direction: 'CREDIT', amount: amount.toNumber() },
          ];
    return this.createBalancedEntry(
      `${input.kind === 'EXPENSE' ? 'Gasto bancario' : 'Ingreso bancario'} - línea de extracto ${input.bankStatementLineId}`,
      lines,
      { date: input.date, bankStatementLineId: input.bankStatementLineId },
    );
  }

  /**
   * Ajuste posteado al cerrar un turno de Caja/POS con diferencia entre lo
   * contado y lo esperado (ver apps/api's PosService.closeSession, que ya
   * calculó `difference` vía CashSessionsService.closeSession). Mismo molde
   * que postBankStatementAdjustmentJournalEntry: contra la cuenta contable
   * de la cuenta de dinero de esa caja (CashRegister.financialAccountId).
   */
  async postCashSessionAdjustmentJournalEntry(
    input: PostCashSessionAdjustmentJournalEntryInput,
  ): Promise<JournalEntryWithLines | undefined> {
    const difference = new Prisma.Decimal(input.difference);
    if (difference.eq(0)) {
      return undefined;
    }
    const isShortage = difference.lt(0);
    const amount = difference.abs();
    const [cash, other] = await Promise.all([
      this.moneyAccountFor(input.financialAccountId),
      this.getOrCreateAccount(isShortage ? CASH_SHORTAGE_ACCOUNT : CASH_OVERAGE_ACCOUNT),
    ]);
    const lines: PostJournalEntryDto['lines'] = isShortage
      ? [
          { accountId: other.id, direction: 'DEBIT', amount: amount.toNumber() },
          { accountId: cash.id, direction: 'CREDIT', amount: amount.toNumber() },
        ]
      : [
          { accountId: cash.id, direction: 'DEBIT', amount: amount.toNumber() },
          { accountId: other.id, direction: 'CREDIT', amount: amount.toNumber() },
        ];
    return this.createBalancedEntry(
      `${isShortage ? 'Faltante' : 'Sobrante'} de caja - turno ${input.cashSessionId}`,
      lines,
      { date: input.date, cashSessionId: input.cashSessionId },
    );
  }

  /**
   * Ajuste por Inflación (RT6/NC39, Fase 2 - ver apps/api's
   * InflationAdjustmentService.postInflationAdjustment, que ya calculó
   * `recpamAmount` con el método del activo y pasivo monetario neto vía
   * getPreview). Asiento neto de 2 líneas, decisión explícita del usuario:
   * NO reproduce el desglose por cuenta monetaria de la vista previa (eso
   * queda sólo en pantalla) - Resultado (Pérdida o Ganancia según el signo)
   * contra "Ajuste de Capital por Inflación" (Patrimonio). Positivo =
   * pérdida (la posición monetaria neta era activa, erosionada por la
   * inflación): Dr Pérdida / Cr Ajuste de Capital. Negativo = ganancia (la
   * posición neta era pasiva, la deuda se licuó): Dr Ajuste de Capital /
   * Cr Ganancia.
   */
  async postInflationAdjustmentJournalEntry(
    input: PostInflationAdjustmentJournalEntryInput,
  ): Promise<JournalEntryWithLines | undefined> {
    const recpam = new Prisma.Decimal(input.recpamAmount);
    if (recpam.eq(0)) {
      return undefined;
    }
    const isLoss = recpam.gt(0);
    const amount = recpam.abs();
    const [resultAccount, capitalAdjustmentAccount] = await Promise.all([
      this.getOrCreateAccount(isLoss ? INFLATION_LOSS_ACCOUNT : INFLATION_GAIN_ACCOUNT),
      this.getOrCreateAccount(INFLATION_CAPITAL_ADJUSTMENT_ACCOUNT),
    ]);
    const lines: PostJournalEntryDto['lines'] = isLoss
      ? [
          { accountId: resultAccount.id, direction: 'DEBIT', amount: amount.toNumber() },
          { accountId: capitalAdjustmentAccount.id, direction: 'CREDIT', amount: amount.toNumber() },
        ]
      : [
          { accountId: capitalAdjustmentAccount.id, direction: 'DEBIT', amount: amount.toNumber() },
          { accountId: resultAccount.id, direction: 'CREDIT', amount: amount.toNumber() },
        ];
    return this.createBalancedEntry(
      `Ajuste por Inflación (RECPAM) - ${input.inflationAdjustmentId}`,
      lines,
      { date: input.date, inflationAdjustmentId: input.inflationAdjustmentId },
    );
  }

  /**
   * Revaluación de una FinancialAccount en moneda extranjera (ver
   * ReportsFinancialService.revalueFinancialAccount) - la cuenta sigue
   * llevando su propio currentBalance en su moneda, sin cambios; esto sólo
   * ajusta cuánto vale ese saldo en pesos para el balance. Mismo molde que
   * postCashSessionAdjustmentJournalEntry: dos líneas contra la cuenta
   * contable de esa cuenta de dinero. previousRate null/undefined
   * = primera revaluación, sólo fija la base, no hay diferencia posible.
   */
  async postExchangeRateRevaluation(
    input: PostExchangeRateRevaluationInput,
  ): Promise<JournalEntryWithLines | undefined> {
    if (input.previousRate === null || input.previousRate === undefined) {
      return undefined;
    }
    const balance = new Prisma.Decimal(input.currentBalance);
    const previousRate = new Prisma.Decimal(input.previousRate);
    const newRate = new Prisma.Decimal(input.newRate);
    const delta = balance.mul(newRate.sub(previousRate));
    if (delta.eq(0)) {
      return undefined;
    }
    const isGain = delta.gt(0);
    const amount = delta.abs();
    const [cash, result] = await Promise.all([
      this.moneyAccountFor(input.financialAccountId),
      this.getOrCreateAccount(isGain ? EXCHANGE_GAIN_ACCOUNT : EXCHANGE_LOSS_ACCOUNT),
    ]);
    const lines: PostJournalEntryDto['lines'] = isGain
      ? [
          { accountId: cash.id, direction: 'DEBIT', amount: amount.toNumber() },
          { accountId: result.id, direction: 'CREDIT', amount: amount.toNumber() },
        ]
      : [
          { accountId: result.id, direction: 'DEBIT', amount: amount.toNumber() },
          { accountId: cash.id, direction: 'CREDIT', amount: amount.toNumber() },
        ];
    return this.createBalancedEntry(
      `${isGain ? 'Ganancia' : 'Pérdida'} por diferencia de cambio - ${cash.name}`,
      lines,
      { date: input.date },
    );
  }

  /**
   * Posted when a ProductionOrder is completed (ver apps/api's
   * ProductionService.completeOrder, llamado justo después de
   * finishOrder) - traspaso interno de "Mercaderías": Debe Mercaderías por
   * lo producido (outputsCost) / Haber Mercaderías por lo consumido
   * (inputsCost). No cambia el total del activo de inventario cuando
   * ambos coinciden (caso normal hoy), sólo documenta el movimiento contra
   * la orden. Ver PRODUCTION_VARIANCE_LOSS/GAIN_ACCOUNT arriba para el caso
   * defensivo en que no coincidan.
   */
  async postProductionJournalEntry(
    input: PostProductionJournalEntryInput,
  ): Promise<JournalEntryWithLines | undefined> {
    const inputsCost = new Prisma.Decimal(input.inputsCost);
    const outputsCost = new Prisma.Decimal(input.outputsCost);
    if (inputsCost.lte(0) && outputsCost.lte(0)) {
      return undefined;
    }
    const inventory = await this.getOrCreateAccount(INVENTORY_ASSET_ACCOUNT);
    const lines: PostJournalEntryDto['lines'] = [];
    if (outputsCost.gt(0)) {
      lines.push({ accountId: inventory.id, direction: 'DEBIT', amount: outputsCost.toNumber() });
    }
    if (inputsCost.gt(0)) {
      lines.push({ accountId: inventory.id, direction: 'CREDIT', amount: inputsCost.toNumber() });
    }
    const delta = outputsCost.sub(inputsCost);
    if (!delta.eq(0)) {
      const variance = await this.getOrCreateAccount(
        delta.gt(0) ? PRODUCTION_VARIANCE_GAIN_ACCOUNT : PRODUCTION_VARIANCE_LOSS_ACCOUNT,
      );
      lines.push({
        accountId: variance.id,
        direction: delta.gt(0) ? 'CREDIT' : 'DEBIT',
        amount: delta.abs().toNumber(),
      });
    }
    return this.createBalancedEntry(
      `Producción completada - orden ${input.productionOrderId}`,
      lines,
      { date: input.date, productionOrderId: input.productionOrderId },
    );
  }

  /** The only way to correct a posted entry: a new entry with the same
   * lines, DEBIT/CREDIT swapped, linked back via reversalOfId. Never an
   * UPDATE to the original - the DB trigger wouldn't allow it anyway. */
  async createReversingEntry(dto: CreateReversingEntryDto): Promise<JournalEntryWithLines> {
    const db = getTenantDb();
    const tenantId = getTenantId();
    const createdById = getUserId();
    if (!createdById) {
      throw new BadRequestException('An authenticated user is required to post a journal entry');
    }

    const original = await db.journalEntry.findUnique({
      where: { id: dto.originalEntryId },
      include: { lines: true },
    });
    if (!original) {
      throw new NotFoundException('Journal entry not found');
    }

    return db.journalEntry.create({
      data: {
        tenantId,
        description: dto.description ?? `Reversal of: ${original.description}`,
        createdById,
        reversalOfId: original.id,
        lines: {
          createMany: {
            data: original.lines.map((line) => ({
              accountId: line.accountId,
              direction: line.direction === 'DEBIT' ? 'CREDIT' : 'DEBIT',
              amount: line.amount,
            })),
          },
        },
      },
      include: { lines: true },
    });
  }

  /** Net balance per account, using the standard debit/credit-normal sign
   * convention by account type - not a stored figure, always derived from
   * journal_entry_lines so it can never drift from the ledger. `from`/`to`
   * son opcionales e independientes (mismo criterio que
   * ReportsPnlService.getIncomeStatement) - sin ninguno de los dos, el
   * comportamiento es exactamente el de antes (todo el historial). */
  async getTrialBalance(from?: Date, to?: Date): Promise<TrialBalanceRow[]> {
    const db = getTenantDb();
    const accounts = await db.accountingAccount.findMany({ orderBy: { code: 'asc' } });
    const grouped = await db.journalEntryLine.groupBy({
      by: ['accountId', 'direction'],
      where: from || to ? { journalEntry: { date: { gte: from, lte: to } } } : undefined,
      _sum: { amount: true },
    });

    const totalsByAccount = new Map<string, { debit: Prisma.Decimal; credit: Prisma.Decimal }>();
    for (const row of grouped) {
      const entry = totalsByAccount.get(row.accountId) ?? {
        debit: new Prisma.Decimal(0),
        credit: new Prisma.Decimal(0),
      };
      const sum = row._sum.amount ?? new Prisma.Decimal(0);
      if (row.direction === 'DEBIT') {
        entry.debit = entry.debit.add(sum);
      } else {
        entry.credit = entry.credit.add(sum);
      }
      totalsByAccount.set(row.accountId, entry);
    }

    return accounts.map((account) => {
      const totals = totalsByAccount.get(account.id) ?? {
        debit: new Prisma.Decimal(0),
        credit: new Prisma.Decimal(0),
      };
      const balance = isDebitNormal(account.type)
        ? totals.debit.sub(totals.credit)
        : totals.credit.sub(totals.debit);

      return {
        accountId: account.id,
        code: account.code,
        name: account.name,
        type: account.type,
        debitTotal: totals.debit,
        creditTotal: totals.credit,
        balance,
      };
    });
  }

  /** Saldo de cada cuenta a una fecha (exclusive) - "as of", mismo criterio
   * débito/crédito normal que getTrialBalance/getIncomeStatement. Compartido
   * por InflationAdjustmentService (saldo de apertura del período a
   * reexpresar) y por getTrialBalance cuando se le pasa `to` (ver ahí). */
  async getAccountBalancesAsOf(accountIds: string[], asOfDate: Date): Promise<Map<string, Prisma.Decimal>> {
    const db = getTenantDb();
    const accounts = await db.accountingAccount.findMany({ where: { id: { in: accountIds } } });
    const grouped = await db.journalEntryLine.groupBy({
      by: ['accountId', 'direction'],
      where: { accountId: { in: accountIds }, journalEntry: { date: { lt: asOfDate } } },
      _sum: { amount: true },
    });

    const totalsByAccount = new Map<string, { debit: Prisma.Decimal; credit: Prisma.Decimal }>();
    for (const row of grouped) {
      const entry = totalsByAccount.get(row.accountId) ?? {
        debit: new Prisma.Decimal(0),
        credit: new Prisma.Decimal(0),
      };
      const sum = row._sum.amount ?? new Prisma.Decimal(0);
      if (row.direction === 'DEBIT') {
        entry.debit = entry.debit.add(sum);
      } else {
        entry.credit = entry.credit.add(sum);
      }
      totalsByAccount.set(row.accountId, entry);
    }

    const result = new Map<string, Prisma.Decimal>();
    for (const account of accounts) {
      const totals = totalsByAccount.get(account.id) ?? {
        debit: new Prisma.Decimal(0),
        credit: new Prisma.Decimal(0),
      };
      result.set(
        account.id,
        isDebitNormal(account.type) ? totals.debit.sub(totals.credit) : totals.credit.sub(totals.debit),
      );
    }
    return result;
  }

  async getAccountLedger(accountId: string) {
    const db = getTenantDb();
    const account = await db.accountingAccount.findUnique({ where: { id: accountId } });
    if (!account) {
      throw new NotFoundException('Account not found');
    }

    const lines = await db.journalEntryLine.findMany({
      where: { accountId },
      include: { journalEntry: true },
      orderBy: { journalEntry: { date: 'asc' } },
    });

    return { accountId, code: account.code, name: account.name, lines };
  }
}
