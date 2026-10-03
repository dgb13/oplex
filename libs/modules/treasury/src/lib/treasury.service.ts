import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { getTenantDb, getTenantId, type Check, type CheckStatus } from '@plexo/database';

export interface CheckFilters {
  status?: CheckStatus;
  kind?: 'THIRD_PARTY' | 'OWN';
  bankName?: string;
  dueFrom?: Date;
  dueTo?: Date;
}

export interface RegisterThirdPartyCheckData {
  receiptId: string;
  customerId: string | null;
  amount: number;
  number: string;
  bankName: string;
  drawerCuit?: string;
  format?: 'PHYSICAL' | 'ECHEQ';
  issueDate: Date;
  dueDate: Date;
  createdByUserId: string;
}

export interface IssueOwnCheckData {
  supplierPaymentId: string;
  supplierId: string | null;
  amount: number;
  number: string;
  bankName: string;
  format?: 'PHYSICAL' | 'ECHEQ';
  issueDate: Date;
  dueDate: Date;
  financialAccountId?: string;
  createdByUserId: string;
}

export interface RejectCheckResult {
  check: Check;
  /** Si estaba DEPOSITED, la composición-root tiene que revertir el
   * FinancialTransaction que sumó este monto a la cuenta - un cheque
   * todavía en PORTFOLIO o ya ENDORSED nunca tocó una FinancialAccount, no
   * hay nada que revertir ahí. */
  wasDeposited: boolean;
  /** Dónde estaba el cheque al rebotar - decide qué cuenta se acredita en
   * el asiento del rechazo (cartera, el banco, o Proveedores si se endosó). */
  previousStatus: 'PORTFOLIO' | 'DEPOSITED' | 'ENDORSED';
}

/**
 * Nunca importa @plexo/invoicing/@plexo/purchases/@plexo/accounting/
 * @plexo/reports-financial (regla del repo: un lib module nunca importa el
 * Service de otro) - sólo getTenantDb(). Reabrir el saldo del cliente,
 * postear el asiento reversor, y mover el saldo de una FinancialAccount
 * son responsabilidad de la composición-root en apps/api (ver
 * apps/api/src/app/treasury/), igual que PurchaseInvoicesService/
 * SalesService ya componen sus propios lib modules + AccountingService.
 */
