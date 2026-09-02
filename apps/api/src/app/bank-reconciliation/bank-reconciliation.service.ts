import { BadRequestException, Injectable } from '@nestjs/common';
import {
  BankReconciliationService as BankReconciliationLibService,
  type BankStatementImportRowError,
} from '@plexo/bank-reconciliation';
import { AccountingService } from '@plexo/accounting';
import { getUserId, type BankStatementLine, type BankStatementLineStatus } from '@plexo/database';
import { ReportsFinancialService } from '@plexo/reports-financial';

const MATCH_WINDOW_DAYS = 3;
const MATCH_WINDOW_MS = MATCH_WINDOW_DAYS * 24 * 60 * 60 * 1000;

export interface ImportStatementResult {
  importId?: string;
  totalLines: number;
  matchedCount: number;
  pendingCount: number;
  errors: BankStatementImportRowError[];
}

/**
 * Composición-root para Conciliación Bancaria: BankReconciliationLibService
 * no puede importar @plexo/reports-financial/@plexo/accounting (regla del
 * repo). Acá vive el algoritmo de matching automático y la generación de
 * asientos por ajustes, igual que TreasuryService compone CheckService con
 * los mismos dos módulos.
 */
@Injectable()
export class BankReconciliationService {
  constructor(
    private readonly bankReconciliationService: BankReconciliationLibService,
    private readonly reportsFinancialService: ReportsFinancialService,
    private readonly accountingService: AccountingService,
  ) {}

  downloadTemplate() {
    return this.bankReconciliationService.generateTemplate();
  }

  /**
   * Parsea+valida el archivo, crea el import (falla si ya se subió el mismo
   * archivo antes para esta cuenta), y corre el matching automático: por
   * cada línea nueva, busca entre las transacciones sin conciliar de la
   * cuenta con el mismo importe exacto dentro de ±3 días. Exactamente un
   * candidato -> auto-match (y se saca del pool para que una segunda línea
   * del mismo archivo no lo reclame también). 0 o 2+ candidatos -> la línea
   * queda PENDING para revisión manual, nunca se adivina.
   */
  async importStatement(
    financialAccountId: string,
    buffer: Buffer,
    fileName: string,
  ): Promise<ImportStatementResult> {
    const { fileHash, lines, errors } = await this.bankReconciliationService.parseAndValidate(buffer);
    if (errors.length > 0) {
      return { totalLines: 0, matchedCount: 0, pendingCount: 0, errors };
    }

    const userId = getUserId();
    if (!userId) {
      throw new BadRequestException('An authenticated user is required to import a bank statement');
    }

    const created = await this.bankReconciliationService.createImport({
      financialAccountId,
      fileName,
      fileHash,
      lines,
      createdByUserId: userId,
    });

    let pool = await this.reportsFinancialService.listUnreconciledTransactions(financialAccountId);
    let matchedCount = 0;

    for (const line of created.lines) {
      const candidates = pool.filter(
        (tx) =>
          tx.amount.toNumber() === line.amount.toNumber() &&
          Math.abs(tx.occurredAt.getTime() - line.lineDate.getTime()) <= MATCH_WINDOW_MS,
      );
      if (candidates.length === 1) {
        const [candidate] = candidates;
        await this.bankReconciliationService.markLineMatched(line.id, candidate.id);
        await this.reportsFinancialService.reconcileTransaction(candidate.id);
        pool = pool.filter((tx) => tx.id !== candidate.id);
        matchedCount++;
      }
    }

    return {
      importId: created.id,
      totalLines: created.lines.length,
      matchedCount,
      pendingCount: created.lines.length - matchedCount,
      errors: [],
    };
  }

  listLines(financialAccountId: string, status?: BankStatementLineStatus): Promise<BankStatementLine[]> {
    return this.bankReconciliationService.listLines(financialAccountId, status);
  }

  listImports(financialAccountId: string) {
    return this.bankReconciliationService.listImports(financialAccountId);
  }

  /** Vincula a mano una línea pendiente a una FinancialTransaction ya
   * existente (elegida por el usuario entre las sin conciliar de la
   * cuenta) - no postea ningún asiento nuevo, esa transacción ya tenía o
   * no el suyo desde que se creó. */
  async linkLineToTransaction(lineId: string, transactionId: string) {
    await this.reportsFinancialService.reconcileTransaction(transactionId);
    return this.bankReconciliationService.markLineMatched(lineId, transactionId);
  }

  /** Convierte una línea pendiente sin match en un movimiento nuevo (un
   * gasto/ingreso bancario real que el extracto reveló y nadie había
   * cargado) - crea la FinancialTransaction (ya conciliada, nace del
   * banco) y postea el asiento contable correspondiente. */
  async createTransactionFromLine(
    lineId: string,
    dto: { kind: 'EXPENSE' | 'INCOME'; description?: string },
  ) {
    const line = await this.bankReconciliationService.getLine(lineId);
    if (line.status !== 'PENDING') {
      throw new BadRequestException(`No se puede crear un movimiento desde una línea en estado ${line.status}`);
    }
    const amount = line.amount.toNumber();
    if (dto.kind === 'EXPENSE' && amount >= 0) {
      throw new BadRequestException('Gasto bancario sólo aplica a una línea de importe negativo (egreso)');
    }
    if (dto.kind === 'INCOME' && amount <= 0) {
      throw new BadRequestException('Ingreso bancario sólo aplica a una línea de importe positivo (ingreso)');
    }

    const transaction = await this.reportsFinancialService.recordFinancialTransaction({
      financialAccountId: line.financialAccountId,
      amount,
      occurredAt: line.lineDate.toISOString(),
      externalRef: dto.description ?? line.description,
    });
    // Nace del banco - ya está conciliada por definición, mismo criterio
    // que el auto-match en importStatement().
    await this.reportsFinancialService.reconcileTransaction(transaction.id);
    const journalEntry = await this.accountingService.postBankStatementAdjustmentJournalEntry({
      bankStatementLineId: line.id,
      kind: dto.kind,
      amount: Math.abs(amount),
      date: line.lineDate,
    });
    await this.bankReconciliationService.markLineMatched(lineId, transaction.id);

    return { transaction, journalEntry };
  }

  ignoreLine(lineId: string) {
    return this.bankReconciliationService.markLineIgnored(lineId);
  }
}
