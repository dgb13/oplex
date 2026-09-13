import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AccountingService } from '@plexo/accounting';
import { getTenantDb, getUserId, Prisma } from '@plexo/database';
import { InventoryService } from '@plexo/inventory';
import { InvoicingService, type CreateCreditNoteDto, type RecordReceiptDto } from '@plexo/invoicing';
import { QuoteService } from '@plexo/quotes';
import { ReportsFinancialService } from '@plexo/reports-financial';
import { resolveEmailFrom, TenantSettingsService } from '@plexo/tenant-settings';
import { CheckService } from '@plexo/treasury';
import type { CreateInvoiceFromQuoteDto } from './dto/create-invoice-from-quote.dto.js';
import type { CreateSaleDto } from './dto/create-sale.dto.js';

/**
 * Composes InvoicingService + InventoryService + AccountingService for
 * what none of them owns alone: "issuing an invoice also moves stock and
 * posts the sale to the general ledger". Living here (not inside any of
 * those module libs) keeps them decoupled - if a second caller ever needs
 * the same composition, that's the signal to extract it behind a shared
 * port instead of duplicating this.
 *
 * Atomicity for all three writes comes for free: every service involved
 * reads/writes through getTenantDb(), which is the same per-request
 * transaction TenantContextInterceptor already opened - if any step
 * throws (insufficient stock, an unbalanced entry), the whole transaction
 * rolls back, including the invoice/lines created above it.
 */
@Injectable()
export class SalesService {
  constructor(
    private readonly invoicingService: InvoicingService,
    private readonly inventoryService: InventoryService,
    private readonly accountingService: AccountingService,
    private readonly reportsFinancialService: ReportsFinancialService,
    private readonly quoteService: QuoteService,
    private readonly tenantSettingsService: TenantSettingsService,
    private readonly checkService: CheckService,
  ) {}

  async createSale(dto: CreateSaleDto) {
    const branch = await getTenantDb().company.findUnique({
      where: { id: dto.branchId },
      include: { roles: true },
    });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }
    if (!branch.active) {
      throw new BadRequestException('This branch is inactive');
    }
    if (!branch.roles.some((r) => r.role === 'BRANCH')) {
      throw new BadRequestException('This company is not flagged as a branch');
    }
    if (!branch.pointOfSaleNumber) {
      throw new BadRequestException('Branch has no pointOfSaleNumber configured');
    }

    const settings = await this.tenantSettingsService.getSettings();
    const invoice = await this.invoicingService.createInvoice(
      {
        customerId: dto.customerId,
        documentLetter: dto.documentLetter,
        pointOfSale: branch.pointOfSaleNumber,
        currencyId: dto.currencyId,
        exchangeRate: dto.exchangeRate,
        globalDiscountPercent: dto.globalDiscountPercent,
        dueDate: dto.dueDate,
        pricesIncludeTax: dto.pricesIncludeTax,
        lines: dto.lines,
        otherTaxLines: dto.otherTaxLines,
      },
      resolveEmailFrom(settings),
    );

    // Inventory has to run before accounting now (used to be the other way
    // around): the COGS lines below need each SALE_OUT movement's stamped
    // unitCost (the weighted-average cost consumed at that moment), which
    // only exists once recordMovement() has run.
    let totalCogs = new Prisma.Decimal(0);
    for (const line of invoice.lines) {
      const movement = await this.inventoryService.recordMovement({
        warehouseId: dto.warehouseId,
        articleVariantId: line.articleVariantId,
        type: 'SALE_OUT',
        quantity: line.quantity.toNumber(),
        invoiceId: invoice.id,
        invoiceLineId: line.id,
        sourceType: 'INVOICE',
        sourceId: invoice.id,
      });
      if (movement.unitCost != null) {
        totalCogs = totalCogs.add(new Prisma.Decimal(movement.unitCost).mul(line.quantity));
      }
    }

    // El asiento contable es un libro de una sola moneda (el balance de
    // sumas y saldos no tiene sentido mezclando pesos con dólares crudos) -
    // se convierte al equivalente en la moneda base multiplicando por
    // exchangeRate (1 para la moneda base misma, no-op para todo lo que ya
    // factura en ARS). cogsAmount NO se convierte: viene del costo de
    // inventario, que siempre está en ARS sin importar en qué moneda se
    // facturó la venta.
    const otherTaxesTotal = invoice.taxLines.reduce((sum, line) => sum.add(line.amount), new Prisma.Decimal(0));
    await this.accountingService.postInvoiceJournalEntry({
      invoiceId: invoice.id,
      subtotal: invoice.subtotal.mul(invoice.exchangeRate),
      taxTotal: invoice.taxTotal.mul(invoice.exchangeRate),
      total: invoice.total.mul(invoice.exchangeRate),
      date: invoice.issueDate,
      cogsAmount: totalCogs,
      otherTaxesTotal: otherTaxesTotal.mul(invoice.exchangeRate),
    });

