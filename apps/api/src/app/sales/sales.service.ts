import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AccountingService } from '@plexo/accounting';
import { getOrCreateSystemFinancialAccount, getTenantDb, getTenantId, getUserId, notify, Prisma, userIdsWithRoles } from '@plexo/database';
import { getReservedQuantity, InventoryService } from '@plexo/inventory';
import { InvoicingService, type CreateCreditNoteDto, type RecordReceiptDto } from '@plexo/invoicing';
import { QuoteService } from '@plexo/quotes';
import { ReportsFinancialService } from '@plexo/reports-financial';
import { resolveEmailFrom, TenantSettingsService } from '@plexo/tenant-settings';
import { CheckService } from '@plexo/treasury';
import type { CreateInvoiceFromQuoteDto } from './dto/create-invoice-from-quote.dto.js';
import type { CreateSaleDto } from './dto/create-sale.dto.js';
import type { StockCheckDto } from './dto/stock-check.dto.js';

// Quienes manejan el depósito o venden - ven el aviso de entrega pendiente.
const PENDING_DELIVERY_ROLES = ['OWNER', 'ADMIN', 'SALES', 'INVENTORY'] as const;
const QTY = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 3 });

export interface StockShortage {
  articleVariantId: string;
  articleName: string;
  requested: number;
  available: number;
  deliverNow: number;
  pending: number;
}

