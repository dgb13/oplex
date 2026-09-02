import { BadRequestException, Injectable } from '@nestjs/common';
import { getTenantDb, isDebitNormal, Prisma, type AccountType } from '@plexo/database';
import { AccountingService } from './accounting.service.js';
import { PriceIndexService } from './price-index.service.js';

function addMonthUTC(period: Date): Date {
  return new Date(Date.UTC(period.getUTCFullYear(), period.getUTCMonth() + 1, 1));
}

function monthStartUTC(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function isMonthStart(date: Date): boolean {
  return date.getTime() === monthStartUTC(date).getTime();
}

// Sólo el balance patrimonial participa de la posición monetaria neta -
// INCOME/EXPENSE se ignoran aunque tengan isMonetary=true (el flag queda
// inerte ahí, ver AccountingAccount.isMonetary en schema.prisma).
const MONETARY_TYPES: AccountType[] = ['ASSET', 'LIABILITY', 'EQUITY'];

export interface InflationAdjustmentAccountRow {
  accountId: string;
  code: string;
  name: string;
  type: AccountType;
  openingBalance: Prisma.Decimal;
  movementsNominal: Prisma.Decimal;
  closingBalanceNominal: Prisma.Decimal;
  closingBalanceReexpressed: Prisma.Decimal;
  /** Aporte de esta cuenta al RECPAM total (mismo signo que `recpam`). */
  contribution: Prisma.Decimal;
}

export interface InflationAdjustmentPreview {
  from: Date;
  to: Date;
  rows: InflationAdjustmentAccountRow[];
  /** Positivo = pérdida (posición monetaria neta activa, erosionada por la
   * inflación) - EXPENSE. Negativo = ganancia (posición neta pasiva, la
   * deuda se licuó) - INCOME. */
  recpam: Prisma.Decimal;
}

/**
 * Método del activo y pasivo monetario neto (RT6/NC39). Reexpresa la
 * apertura de cada cuenta monetaria (valuada al nivel de precios de `from`)
 * más cada movimiento posterior (valuado al nivel de precios de su propio
 * mes) a moneda de cierre (`to`); el RECPAM es la diferencia contra el
 * saldo nominal. Nunca escribe en journal_entries - sólo calcula (ver
 * apps/api's futuro postInflationAdjustment, Fase 2).
 */
@Injectable()
export class InflationAdjustmentService {
  constructor(
    private readonly accountingService: AccountingService,
    private readonly priceIndexService: PriceIndexService,
  ) {}

  async getPreview(from: Date, to: Date): Promise<InflationAdjustmentPreview> {
    if (!isMonthStart(from) || !isMonthStart(to)) {
      throw new BadRequestException('El período de reexpresión debe empezar el primer día de un mes (from y to)');
    }
    if (from > to) {
      throw new BadRequestException('"from" no puede ser posterior a "to"');
    }

    const db = getTenantDb();
    const accounts = await db.accountingAccount.findMany({
      where: { isMonetary: true, type: { in: MONETARY_TYPES } },
      orderBy: { code: 'asc' },
    });
    if (accounts.length === 0) {
      return { from, to, rows: [], recpam: new Prisma.Decimal(0) };
    }
    const accountIds = accounts.map((a) => a.id);
    const accountById = new Map(accounts.map((a) => [a.id, a]));

    const toExclusive = addMonthUTC(to);
    const [openingBalances, lines, resolveCoefficient] = await Promise.all([
      this.accountingService.getAccountBalancesAsOf(accountIds, from),
      db.journalEntryLine.findMany({
        where: { accountId: { in: accountIds }, journalEntry: { date: { gte: from, lt: toExclusive } } },
        select: { accountId: true, direction: true, amount: true, journalEntry: { select: { date: true } } },
      }),
      this.priceIndexService.getCoefficientResolver(from, to),
    ]);

    // Movimientos netos (signo débito/crédito-normal por cuenta) agrupados
    // por mes - cada mes se reexpresa con su propio coeficiente.
    const movementsByAccountMonth = new Map<string, Map<number, Prisma.Decimal>>();
    for (const line of lines) {
      const account = accountById.get(line.accountId);
      if (!account) continue;
      const month = monthStartUTC(line.journalEntry.date).getTime();
      const debitNormal = isDebitNormal(account.type);
      const signed =
        (debitNormal && line.direction === 'DEBIT') || (!debitNormal && line.direction === 'CREDIT')
          ? line.amount
          : line.amount.neg();
      const perMonth = movementsByAccountMonth.get(line.accountId) ?? new Map<number, Prisma.Decimal>();
      perMonth.set(month, (perMonth.get(month) ?? new Prisma.Decimal(0)).add(signed));
      movementsByAccountMonth.set(line.accountId, perMonth);
    }

    const openingCoefficient = resolveCoefficient(from);
    const rows: InflationAdjustmentAccountRow[] = [];
    let recpam = new Prisma.Decimal(0);

    for (const account of accounts) {
      const opening = openingBalances.get(account.id) ?? new Prisma.Decimal(0);
      const assetSign = isDebitNormal(account.type) ? 1 : -1;

      let movementsNominal = new Prisma.Decimal(0);
      let movementsReexpressed = new Prisma.Decimal(0);
      const perMonth = movementsByAccountMonth.get(account.id) ?? new Map<number, Prisma.Decimal>();
      for (const [monthMs, amount] of perMonth) {
        movementsNominal = movementsNominal.add(amount);
        movementsReexpressed = movementsReexpressed.add(amount.mul(resolveCoefficient(new Date(monthMs))));
      }

      const closingBalanceNominal = opening.add(movementsNominal);
      const closingBalanceReexpressed = opening.mul(openingCoefficient).add(movementsReexpressed);
      const contribution = closingBalanceReexpressed.sub(closingBalanceNominal).mul(assetSign);
      recpam = recpam.add(contribution);

      rows.push({
        accountId: account.id,
        code: account.code,
        name: account.name,
        type: account.type,
        openingBalance: opening,
        movementsNominal,
        closingBalanceNominal,
        closingBalanceReexpressed,
        contribution,
      });
    }

    return { from, to, rows, recpam };
  }
}