    return invoice;
  }

  /**
   * Composes InvoicingService.createCreditNote + its own journal entry +
   * a stock restock, same transaction/atomicity story as createSale(). This
   * is the only place a credit note gets created (InvoicingController no
   * longer exposes its own POST /invoicing/credit-notes) specifically so
   * there's no path that credits an invoice without also posting the
   * matching entry and restocking - see the recordMovement() doc comment
   * in InventoryService for why the analogous "SALE_OUT without an
   * invoice" gap was left as a manual step instead: there, the caller has
   * no journal entry/stock movement to correct in the first place. Here it
   * does, so there's no excuse not to close the loop.
   *
   * Credit notes are per-line/per-quantity now (createCreditNote enforces
   * a line never gets credited past its original quantity, across every
   * credit note ever issued against the invoice) - crediting every line's
   * full quantity in one call reproduces what used to be the only option
   * ("full reversal"), same code path, nothing special-cased for it.
   *
   * Restock/COGS per credited line reads back the ORIGINAL SALE_OUT
   * StockMovement by invoiceLineId (for warehouseId + the unitCost it was
   * sold at) instead of re-deriving them from the invoice - the invoice
   * itself doesn't know which warehouse a line came out of, only the
   * movement does. A line with no matching original movement (e.g. a
   * future non-stock/service line) is skipped for both restock and COGS -
   * never blocks the credit note, never fabricates a cost.
   */
  async voidSale(dto: CreateCreditNoteDto) {
    const creditNote = await this.invoicingService.createCreditNote(dto);

    const db = getTenantDb();
    const restocks: {
      creditNoteLineId: string;
      warehouseId: string;
      articleVariantId: string;
      invoiceLineId: string;
      quantity: Prisma.Decimal;
      unitCost: Prisma.Decimal | null;
    }[] = [];
    let totalCogs = new Prisma.Decimal(0);

    for (const creditNoteLine of creditNote.lines) {
      const original = await db.stockMovement.findFirst({
        where: { invoiceLineId: creditNoteLine.invoiceLineId, type: 'SALE_OUT' },
      });
      if (!original) {
        continue;
      }
      restocks.push({
        creditNoteLineId: creditNoteLine.id,
        warehouseId: original.warehouseId,
        articleVariantId: original.articleVariantId,
        invoiceLineId: creditNoteLine.invoiceLineId,
        quantity: creditNoteLine.quantity,
        unitCost: original.unitCost,
      });
      if (original.unitCost != null) {
        totalCogs = totalCogs.add(original.unitCost.mul(creditNoteLine.quantity));
      }
    }

    // Misma conversión que createSale - ver ese comentario.
    await this.accountingService.postCreditNoteJournalEntry({
      creditNoteId: creditNote.id,
      invoiceId: dto.invoiceId,
      subtotal: creditNote.subtotal.mul(creditNote.exchangeRate),
      taxTotal: creditNote.taxTotal.mul(creditNote.exchangeRate),
      total: creditNote.total.mul(creditNote.exchangeRate),
      date: creditNote.issueDate,
      cogsAmount: totalCogs,
    });

    for (const restock of restocks) {
      await this.inventoryService.recordMovement({
        warehouseId: restock.warehouseId,
        articleVariantId: restock.articleVariantId,
        type: 'RETURN',
        quantity: restock.quantity.toNumber(),
        // Re-weights the returned stock back in at the cost it was sold
        // at, so the average doesn't just silently drop the cost trail -
        // undefined (not 0) when the original sale had no cost basis, so
        // recordMovement leaves the average untouched rather than
        // polluting it with a fabricated zero cost.
        unitCost: restock.unitCost != null ? restock.unitCost.toNumber() : undefined,
        invoiceId: dto.invoiceId,
        invoiceLineId: restock.invoiceLineId,
        sourceType: 'CREDIT_NOTE',
        sourceId: creditNote.id,
      });
    }

    return creditNote;
  }

  /**
   * Composes InvoicingService.recordReceipt + its journal entry, same
   * atomicity story as createSale/voidSale. This is the only place a
   * receipt gets created (InvoicingController no longer exposes its own
   * POST /invoicing/receipts) so there's no path that collects a payment
   * without also crediting Deudores por Ventas - see
   * AccountingService.postReceiptJournalEntry.
   */
  async recordReceipt(dto: RecordReceiptDto) {
    const receipt = await this.invoicingService.recordReceipt(dto);
    await this.accountingService.postReceiptJournalEntry({
      receiptId: receipt.id,
      amount: receipt.amount,
      date: receipt.paidAt,
    });

    // Cierra el gap que pos.service.spec.ts documenta para POS: fuera de
    // Cheques/Conciliación Bancaria/POS, nada movía
    // FinancialAccount.currentBalance todavía - este Receipt es "cash" en
    // los términos contables de arriba, así que también tiene que
    // acreditar la cuenta elegida. Un cheque de tercero es la única
    // excepción real: no afecta el saldo hasta depositarlo (ver
    // apps/api/src/app/treasury/) - eso es a propósito, ver el comentario
    // en CheckService.
    if (dto.financialAccountId && !dto.check) {
      const account = await getTenantDb().financialAccount.findUnique({
        where: { id: dto.financialAccountId },
      });
      if (!account) {
        throw new NotFoundException('Financial account not found');
      }
      const invoice = await getTenantDb().invoice.findUnique({
        where: { id: dto.invoiceId },
        include: { currency: true },
      });
      if (account.currencyId && invoice && account.currencyId !== invoice.currencyId) {
        throw new BadRequestException(
          `Esta cuenta está en otra moneda que la factura (factura en ${invoice.currency.code})`,
        );
      }
      await this.reportsFinancialService.recordFinancialTransaction({
        financialAccountId: dto.financialAccountId,
        amount: receipt.amount.toNumber(),
        externalRef: `Cobro factura ${dto.invoiceId}`,
      });
    }

    // Un cheque de tercero siempre nace de un Recibo (ver
    // CheckService.registerThirdPartyCheck) - si el DTO trae el detalle,
    // lo registramos en Cartera en la misma transacción. No afecta
    // FinancialAccount.currentBalance todavía (recién al depositarlo, ver
    // apps/api/src/app/treasury/) ni el asiento de arriba, que ya trató
    // este cobro como "cash" igual que cualquier otro método - eso es a
    // propósito, ver el comentario en CheckService.
    if (dto.check) {
      const userId = getUserId();
      if (!userId) {
        throw new BadRequestException('An authenticated user is required to record a check');
      }
      const invoice = await getTenantDb().invoice.findUnique({
        where: { id: dto.invoiceId },
        select: { customerId: true },
      });
      await this.checkService.registerThirdPartyCheck({
        receiptId: receipt.id,
        customerId: invoice?.customerId ?? null,
        amount: receipt.amount.toNumber(),
        number: dto.check.number,
        bankName: dto.check.bankName,
        drawerCuit: dto.check.drawerCuit,
        format: dto.check.format,
        issueDate: new Date(dto.check.issueDate),
        dueDate: new Date(dto.check.dueDate),
        createdByUserId: userId,
      });
    }

    return receipt;
  }

  /**
   * "Convertir a factura" desde el panel de detalle de una Cotización
   * (Ventas → Cotizaciones) - hoy no existía ningún vínculo entre ambos
   * documentos, así que pasar de una cotización en USD a la factura en
   * pesos era 100% manual (ver PROGRESS.md/memoria de esta sesión). Delega
   * en createSale tal cual (mismo stock/asiento contable que una venta
   * directa) en vez de duplicar esa orquestación - sólo arma el
   * CreateSaleDto a partir de la Cotización, convirtiendo cada línea a la
   * moneda base del tenant si la cotización no está ya en esa moneda.
   */
  async createInvoiceFromQuote(quoteId: string, dto: CreateInvoiceFromQuoteDto) {
    const quote = await this.quoteService.get(quoteId);
    if (quote.status !== 'ACCEPTED') {
      throw new BadRequestException('Sólo se puede facturar una cotización aceptada');
    }

    const db = getTenantDb();
    const existing = await db.invoice.findFirst({ where: { quoteId } });
    if (existing) {
      throw new BadRequestException(`Esta cotización ya fue facturada (${existing.number})`);
    }

    const baseCurrency = await db.currency.findFirst({ where: { isBase: true } });
    if (!baseCurrency) {
      throw new BadRequestException('Este tenant todavía no tiene una moneda base configurada');
    }

    let factor = new Prisma.Decimal(1);
    if (!quote.currency.isBase) {
      const latestRate = await db.exchangeRateHistory.findFirst({
        where: { currencyId: quote.currencyId },
        orderBy: { effectiveAt: 'desc' },
      });
      if (!latestRate) {
        throw new BadRequestException(
          `Cargá una cotización para ${quote.currency.code} en Preferencias antes de convertir esta cotización`,
        );
      }
      factor = latestRate.rate;
    }

    const invoice = await this.createSale({
      customerId: quote.customerId,
      warehouseId: dto.warehouseId,
      documentLetter: dto.documentLetter,
      branchId: dto.branchId,
      currencyId: baseCurrency.id,
      exchangeRate: factor.toNumber(),
      globalDiscountPercent: dto.globalDiscountPercent,
      dueDate: dto.dueDate,
      pricesIncludeTax: dto.pricesIncludeTax,
      lines: quote.lines.map((line) => ({
        articleVariantId: line.articleVariantId,
        quantity: line.quantity.toNumber(),
        unitPrice: line.unitPrice.mul(factor).toNumber(),
      })),
    });

    await db.invoice.update({ where: { id: invoice.id }, data: { quoteId } });

    return invoice;
  }
}