export interface PendingDeliveryRow {
  id: string;
  invoiceId: string;
  invoiceLabel: string;
  issueDate: string;
  customerName: string;
  articleName: string;
  sku: string;
  warehouseName: string;
  quantityOrdered: number;
  quantityPending: number;
  availableNow: number;
}

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
    // Un servicio (Article.isService) no tiene stock: no genera SALE_OUT ni
    // costo de mercadería vendida. voidSale ya contempla la línea sin
    // movimiento original (no repone ni toca el CMV).
    const serviceVariantIds = new Set(
      (
        await getTenantDb().articleVariant.findMany({
          where: { id: { in: invoice.lines.map((l) => l.articleVariantId) }, article: { isService: true } },
          select: { id: true },
        })
      ).map((v) => v.id),
    );
    // Con allowPendingDelivery (Nueva factura / Convertir a factura, después
    // del aviso), lo que falta en el depósito queda en PendingDelivery y no
    // se descuenta: sale recién con "Entregar" (deliverPending). Sin la
    // opción, recordMovement rechaza la falta de stock como siempre.
    const db = getTenantDb();
    const pendingCreated: { articleVariantId: string; quantity: Prisma.Decimal }[] = [];
    let totalCogs = new Prisma.Decimal(0);
    for (const line of invoice.lines) {
      if (serviceVariantIds.has(line.articleVariantId)) continue;
      let deliverNow = line.quantity;
      if (dto.allowPendingDelivery) {
        const available = await this.availableStock(dto.warehouseId, line.articleVariantId);
        if (available.lt(line.quantity)) {
          deliverNow = Prisma.Decimal.max(available, 0);
          const pending = line.quantity.sub(deliverNow);
          await db.pendingDelivery.create({
            data: {
              tenantId: getTenantId(),
              invoiceId: invoice.id,
              invoiceLineId: line.id,
              articleVariantId: line.articleVariantId,
              warehouseId: dto.warehouseId,
              quantityOrdered: pending,
              quantityPending: pending,
            },
          });
          pendingCreated.push({ articleVariantId: line.articleVariantId, quantity: pending });
        }
      }
      if (deliverNow.lte(0)) continue;
      const movement = await this.inventoryService.recordMovement({
        warehouseId: dto.warehouseId,
        articleVariantId: line.articleVariantId,
        type: 'SALE_OUT',
        quantity: deliverNow.toNumber(),
        invoiceId: invoice.id,
        invoiceLineId: line.id,
        sourceType: 'INVOICE',
        sourceId: invoice.id,
      });
      if (movement.unitCost != null) {
        totalCogs = totalCogs.add(new Prisma.Decimal(movement.unitCost).mul(deliverNow));
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

    if (pendingCreated.length > 0) {
      await this.notifyPendingDelivery(invoice, pendingCreated);
    }

    return invoice;
  }

  /** Disponible para vender en un depósito: físico menos lo reservado para
   * producción (mismo criterio que InventoryService.recordMovement). */
  private async availableStock(warehouseId: string, articleVariantId: string): Promise<Prisma.Decimal> {
    const db = getTenantDb();
    const ledger = await db.stockLedger.findUnique({
      where: { warehouseId_articleVariantId: { warehouseId, articleVariantId } },
      select: { quantity: true },
    });
    const reserved = await getReservedQuantity(db, { warehouseId, articleVariantId });
    return (ledger?.quantity ?? new Prisma.Decimal(0)).sub(reserved);
  }

  private async notifyPendingDelivery(
    invoice: { documentLetter: string; pointOfSale: string; number: string; customerName: string | null },
    pending: { articleVariantId: string; quantity: Prisma.Decimal }[],
  ): Promise<void> {
    const variants = await getTenantDb().articleVariant.findMany({
      where: { id: { in: pending.map((p) => p.articleVariantId) } },
      select: { id: true, article: { select: { name: true } } },
    });
    const name = (id: string) => variants.find((v) => v.id === id)?.article.name ?? 'Un artículo';
    const detail = pending.map((p) => `${name(p.articleVariantId)} (${QTY.format(p.quantity.toNumber())})`).join(', ');
    await notify({
      recipientUserIds: await userIdsWithRoles([...PENDING_DELIVERY_ROLES]),
      category: 'SALES',
      type: 'sales.pending_delivery',
      preference: 'sales.pending_delivery',
      message: `**Factura ${invoice.documentLetter} ${invoice.pointOfSale}-${invoice.number}** quedó con entrega pendiente para ${invoice.customerName ?? 'el cliente'}: ${detail}`,
      link: '/sales/pending-deliveries',
    });
  }

  /** Antes de emitir (Nueva factura / Convertir a factura): qué líneas no
   * alcanzan con el stock del depósito. Los servicios no cuentan. */
  async checkStock(dto: StockCheckDto): Promise<{ warehouseName: string; shortages: StockShortage[] }> {
    const db = getTenantDb();
    let lines: { articleVariantId: string; quantity: number }[] = dto.lines ?? [];
    if (dto.quoteId) {
      const quote = await db.quote.findUnique({ where: { id: dto.quoteId }, include: { lines: true } });
      if (!quote) throw new NotFoundException('Cotización no encontrada');
      lines = quote.lines.map((l) => ({ articleVariantId: l.articleVariantId, quantity: l.quantity.toNumber() }));
    }
    const needed = new Map<string, number>();
    for (const line of lines) needed.set(line.articleVariantId, (needed.get(line.articleVariantId) ?? 0) + line.quantity);

    const [variants, warehouse] = await Promise.all([
      db.articleVariant.findMany({
        where: { id: { in: [...needed.keys()] }, article: { isService: false } },
        select: { id: true, article: { select: { name: true } } },
      }),
      db.warehouse.findUnique({ where: { id: dto.warehouseId }, select: { name: true } }),
    ]);
    const shortages: StockShortage[] = [];
    for (const variant of variants) {
      const requested = needed.get(variant.id) ?? 0;
      const available = Prisma.Decimal.max(await this.availableStock(dto.warehouseId, variant.id), 0).toNumber();
      if (available < requested) {
        shortages.push({
          articleVariantId: variant.id,
          articleName: variant.article.name,
          requested,
          available,
          deliverNow: available,
          pending: requested - available,
        });
      }
    }
    return { warehouseName: warehouse?.name ?? 'el depósito', shortages };
  }

  async listPendingDeliveries(): Promise<PendingDeliveryRow[]> {
    const db = getTenantDb();
    const rows = await db.pendingDelivery.findMany({
      where: { completedAt: null, cancelledAt: null },
      orderBy: { createdAt: 'asc' },
    });
    if (rows.length === 0) return [];
    const [invoices, variants, warehouses] = await Promise.all([
      db.invoice.findMany({
        where: { id: { in: [...new Set(rows.map((r) => r.invoiceId))] } },
        select: { id: true, documentLetter: true, pointOfSale: true, number: true, issueDate: true, customerName: true },
      }),
      db.articleVariant.findMany({
        where: { id: { in: [...new Set(rows.map((r) => r.articleVariantId))] } },
        select: { id: true, sku: true, article: { select: { name: true } } },
      }),
      db.warehouse.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.warehouseId))] } }, select: { id: true, name: true } }),
    ]);
    const result: PendingDeliveryRow[] = [];
    for (const row of rows) {
      const invoice = invoices.find((i) => i.id === row.invoiceId);
      const variant = variants.find((v) => v.id === row.articleVariantId);
      const available = await this.availableStock(row.warehouseId, row.articleVariantId);
      result.push({
        id: row.id,
        invoiceId: row.invoiceId,
        invoiceLabel: invoice ? `${invoice.documentLetter} ${invoice.pointOfSale}-${invoice.number}` : '—',
        issueDate: (invoice?.issueDate ?? row.createdAt).toISOString(),
        customerName: invoice?.customerName ?? '—',
        articleName: variant?.article.name ?? '—',
        sku: variant?.sku ?? '',
        warehouseName: warehouses.find((w) => w.id === row.warehouseId)?.name ?? '—',
        quantityOrdered: row.quantityOrdered.toNumber(),
        quantityPending: row.quantityPending.toNumber(),
        availableNow: Prisma.Decimal.max(available, 0).toNumber(),
      });
    }
    return result;
  }

  /** "Entregar": sale del depósito ahora (SALE_OUT) y se registra el costo
   * de lo vendido al costo promedio de este momento. Se puede entregar una
   * parte. */
  async deliverPending(id: string, quantity?: number): Promise<PendingDeliveryRow[]> {
    const db = getTenantDb();
    // Dos personas tocando "Entregar" a la vez no pueden entregar dos veces.
    await db.$queryRaw`SELECT id FROM pending_deliveries WHERE id = ${id} FOR UPDATE`;
    const row = await db.pendingDelivery.findUnique({ where: { id } });
    if (!row || row.completedAt || row.cancelledAt) {
      throw new NotFoundException('Esa entrega ya no está pendiente');
    }
    const qty = quantity != null ? new Prisma.Decimal(quantity) : row.quantityPending;
    if (qty.gt(row.quantityPending)) {
      throw new BadRequestException(`Quedan ${QTY.format(row.quantityPending.toNumber())} por entregar`);
    }
    const movement = await this.inventoryService.recordMovement({
      warehouseId: row.warehouseId,
      articleVariantId: row.articleVariantId,
      type: 'SALE_OUT',
      quantity: qty.toNumber(),
      invoiceId: row.invoiceId,
      invoiceLineId: row.invoiceLineId,
      sourceType: 'INVOICE',
      sourceId: row.invoiceId,
    });
    if (movement.unitCost != null) {
      const invoice = await db.invoice.findUnique({
        where: { id: row.invoiceId },
        select: { documentLetter: true, pointOfSale: true, number: true },
      });
      await this.accountingService.postPendingDeliveryCogsEntry({
        amount: new Prisma.Decimal(movement.unitCost).mul(qty),
        date: new Date(),
        description: invoice
          ? `Entrega pendiente - Factura ${invoice.documentLetter} ${invoice.pointOfSale}-${invoice.number}`
          : `Entrega pendiente - comprobante ${row.invoiceId}`,
      });
    }
    const remaining = row.quantityPending.sub(qty);
    await db.pendingDelivery.update({
      where: { id },
      data: { quantityPending: remaining, completedAt: remaining.lte(0) ? new Date() : null },
    });
    return this.listPendingDeliveries();
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
      // Lo que todavía no salió del depósito se cancela primero: no hay
      // stock que reponer ni costo que revertir por esa parte.
      let toRestock = creditNoteLine.quantity;
      const pending = await db.pendingDelivery.findFirst({
        where: { invoiceLineId: creditNoteLine.invoiceLineId, completedAt: null, cancelledAt: null },
      });
      if (pending) {
        const cancel = Prisma.Decimal.min(pending.quantityPending, toRestock);
        const left = pending.quantityPending.sub(cancel);
        await db.pendingDelivery.update({
          where: { id: pending.id },
          data: { quantityPending: left, cancelledAt: left.lte(0) ? new Date() : null },
        });
        toRestock = toRestock.sub(cancel);
      }
      if (toRestock.lte(0)) {
        continue;
      }
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
        quantity: toRestock,
        unitCost: original.unitCost,
      });
      if (original.unitCost != null) {
        totalCogs = totalCogs.add(original.unitCost.mul(toRestock));
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
    // Antes de mover cualquier saldo (ver AccountingService.ensureMoneyAccounts).
    await this.accountingService.ensureMoneyAccounts();

    // Dónde entró la plata: la cuenta elegida; si no se eligió ninguna,
    // Mercado Pago para los cobros por Mercado Pago (QR/link) y "Cobranzas a
    // depositar" para el resto (tarjeta, transferencia, Facturación sin
    // cuenta) - de ahí se pasa con una transferencia entre cuentas. Un
    // cheque de tercero no entra a ninguna cuenta hasta depositarlo.
    const financialAccountId = dto.check
      ? dto.financialAccountId
      : (dto.financialAccountId ??
        (
          await getOrCreateSystemFinancialAccount(
            getTenantDb(),
            getTenantId(),
            dto.method === 'MERCADOPAGO' ? 'MERCADOPAGO' : 'PENDING_DEPOSIT',
          )
        ).id);

    const receipt = await this.invoicingService.recordReceipt({ ...dto, financialAccountId });
    await this.accountingService.postReceiptJournalEntry({
      receiptId: receipt.id,
      amount: receipt.amount,
      money: dto.check || !financialAccountId ? { kind: 'CHECKS_IN_PORTFOLIO' } : { financialAccountId },
      date: receipt.paidAt,
    });

    // El cobro también mueve el saldo de la cuenta de dinero, igual que el
    // asiento de arriba. Un cheque de tercero es la única excepción: no
    // afecta ningún saldo hasta depositarlo (ver apps/api/src/app/treasury/).
    if (financialAccountId && !dto.check) {
      const account = await getTenantDb().financialAccount.findUnique({
        where: { id: financialAccountId },
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
        financialAccountId,
        amount: receipt.amount.toNumber(),
        externalRef: `Cobro factura ${dto.invoiceId}`,
      });
    }

    // Un cheque de tercero siempre nace de un Recibo (ver
    // CheckService.registerThirdPartyCheck) - si el DTO trae el detalle,
    // lo registramos en Cartera en la misma transacción. No afecta
    // FinancialAccount.currentBalance todavía (recién al depositarlo, ver
    // apps/api/src/app/treasury/); el asiento de arriba ya lo mandó a
    // Cheques en Cartera.
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
      allowPendingDelivery: dto.allowPendingDelivery,
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