@Injectable()
export class CheckService {
  async listChecks(filters: CheckFilters = {}): Promise<Check[]> {
    const db = getTenantDb();
    return db.check.findMany({
      where: {
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.kind ? { kind: filters.kind } : {}),
        ...(filters.bankName ? { bankName: { contains: filters.bankName, mode: 'insensitive' } } : {}),
        ...(filters.dueFrom || filters.dueTo
          ? { dueDate: { gte: filters.dueFrom, lte: filters.dueTo } }
          : {}),
      },
      orderBy: { dueDate: 'asc' },
    });
  }

  async getCheck(id: string): Promise<Check> {
    const check = await getTenantDb().check.findUnique({ where: { id } });
    if (!check) {
      throw new NotFoundException('Check not found');
    }
    return check;
  }

  /** Un cheque de tercero siempre nace de un Recibo - no hay endpoint
   * público para esto, sólo lo llama la composición-root de Ventas
   * (apps/api's SalesService.recordReceipt) en la misma transacción que
   * crea el Receipt. */
  async registerThirdPartyCheck(data: RegisterThirdPartyCheckData): Promise<Check> {
    return getTenantDb().check.create({
      data: {
        tenantId: getTenantId(),
        kind: 'THIRD_PARTY',
        format: data.format ?? 'PHYSICAL',
        number: data.number,
        bankName: data.bankName,
        drawerCuit: data.drawerCuit,
        amount: data.amount,
        issueDate: data.issueDate,
        dueDate: data.dueDate,
        status: 'PORTFOLIO',
        customerId: data.customerId,
        receiptId: data.receiptId,
        createdByUserId: data.createdByUserId,
      },
    });
  }

  /** PORTFOLIO -> DEPOSITED. La composición-root es quien acredita el
   * monto en `financialAccountId` (ver CheckService no importa
   * ReportsFinancialService). */
  async depositCheck(checkId: string, financialAccountId: string): Promise<Check> {
    const check = await this.getCheck(checkId);
    if (check.kind !== 'THIRD_PARTY') {
      throw new BadRequestException('Sólo se pueden depositar cheques de terceros');
    }
    if (check.status !== 'PORTFOLIO') {
      throw new BadRequestException(`No se puede depositar un cheque en estado ${check.status}`);
    }
    return getTenantDb().check.update({
      where: { id: checkId },
      data: { status: 'DEPOSITED', financialAccountId },
    });
  }

  /** PORTFOLIO|DEPOSITED -> ENDORSED, al pagarle a un proveedor con este
   * cheque en vez de efectivo. */
  async endorseCheck(checkId: string, supplierPaymentId: string, supplierId: string | null): Promise<Check> {
    const check = await this.getCheck(checkId);
    if (check.kind !== 'THIRD_PARTY') {
      throw new BadRequestException('Sólo se pueden endosar cheques de terceros');
    }
    if (check.status !== 'PORTFOLIO' && check.status !== 'DEPOSITED') {
      throw new BadRequestException(`No se puede endosar un cheque en estado ${check.status}`);
    }
    return getTenantDb().check.update({
      where: { id: checkId },
      data: { status: 'ENDORSED', supplierPaymentId, supplierId },
    });
  }

  /** Emite un cheque propio diferido para cancelar un Pago a proveedor. */
  async issueOwnCheck(data: IssueOwnCheckData): Promise<Check> {
    return getTenantDb().check.create({
      data: {
        tenantId: getTenantId(),
        kind: 'OWN',
        format: data.format ?? 'PHYSICAL',
        number: data.number,
        bankName: data.bankName,
        amount: data.amount,
        issueDate: data.issueDate,
        dueDate: data.dueDate,
        status: 'ISSUED',
        supplierId: data.supplierId,
        supplierPaymentId: data.supplierPaymentId,
        financialAccountId: data.financialAccountId,
        createdByUserId: data.createdByUserId,
      },
    });
  }

  /** DEPOSITED -> CLEARED (tercero, ya se había acreditado al depositar,
   * esto sólo confirma que no rebotó) o ISSUED -> CLEARED (propio, recién
   * acá se paga de verdad - la composición-root debita `financialAccountId`,
   * que debe estar cargado). */
  async markCleared(checkId: string): Promise<Check> {
    const check = await this.getCheck(checkId);
    const fromStatus = check.kind === 'THIRD_PARTY' ? 'DEPOSITED' : 'ISSUED';
    if (check.status !== fromStatus) {
      throw new BadRequestException(`No se puede acreditar un cheque en estado ${check.status}`);
    }
    if (check.kind === 'OWN' && !check.financialAccountId) {
      throw new BadRequestException('El cheque propio necesita una cuenta bancaria asignada antes de acreditarse');
    }
    return getTenantDb().check.update({ where: { id: checkId }, data: { status: 'CLEARED' } });
  }

  /** PORTFOLIO|DEPOSITED|ENDORSED -> REJECTED (sólo terceros - un cheque
   * propio no "rebota" en este modelo, ver CheckStatus). Devuelve si había
   * que revertir un depósito para que la composición-root sepa si tiene
   * que tocar una FinancialAccount. */
  async rejectCheck(
    checkId: string,
    data: { reason: string; feeAmount?: number },
  ): Promise<RejectCheckResult> {
    const check = await this.getCheck(checkId);
    if (check.kind !== 'THIRD_PARTY') {
      throw new BadRequestException('Sólo un cheque de tercero puede rechazarse');
    }
    if (check.status !== 'PORTFOLIO' && check.status !== 'DEPOSITED' && check.status !== 'ENDORSED') {
      throw new BadRequestException(`No se puede rechazar un cheque en estado ${check.status}`);
    }
    const previousStatus = check.status;
    const wasDeposited = previousStatus === 'DEPOSITED';
    const updated = await getTenantDb().check.update({
      where: { id: checkId },
      data: {
        status: 'REJECTED',
        rejectionReason: data.reason,
        rejectionFeeAmount: data.feeAmount,
        rejectedAt: new Date(),
      },
    });
    return { check: updated, wasDeposited, previousStatus };
  }
}
