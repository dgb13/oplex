import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  beforeCommit,
  getTenantDb,
  getTenantId,
  getUserId,
  notify,
  onCommit,
  Prisma,
  resolveCurrentTaxDefinition,
  userIdsWithRoles,
  type Article,
  type ArticleVariant,
  type Currency,
  type DiscountType,
  type DocumentLetter,
  type Invoice,
  type InvoiceLine,
  type CreditNote,
  type CreditNoteLine,
  type ExchangeRateHistory,
  type InvoiceConcept,
  type InvoicePdfFormat,
  type InvoiceTaxLine,
  type InvoiceTaxLineKind,
  type Receipt,
  type ReminderTone,
  type TaxDefinition,
  type TaxLineKind,
  type TenantTaxCondition,
} from '@plexo/database';
import { SubscriptionService } from '@plexo/subscriptions';
import type { CalendarEntry } from '@plexo/types';
import { BNA_EXCHANGE_RATE, type BnaExchangeRatePort } from './bna-exchange-rate.port.js';
import type { CreateCreditNoteDto } from './dto/create-credit-note.dto.js';
import type { CreateCurrencyDto } from './dto/create-currency.dto.js';
import type { CreateInvoiceDto } from './dto/create-invoice.dto.js';
import type { RecordExchangeRateDto } from './dto/record-exchange-rate.dto.js';
import type { RecordReceiptDto } from './dto/record-receipt.dto.js';
import { EMAIL_SENDER, type EmailSender } from './email-sender.port.js';
import {
  ELECTRONIC_INVOICING,
  type AuthorizedVoucher,
  type ElectronicInvoicingPort,
  type ElectronicInvoiceTaxLine,
  type VoucherSequence,
} from './electronic-invoicing.port.js';
import { buildInvoicePdfData } from './pdf/build-pdf-data.js';
import { InvoicePdfService } from './pdf/invoice-pdf.service.js';

// AFIP WSFE Tributos[].Id (tabla pública de FEParamGetTiposTributos) -
// hardcodeada a propósito, mismo criterio que las alícuotas de IVA fijas
// en otros puntos de este módulo.
const AFIP_TRIBUTO_ID: Record<InvoiceTaxLineKind, number> = {
  NATIONAL: 1,
  PROVINCIAL: 2,
  MUNICIPAL: 3,
  INTERNAL: 4,
  OTHER: 99,
};

/**
 * La letra que puede emitir el tenant según su condición frente al IVA:
 * Monotributo/Exento sólo C; Responsable Inscripto A, B o M, nunca C. La
 * pantalla ya la fija (documentLetter.ts en el front), esto es para que
 * ningún otro camino emita una letra equivocada - ARCA la rechazaría, o peor,
 * la aceptaría. Sin condición cargada no se valida (el tenant todavía no la
 * configuró en Preferencias).
 */
export function assertDocumentLetterAllowed(
  ownTaxCondition: TenantTaxCondition | null,
  documentLetter: DocumentLetter,
): void {
  if (!ownTaxCondition) {
    return;
  }
  const noVatIssuer = ownTaxCondition === 'MONOTRIBUTO' || ownTaxCondition === 'EXENTO';
  if (noVatIssuer && documentLetter !== 'C') {
    throw new BadRequestException(
      `Tu empresa es ${ownTaxCondition === 'MONOTRIBUTO' ? 'Monotributo' : 'Exenta'}: sólo puede emitir Factura C, no ${documentLetter}`,
    );
  }
  if (!noVatIssuer && documentLetter === 'C') {
    throw new BadRequestException('Tu empresa es Responsable Inscripto: no puede emitir Factura C (corresponde A o B)');
  }
}

// Tope de comprobantes huérfanos que se registran de una vez (ver
// recordUnregisteredVouchers). Más que esto no es un CAE suelto: es otro
// sistema emitiendo en el mismo punto de venta.
const MAX_UNREGISTERED_TO_RECORD = 50;
// Y de esos, a cuántos se les piden los datos a ARCA (una llamada cada uno,
// dentro de la venta en curso).
const MAX_UNREGISTERED_TO_QUERY = 5;

type InvoiceWithLines = Invoice & { lines: InvoiceLine[] };
type InvoiceWithLinesAndTaxLines = InvoiceWithLines & { taxLines: InvoiceTaxLine[] };
export type InvoiceLineDetail = InvoiceLine & { articleVariant: ArticleVariant & { article: Article } };
export type InvoiceDetail = Invoice & {
  lines: InvoiceLineDetail[];
  receipts: Receipt[];
  creditNotes: CreditNote[];
};
/** Shape usada por generatePdf()/buildInvoicePdfData - a diferencia de
 * InvoiceDetail (la del panel "ver detalle"), acá sí hace falta `currency`
 * (código/isBase para el QR y el desglose de moneda del PDF). Una consulta
 * propia en vez de reusar getInvoice() para no cambiarle el include a ese
 * otro caller. */
export type InvoiceWithCurrencyAndLines = Invoice & { currency: Currency; lines: InvoiceLineDetail[] };

interface LineCalculation {
  articleVariantId: string;
  quantity: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  discountType: DiscountType;
  discountValue: Prisma.Decimal;
  netAmount: Prisma.Decimal;
  taxRate: Prisma.Decimal;
  taxKind: TaxLineKind;
}

@Injectable()
export class InvoicingService {
  private readonly logger = new Logger(InvoicingService.name);

  constructor(
    @Inject(EMAIL_SENDER) private readonly emailSender: EmailSender,
    @Inject(ELECTRONIC_INVOICING)
    private readonly electronicInvoicing: ElectronicInvoicingPort,
    private readonly eventEmitter: EventEmitter2,
    private readonly subscriptionService: SubscriptionService,
    @Inject(BNA_EXCHANGE_RATE)
    private readonly bnaExchangeRate: BnaExchangeRatePort,
    private readonly invoicePdfService: InvoicePdfService,
  ) {}

  async createCurrency(dto: CreateCurrencyDto): Promise<Currency> {
    const db = getTenantDb();
    const tenantId = getTenantId();
    if (dto.isBase) {
      await db.currency.updateMany({ where: { tenantId, isBase: true }, data: { isBase: false } });
    }
    return db.currency.create({
      data: {
        tenantId,
        code: dto.code,
        name: dto.name,
        isBase: dto.isBase ?? false,
      },
    });
  }

  /** Botón "Marcar como base" sobre una moneda ya existente en
   * Preferencias → Monedas y Cotizaciones - hasta que esto existiera, una
   * moneda sólo podía nacer base (y de hecho createCurrency ni siquiera
   * mandaba isBase desde la UI todavía), así que ningún tenant real tenía
   * una moneda base configurada. Mismo invariante "una sola base por
   * tenant" que createCurrency. */
  async setBaseCurrency(currencyId: string): Promise<Currency> {
    const db = getTenantDb();
    const tenantId = getTenantId();
    const currency = await db.currency.findUnique({ where: { id: currencyId } });
    if (!currency) {
      throw new NotFoundException('Currency not found');
    }
    await db.currency.updateMany({ where: { tenantId, isBase: true }, data: { isBase: false } });
    return db.currency.update({ where: { id: currencyId }, data: { isBase: true } });
  }

  /** latestRate viene de una consulta extra por moneda (findFirst sobre su
   * historial) - un puñado de monedas por tenant, no vale la pena una
   * consulta más compleja para evitarlo. null cuando la moneda todavía no
   * tiene ninguna cotización cargada (recién creada). */
  async listCurrencies(): Promise<(Currency & { latestRate: number | null })[]> {
    const db = getTenantDb();
    const currencies = await db.currency.findMany({ orderBy: { code: 'asc' } });
    return Promise.all(
      currencies.map(async (currency) => {
        if (currency.isBase) {
          return { ...currency, latestRate: 1 };
        }
        const latest = await db.exchangeRateHistory.findFirst({
          where: { currencyId: currency.id },
          orderBy: { effectiveAt: 'desc' },
        });
        return { ...currency, latestRate: latest ? latest.rate.toNumber() : null };
      }),
    );
  }

  recordExchangeRate(dto: RecordExchangeRateDto): Promise<ExchangeRateHistory> {
    return getTenantDb().exchangeRateHistory.create({
      data: { tenantId: getTenantId(), currencyId: dto.currencyId, rate: dto.rate },
    });
  }

  listExchangeRateHistory(currencyId: string): Promise<ExchangeRateHistory[]> {
    return getTenantDb().exchangeRateHistory.findMany({
      where: { currencyId },
      orderBy: { effectiveAt: 'desc' },
    });
  }

  /** "Sincronizar con Banco Nación" en Preferencias (y el cron diario, ver
   * ExchangeRateSchedulerService en apps/api) - sólo sabe traer USD (ver
   * BnaExchangeRatePort). Pide que la moneda ya exista para este tenant
   * (se crea a mano una vez desde Preferencias, POST /invoicing/currencies)
   * en vez de crearla implícitamente acá, para no inventar isBase/nombre. */
  async syncBnaRate(): Promise<ExchangeRateHistory> {
    const usd = await getTenantDb().currency.findFirst({ where: { code: 'USD' } });
    if (!usd) {
      throw new BadRequestException(
        'Este tenant todavía no tiene la moneda USD configurada - creala primero en Preferencias → Monedas y Cotizaciones',
      );
    }
    const { sell } = await this.bnaExchangeRate.getOfficialUsdRate();
    return this.recordExchangeRate({ currencyId: usd.id, rate: sell });
  }

  listInvoices(): Promise<InvoiceWithLines[]> {
    return getTenantDb().invoice.findMany({
      include: { lines: true },
      orderBy: { issueDate: 'desc' },
    });
  }

  /** Full detail (line items, discounts, receipt history, credit notes) -
   * for the "ver detalle" panel, unlike listInvoices()/InvoiceWithLines
   * which only carries lines (all it needs for the table).
   *
   * Three separate sequential queries, not one `include` with three
   * to-many relations - getTenantDb() is a single interactive-transaction
   * client (one Postgres connection), and Prisma dispatches multiple
   * to-many relations as concurrent follow-up queries against it, which
   * the driver can't do on one connection (silently hangs instead of
   * erroring - surfaces client-side as node-postgres's "already executing
   * a query" deprecation warning). Awaiting each one in turn avoids that
   * entirely; the extra round trips are irrelevant next to a
   * user-initiated "view this one invoice" click.
   */
  async getInvoice(id: string): Promise<InvoiceDetail> {
    const db = getTenantDb();
    const invoice = await db.invoice.findUnique({
      where: { id },
      include: { lines: { include: { articleVariant: { include: { article: true } } } } },
    });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }
    const receipts = await db.receipt.findMany({
      where: { invoiceId: id },
      orderBy: { paidAt: 'desc' },
    });
    const creditNotes = await db.creditNote.findMany({
      where: { invoiceId: id },
      orderBy: { issueDate: 'desc' },
    });
    return { ...invoice, receipts, creditNotes };
  }

  /** "Descargar PDF" en el detalle de Facturación - consulta propia (no
   * reusa getInvoice()) porque hace falta `currency` acá (código/isBase
   * para el QR y el desglose de moneda), que ese otro caller no necesita.
   * `format` es opcional - si no viene, se resuelve la preferencia guardada
   * del usuario (mismo criterio que purchaseDocumentPdfStyle). */
  async generatePdf(id: string, format?: InvoicePdfFormat): Promise<{ buffer: Buffer; filename: string }> {
    const db = getTenantDb();
    const tenantId = getTenantId();
    const invoice = await db.invoice.findUnique({
      where: { id },
      include: {
        currency: true,
        lines: { include: { articleVariant: { include: { article: true } } } },
      },
    });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }
    const customer = await db.company.findUniqueOrThrow({ where: { id: invoice.customerId } });
    const tenant = await db.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const tenantSettings = await db.tenantSettings.findUnique({ where: { tenantId } });
    const resolvedFormat = format ?? (await this.resolveRequesterInvoicePdfFormat());

    const data = await buildInvoicePdfData(invoice, customer, tenant, tenantSettings);
    const buffer = await this.invoicePdfService.generate(resolvedFormat, data);
    return { buffer, filename: `${invoice.documentLetter}-${invoice.pointOfSale}-${invoice.number}.pdf` };
  }

  private async resolveRequesterInvoicePdfFormat(): Promise<InvoicePdfFormat> {
    const userId = getUserId();
    if (!userId) {
      return 'A4';
    }
    const user = await getTenantDb().user.findUniqueOrThrow({
      where: { id: userId },
      select: { invoicePdfFormat: true },
    });
    return user.invoicePdfFormat;
  }

  /**
   * Strict calculation order (do not reorder without re-reading the
   * commit that introduced this - it exists to keep multi-rate tax
   * allocation correct once a global discount is in the mix):
   *   1. unit price (USD, converted to the invoice currency) x quantity
   *   2. apply the line's own discount -> each line's net amount
   *   3. subtotal = sum of line net amounts
   *   4. apply globalDiscountPercent to that subtotal, distributed back
   *      across lines proportionally to their share of it (needed because
   *      lines can carry different tax rates - discounting "the total"
   *      and taxing "the total" would misallocate tax across rates)
   *   5. tax each line's post-global-discount amount, sum for taxTotal
   *
   * Does not touch stock - see SalesService (apps/api) for why that's
   * composed at the app layer instead of being called from here.
   */
  async createInvoice(dto: CreateInvoiceDto, senderFrom?: string): Promise<InvoiceWithLinesAndTaxLines> {
    await this.subscriptionService.assertCanIssueInvoiceThisMonth();

    const db = getTenantDb();
    const tenantId = getTenantId();
    const issuedByUserId = getUserId();
    if (!issuedByUserId) {
      throw new BadRequestException('An authenticated user is required to issue an invoice');
    }

    const customer = await db.company.findUnique({
      where: { id: dto.customerId },
      include: { roles: true },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }
    if (!customer.active) {
      throw new BadRequestException('This company is inactive');
    }
    if (!customer.roles.some((r) => r.role === 'CUSTOMER')) {
      throw new BadRequestException('This company is not flagged as a customer');
    }

    const settings = await db.tenantSettings.findUnique({ where: { tenantId }, select: { ownTaxCondition: true } });
    assertDocumentLetterAllowed(settings?.ownTaxCondition ?? null, dto.documentLetter);
    // Factura C (emisor Monotributo/Exento) no lleva IVA: ARCA exige
    // ImpIVA = 0 y el precio es el final. La alícuota del artículo (o la que
    // venga en la línea) se ignora - ver withoutVat abajo.
    const withoutVat = dto.documentLetter === 'C';

    const currency = await db.currency.findUnique({ where: { id: dto.currencyId } });
    if (!currency) {
      throw new NotFoundException('Currency not found');
    }

    // Override puntual del comprobante (NewInvoiceModal, "ajustar cotización
    // antes de emitir") - si no vino, se resuelve del historial como
    // siempre. No pisa nada del historial en sí, sólo esta factura.
    const exchangeRate =
      dto.exchangeRate !== undefined
        ? new Prisma.Decimal(dto.exchangeRate)
        : await this.resolveExchangeRate(currency);
    const globalDiscountPercent = new Prisma.Decimal(dto.globalDiscountPercent ?? 0);

    const lineCalculations: LineCalculation[] = [];
    let subtotal = new Prisma.Decimal(0);
    let hasProductLine = false;
    let hasServiceLine = false;

    for (const line of dto.lines) {
      const variant = await db.articleVariant.findUnique({
        where: { id: line.articleVariantId },
        include: { article: { include: { taxDefinition: true } } },
      });
      if (!variant) {
        throw new NotFoundException(`Article variant ${line.articleVariantId} not found`);
      }
      if (variant.article.isService) {
        hasServiceLine = true;
      } else {
        hasProductLine = true;
      }

      const quantity = new Prisma.Decimal(line.quantity);
      // taxRate/taxKind se resuelven ANTES del precio porque el desglose de
      // "IVA incluido" (más abajo) necesita la alícuota de esta línea para
      // convertir precio final -> neto. Un override de línea no cambia la
      // clasificación fiscal del artículo en el catálogo, sólo esta factura.
      // Del catálogo, la versión del impuesto vigente hoy - no la que quedó
      // guardada en el artículo (ver resolveCurrentTaxDefinition).
      // Factura C: sin IVA y todo como neto (GRAVADO al 0%) - ARCA exige
      // ImpOpEx/ImpTotConc/ImpIVA en 0 para la clase C, así que tampoco hay
      // exento ni no gravado aunque el artículo lo diga.
      const { rate: taxRate, kind: taxKind } = withoutVat
        ? { rate: new Prisma.Decimal(0), kind: 'GRAVADO' as TaxLineKind }
        : line.taxKind !== undefined || line.taxRate !== undefined
          ? this.resolveLineTaxOverride(line.taxKind, line.taxRate)
          : this.resolveLineTax(await resolveCurrentTaxDefinition(db, variant.article.taxDefinition));
      // rawUnitPrice: override de línea tal cual (ya en la moneda del
      // comprobante, no se multiplica por exchangeRate - lo tipeó el
      // usuario pensando en esa moneda) o precio de catálogo convertido.
      const rawUnitPrice =
        line.unitPrice !== undefined ? new Prisma.Decimal(line.unitPrice) : variant.unitPrice.mul(exchangeRate);
      // Con el toggle activo, el precio tipeado es FINAL (con IVA) - se
      // desglosa a neto acá mismo, antes de que el resto del pipeline (sin
      // cambios) vuelva a sumarle el IVA. Una línea EXENTO/NO_GRAVADO tiene
      // taxRate=0 (ver resolveLineTax/resolveLineTaxOverride), así que la
      // división es un no-op y el toggle no le hace nada, correctamente.
      const unitPrice =
        dto.pricesIncludeTax && taxRate.gt(0)
          ? rawUnitPrice.div(new Prisma.Decimal(1).add(taxRate.div(100)))
          : rawUnitPrice;
      const grossAmount = unitPrice.mul(quantity);

      const discountType: DiscountType = line.discountType ?? 'PERCENTAGE';
      const discountValue = new Prisma.Decimal(line.discountValue ?? 0);
      const discountAmount =
        discountType === 'PERCENTAGE'
          ? grossAmount.mul(discountValue).div(100)
          : discountValue;
      // A PERCENTAGE over 100 or an AMOUNT bigger than the line itself would
      // drive netAmount negative - the DTO's @Min(0) on discountValue can't
      // catch this alone (AMOUNT has no fixed upper bound, it depends on
      // grossAmount, only known here). Left unchecked, a negative netAmount
      // flows into `subtotal` below and corrupts the global-discount/tax
      // share (line ~234) for every OTHER line on the same invoice, not
      // just this one.
      if (discountAmount.gt(grossAmount)) {
        throw new BadRequestException(
          `El descuento de la línea ${variant.id} (${discountAmount.toFixed(2)}) no puede superar el monto de la línea (${grossAmount.toFixed(2)})`,
        );
      }
      const netAmount = grossAmount.sub(discountAmount);

      subtotal = subtotal.add(netAmount);
      lineCalculations.push({
        articleVariantId: variant.id,
        quantity,
        unitPrice,
        discountType,
        discountValue,
        netAmount,
        taxRate,
        taxKind,
      });
    }

    const globalDiscountAmount = subtotal.mul(globalDiscountPercent).div(100);
    let taxTotal = new Prisma.Decimal(0);
    // Sums of afterGlobalDiscount for EXENTO/NO_GRAVADO lines - reported to
    // AFIP as ImpOpEx/ImpTotConc instead of folded into netAmount/Iva[]
    // (see groupTaxLines below and AfipWsfeClient). Invoice.subtotal/total
    // still include them as normal - this split only matters for the WSFE
    // payload, not accounting/display.
    let exemptAmount = new Prisma.Decimal(0);
    let nonTaxedAmount = new Prisma.Decimal(0);
    const lineInputs: Prisma.InvoiceLineCreateManyInvoiceInput[] = [];
    const taxLineRows: { taxRate: Prisma.Decimal; netAmount: Prisma.Decimal; taxAmount: Prisma.Decimal }[] = [];

    for (const calc of lineCalculations) {
      const share = subtotal.isZero() ? new Prisma.Decimal(0) : calc.netAmount.div(subtotal);
      const lineGlobalDiscount = globalDiscountAmount.mul(share);
      const afterGlobalDiscount = calc.netAmount.sub(lineGlobalDiscount);
      // rate is always 0 for EXENTO/NO_GRAVADO (see resolveLineTax), so this
      // stays 0 for them without a separate branch.
      const lineTax = afterGlobalDiscount.mul(calc.taxRate).div(100);
      taxTotal = taxTotal.add(lineTax);
      if (calc.taxKind === 'EXENTO') {
        exemptAmount = exemptAmount.add(afterGlobalDiscount);
      } else if (calc.taxKind === 'NO_GRAVADO') {
        nonTaxedAmount = nonTaxedAmount.add(afterGlobalDiscount);
      } else {
        // Only GRAVADO lines go into the Iva[] breakdown - an EXENTO/
        // NO_GRAVADO line grouped here would misreport as "gravado al 0%"
        // (AFIP alicuota 3) inside ImpNeto instead of ImpOpEx/ImpTotConc.
        taxLineRows.push({ taxRate: calc.taxRate, netAmount: afterGlobalDiscount, taxAmount: lineTax });
      }

      lineInputs.push({
        articleVariantId: calc.articleVariantId,
        quantity: calc.quantity,
        unitPrice: calc.unitPrice,
        discountType: calc.discountType,
        discountValue: calc.discountValue,
        netAmount: calc.netAmount,
        taxRate: calc.taxRate,
        taxKind: calc.taxKind,
        lineTotal: afterGlobalDiscount.add(lineTax),
      });
    }

    const netSubtotal = subtotal.sub(globalDiscountAmount);
    // Percepciones/otros tributos (ej. IIBB) - no son parte del neto ni del
    // IVA, pero sí del total que le cobramos al cliente (AFIP los suma en
    // ImpTotal vía ImpTrib, ver más abajo). Ver AccountingService
    // .postInvoiceJournalEntry para el lado contable (van a un pasivo
    // propio, no a Ventas).
    const otherTaxLineInputs: Prisma.InvoiceTaxLineCreateManyInvoiceInput[] = (dto.otherTaxLines ?? []).map(
      (line) => ({
        kind: line.kind,
        concept: line.concept,
        baseAmount: line.baseAmount,
        rate: line.rate,
        amount: line.amount,
      }),
    );
    const otherTaxesTotal = (dto.otherTaxLines ?? []).reduce(
      (sum, line) => sum.add(new Prisma.Decimal(line.amount)),
      new Prisma.Decimal(0),
    );
    const total = netSubtotal.add(taxTotal).add(otherTaxesTotal);
    // The taxed-only slice of netSubtotal - what AFIP's ImpNeto actually
    // means once ImpOpEx/ImpTotConc exist as separate buckets.
    const taxedNetAmount = netSubtotal.sub(exemptAmount).sub(nonTaxedAmount);
    const number = await this.reserveVoucherNumber({
      kind: 'FACTURA',
      documentLetter: dto.documentLetter,
      pointOfSale: dto.pointOfSale,
    });
    // hasProductLine stays false only when every line is a service (an empty
    // dto.lines never reaches here - lines are required) - both false is
    // unreachable, but hasService-only correctly resolves to SERVICIOS below.
    const concept: InvoiceConcept =
      hasServiceLine && hasProductLine
        ? 'PRODUCTOS_Y_SERVICIOS'
        : hasServiceLine
          ? 'SERVICIOS'
          : 'PRODUCTOS';

    const created = await db.invoice.create({
      data: {
        tenantId,
        customerId: dto.customerId,
        customerName: customer.name,
        customerTaxId: customer.taxId,
        documentLetter: dto.documentLetter,
        concept,
        pointOfSale: dto.pointOfSale,
        number,
        status: 'ISSUED',
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        currencyId: dto.currencyId,
        exchangeRate,
        globalDiscountPercent,
        subtotal: netSubtotal,
        taxTotal,
        total,
        balanceDue: total,
        issuedByUserId,
        lines: { createMany: { data: lineInputs } },
        taxLines: { createMany: { data: otherTaxLineInputs } },
      },
      include: { lines: true, taxLines: true },
    });

    // El CAE se pide recién al final del request (beforeCommit), después de
    // que quien llamó terminó todo lo suyo (stock, asiento, cobros): si
    // algo de eso falla, se revierte sin que ARCA haya autorizado nada. El
    // número ya quedó reservado (reserveVoucherNumber) hasta el commit.
    await beforeCommit(async () => {
      const { cae, caeExpiry } = await this.electronicInvoicing.requestCae({
        kind: 'FACTURA',
        documentLetter: created.documentLetter,
        concept: created.concept,
        pointOfSale: created.pointOfSale,
        number: created.number,
        issueDate: created.issueDate,
        dueDate: created.dueDate,
        customerTaxId: created.customerTaxId,
        customerTaxCondition: customer.taxCondition,
        customerName: customer.name,
        currencyCode: currency.code,
        exchangeRate: created.exchangeRate,
        netAmount: taxedNetAmount,
        exemptAmount,
        nonTaxedAmount,
        taxAmount: created.taxTotal,
        total: created.total,
        taxLines: this.groupTaxLines(taxLineRows),
        otherTaxes: created.taxLines.map((line) => ({
          id: AFIP_TRIBUTO_ID[line.kind],
          desc: line.concept,
          baseImp: line.baseAmount ?? taxedNetAmount,
          alic: line.rate ?? new Prisma.Decimal(0),
          importe: line.amount,
        })),
      });
      await db.invoice.update({
        where: { id: created.id },
        data: { afipCae: cae, afipCaeExpiry: caeExpiry },
      });
      // Este mismo objeto es el que devolvió createInvoice y el controller
      // serializa recién después del commit: se completa acá para que la
      // respuesta lleve el CAE.
      created.afipCae = cae;
      created.afipCaeExpiry = caeExpiry;
    });

    // Mail y aviso al tablero sólo si la factura de verdad se guardó - antes
    // salían aunque la transacción terminara en rollback.
    onCommit(() => {
      if (customer.email) {
        this.emailSender
          .sendInvoiceEmail({
            to: customer.email,
            invoiceNumber: `${dto.pointOfSale}-${created.number}`,
            total: created.total.toFixed(2),
            from: senderFrom,
          })
          .catch((err: Error) => this.logger.warn(`No se pudo mandar el mail de la factura ${created.id}: ${err.message}`));
      }
      this.eventEmitter.emit('invoice.created', {
        tenantId: created.tenantId,
        invoiceId: created.id,
        total: created.total.toString(),
        customerName: created.customerName,
        status: created.status,
        issueDate: created.issueDate.toISOString(),
      });
    });

    return created;
  }

  /**
   * Credit notes always target specific invoice lines/quantities - crediting
   * every line's full quantity reproduces what used to be the only option
   * ("full reversal"), same code path, no separate branch. Guards against
   * over-crediting (the sum of everything ever credited for a line can't
   * exceed its original quantity) with a row lock on the targeted
   * InvoiceLines first - without it, two concurrent credit notes for
   * overlapping quantities of the same line could both read the same
   * prior-credited sum and both pass the check before either commits.
   */
  async createCreditNote(dto: CreateCreditNoteDto): Promise<CreditNote & { lines: CreditNoteLine[] }> {
    const db = getTenantDb();
    const tenantId = getTenantId();
    const issuedByUserId = getUserId();
    if (!issuedByUserId) {
      throw new BadRequestException('An authenticated user is required to issue a credit note');
    }

    const invoice = await db.invoice.findUnique({
      where: { id: dto.invoiceId },
      // Condición IVA actual del cliente, para CondicionIVAReceptorId de la
      // nota de crédito (la factura no guarda un snapshot de ese dato).
      include: { lines: true, customer: { select: { taxCondition: true } } },
    });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }
    if (!invoice.afipCae) {
      throw new BadRequestException('Cannot credit an invoice that has not been issued yet');
    }

    // Lock first, in requested order, so two concurrent credit notes for
    // the same line serialize instead of racing past the check below.
    for (const line of dto.lines) {
      await db.$queryRaw`SELECT id FROM invoice_lines WHERE id = ${line.invoiceLineId} FOR UPDATE`;
    }

    const invoiceLinesById = new Map(invoice.lines.map((l) => [l.id, l]));
    const alreadyCredited = await db.creditNoteLine.groupBy({
      by: ['invoiceLineId'],
      where: { invoiceLineId: { in: dto.lines.map((l) => l.invoiceLineId) } },
      _sum: { quantity: true },
    });
    const alreadyCreditedByLine = new Map(
      alreadyCredited.map((row) => [row.invoiceLineId, row._sum.quantity ?? new Prisma.Decimal(0)]),
    );

    let subtotal = new Prisma.Decimal(0);
    let taxTotal = new Prisma.Decimal(0);
    let total = new Prisma.Decimal(0);
    // Same split as createInvoice - which AFIP bucket (Iva[]/ImpNeto vs.
    // ImpOpEx vs. ImpTotConc) each credited line's netAmount falls into,
    // read from InvoiceLine.taxKind (persisted at invoice creation, not
    // re-derived from the article's current TaxDefinition).
    let exemptAmount = new Prisma.Decimal(0);
    let nonTaxedAmount = new Prisma.Decimal(0);
    const linesToCreate: {
      invoiceLineId: string;
      quantity: Prisma.Decimal;
      netAmount: Prisma.Decimal;
      taxAmount: Prisma.Decimal;
      lineTotal: Prisma.Decimal;
    }[] = [];
    const taxLineRows: { taxRate: Prisma.Decimal; netAmount: Prisma.Decimal; taxAmount: Prisma.Decimal }[] = [];

    for (const requested of dto.lines) {
      const invoiceLine = invoiceLinesById.get(requested.invoiceLineId);
      if (!invoiceLine) {
        throw new BadRequestException(
          `Invoice line ${requested.invoiceLineId} does not belong to this invoice`,
        );
      }
      const quantity = new Prisma.Decimal(requested.quantity);
      const priorlyCredited = alreadyCreditedByLine.get(invoiceLine.id) ?? new Prisma.Decimal(0);
      if (priorlyCredited.add(quantity).gt(invoiceLine.quantity)) {
        throw new BadRequestException(
          `Cannot credit ${quantity.toString()} of invoice line ${invoiceLine.id}: only ${invoiceLine.quantity.sub(priorlyCredited).toString()} left to credit`,
        );
      }

      // Proportional slice of the line's already-computed amounts, not
      // re-derived from taxRate - avoids drifting from whatever rounding
      // the original invoice line's lineTotal/netAmount already baked in.
      const ratio = quantity.div(invoiceLine.quantity);
      const netAmount = invoiceLine.netAmount.mul(ratio);
      const originalTax = invoiceLine.lineTotal.sub(invoiceLine.netAmount);
      const taxAmount = originalTax.mul(ratio);
      const lineTotal = netAmount.add(taxAmount);

      linesToCreate.push({ invoiceLineId: invoiceLine.id, quantity, netAmount, taxAmount, lineTotal });
      if (invoiceLine.taxKind === 'EXENTO') {
        exemptAmount = exemptAmount.add(netAmount);
      } else if (invoiceLine.taxKind === 'NO_GRAVADO') {
        nonTaxedAmount = nonTaxedAmount.add(netAmount);
      } else {
        taxLineRows.push({ taxRate: invoiceLine.taxRate, netAmount, taxAmount });
      }
      subtotal = subtotal.add(netAmount);
      taxTotal = taxTotal.add(taxAmount);
      total = total.add(lineTotal);
    }

    if (total.gt(invoice.balanceDue)) {
      throw new BadRequestException('Credit note total exceeds the invoice balance due');
    }

    const number = await this.reserveVoucherNumber({
      kind: 'NOTA_CREDITO',
      documentLetter: invoice.documentLetter,
      pointOfSale: invoice.pointOfSale,
    });

    const created = await db.creditNote.create({
      data: {
        tenantId,
        invoiceId: invoice.id,
        documentLetter: invoice.documentLetter,
        pointOfSale: invoice.pointOfSale,
        number,
        reason: dto.reason,
        currencyId: invoice.currencyId,
        exchangeRate: invoice.exchangeRate,
        subtotal,
        taxTotal,
        total,
        issuedByUserId,
        lines: { createMany: { data: linesToCreate.map((l) => ({ tenantId, ...l })) } },
      },
      include: { lines: true },
    });

    const currency = await db.currency.findUniqueOrThrow({ where: { id: invoice.currencyId } });
    // Mismo criterio que createInvoice: el CAE al final del request, después
    // del asiento y la reposición de stock que hace SalesService.voidSale.
    await beforeCommit(async () => {
      const { cae, caeExpiry } = await this.electronicInvoicing.requestCae({
        kind: 'NOTA_CREDITO',
        documentLetter: created.documentLetter,
        // Reuses the original invoice's concept as-is - a credit note reverses
        // those same lines, so it's the same concept by definition, no need
        // to re-derive it from Article.isService again.
        concept: invoice.concept,
        pointOfSale: created.pointOfSale,
        number: created.number,
        issueDate: created.issueDate,
        // A credit note has no due date of its own (it isn't something owed) -
        // AfipWsfeClient falls back to issueDate for FchVtoPago when null.
        dueDate: null,
        customerTaxId: invoice.customerTaxId,
        customerTaxCondition: invoice.customer.taxCondition,
        customerName: invoice.customerName,
        currencyCode: currency.code,
        exchangeRate: created.exchangeRate,
        netAmount: subtotal.sub(exemptAmount).sub(nonTaxedAmount),
        exemptAmount,
        nonTaxedAmount,
        taxAmount: created.taxTotal,
        total: created.total,
        taxLines: this.groupTaxLines(taxLineRows),
        associatedVoucher: {
          documentLetter: invoice.documentLetter,
          pointOfSale: invoice.pointOfSale,
          number: invoice.number,
        },
      });
      await db.creditNote.update({
        where: { id: created.id },
        data: { afipCae: cae, afipCaeExpiry: caeExpiry },
      });
      // Ver el mismo comentario en createInvoice.
      created.afipCae = cae;
      created.afipCaeExpiry = caeExpiry;
    });

    const balanceDue = invoice.balanceDue.sub(total);
    await db.invoice.update({
      where: { id: invoice.id },
      // Zeroing the balance via a credit note reuses PAID rather than a
      // return-specific status (e.g. CANCELLED) - the balance really is
      // settled either way, and CANCELLED risks a future revenue report
      // that filters it out silently excluding real, recognized revenue
      // from a partial return. The CreditNote row is what records *why*
      // it's zero, not the status.
      data: { balanceDue, status: balanceDue.isZero() ? 'PAID' : invoice.status },
    });

    return created;
  }

  /**
   * Reabre balanceDue tras el rechazo de un cheque de tercero que había
   * cobrado esta factura (ver CheckService.rejectCheck / apps/api's
   * TreasuryService, que es quien resuelve invoiceId a partir de
   * check.receiptId - @plexo/invoicing nunca importa @plexo/treasury).
   * `amount` deshace exactamente el cobro original (siempre ≤ lo que en su
   * momento se restó, balanceDue nunca puede superar total por esto solo);
   * `feeAmount` es deuda genuinamente nueva (el gasto de rechazo que se le
   * recobra al cliente), no una reversa. Mismo cálculo de status que
   * recordReceipt (PAID si llega a cero - no debería pasar acá con
   * amount+fee > 0 -, OVERDUE si ya venció, si no PARTIALLY_PAID). No
   * postea el asiento contable - eso es
   * AccountingService.postCheckRejectionJournalEntry, compuesto aparte por
   * la misma composición-root.
   */
  async reopenInvoiceBalance(
    invoiceId: string,
    amount: Prisma.Decimal | number | string,
    feeAmount: Prisma.Decimal | number | string = 0,
  ): Promise<Invoice> {
    const db = getTenantDb();
    const invoice = await db.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    const balanceDue = invoice.balanceDue.add(amount).add(feeAmount);
    const stillOverdue = Boolean(invoice.dueDate && invoice.dueDate < new Date());
    return db.invoice.update({
      where: { id: invoiceId },
      data: {
        balanceDue,
        status: balanceDue.isZero() ? 'PAID' : stillOverdue ? 'OVERDUE' : 'PARTIALLY_PAID',
      },
    });
  }

  async recordReceipt(dto: RecordReceiptDto): Promise<Receipt> {
    const db = getTenantDb();
    const tenantId = getTenantId();

    const invoice = await db.invoice.findUnique({ where: { id: dto.invoiceId } });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    const amount = new Prisma.Decimal(dto.amount);
    if (amount.gt(invoice.balanceDue)) {
      throw new BadRequestException('Receipt amount exceeds the invoice balance due');
    }

    const receipt = await db.receipt.create({
      data: {
        tenantId,
        invoiceId: dto.invoiceId,
        amount,
        method: dto.method,
        financialAccountId: dto.financialAccountId,
      },
    });

    const balanceDue = invoice.balanceDue.sub(amount);
    const stillOverdue = Boolean(invoice.dueDate && invoice.dueDate < new Date());
    await db.invoice.update({
      where: { id: dto.invoiceId },
      data: {
        balanceDue,
        status: balanceDue.isZero()
          ? 'PAID'
          : stillOverdue
            ? 'OVERDUE'
            : 'PARTIALLY_PAID',
      },
    });

    return receipt;
  }

  /**
   * Called by ReceivablesSchedulerService (apps/api) once per invoice that
   * ReceivablesService.listInvoicesBecomingOverdue() found - keeps the
   * EMAIL_SENDER port encapsulated in this module (it's not exported)
   * instead of every caller needing to know the token exists.
   */
  async sendOverdueInvoiceAlert(
    invoice: Pick<Invoice, 'documentLetter' | 'number' | 'balanceDue' | 'dueDate'>,
    customerEmail: string,
    senderIdentity: { from?: string; tone?: ReminderTone; cc?: string },
  ): Promise<void> {
    await this.emailSender.sendOverdueAlertEmail({
      to: customerEmail,
      invoiceNumber: `${invoice.documentLetter}-${invoice.number}`,
      balanceDue: invoice.balanceDue.toFixed(2),
      dueDate: invoice.dueDate?.toLocaleDateString('es-AR') ?? '',
      from: senderIdentity.from,
      tone: senderIdentity.tone,
      cc: senderIdentity.cc,
    });
  }

  private async resolveExchangeRate(currency: Currency): Promise<Prisma.Decimal> {
    if (currency.isBase) {
      return new Prisma.Decimal(1);
    }
    const latest = await getTenantDb().exchangeRateHistory.findFirst({
      where: { currencyId: currency.id },
      orderBy: { effectiveAt: 'desc' },
    });
    if (!latest) {
      throw new BadRequestException(`No exchange rate on file for currency ${currency.code}`);
    }
    return latest.rate;
  }

  /** rate feeds the normal "% over line amount" math either way; kind says
   * where that line's netAmount ends up in the AFIP request - GRAVADO (the
   * only option before EXENTO/NO_GRAVADO existed) inside Iva[]/ImpNeto like
   * always, the other two inside ImpOpEx/ImpTotConc instead (see
   * groupTaxLines/AfipWsfeClient). EXENTO/NO_GRAVADO always carry rate=0 -
   * they have no percentage by definition, TaxDefinition.rate is ignored
   * for them even if someone set one. */
  private resolveLineTax(taxDefinition: TaxDefinition | null): { rate: Prisma.Decimal; kind: TaxLineKind } {
    if (!taxDefinition) {
      return { rate: new Prisma.Decimal(0), kind: 'GRAVADO' };
    }
    if (taxDefinition.calculationType === 'EXENTO') {
      return { rate: new Prisma.Decimal(0), kind: 'EXENTO' };
    }
    if (taxDefinition.calculationType === 'NO_GRAVADO') {
      return { rate: new Prisma.Decimal(0), kind: 'NO_GRAVADO' };
    }
    if (taxDefinition.calculationType === 'FORMULA') {
      // Not evaluated here on purpose - a formula-based tax needs a
      // vetted, sandboxed evaluator (never eval()/new Function() over
      // tenant-supplied text) before it's safe to run against real
      // invoices. See the module README note on TaxDefinition for the
      // recommended design.
      throw new BadRequestException(
        `Tax definition ${taxDefinition.code} uses FORMULA, which isn't wired up yet`,
      );
    }
    if (taxDefinition.calculationType === 'FIXED_AMOUNT') {
      // Not a %, so it can't share this "rate over line amount" math -
      // needs its own additive code path before it's safe to support.
      throw new BadRequestException(
        `Tax definition ${taxDefinition.code} uses FIXED_AMOUNT, which isn't wired up yet`,
      );
    }
    return { rate: taxDefinition.rate ?? new Prisma.Decimal(0), kind: 'GRAVADO' };
  }

  /** Override de línea (CreateInvoiceLineDto.taxKind/taxRate) en vez del
   * catálogo - mismas reglas que resolveLineTax: EXENTO/NO_GRAVADO siempre
   * tasa 0 aunque el DTO haya mandado un taxRate (el DTO ya lo valida así,
   * esto es el mismo criterio del lado del cálculo). Sin taxKind explícito
   * pero con taxRate, se asume GRAVADO. */
  private resolveLineTaxOverride(
    taxKind: TaxLineKind | undefined,
    taxRate: number | undefined,
  ): { rate: Prisma.Decimal; kind: TaxLineKind } {
    const kind = taxKind ?? 'GRAVADO';
    if (kind === 'EXENTO' || kind === 'NO_GRAVADO') {
      return { rate: new Prisma.Decimal(0), kind };
    }
    return { rate: new Prisma.Decimal(taxRate ?? 0), kind: 'GRAVADO' };
  }

  /** Collapses per-line (rate, netAmount, taxAmount) rows into one entry per
   * distinct rate - AFIP's FECAESolicitar wants IVA discriminated by
   * alicuota (Iva[]), not one row per invoice line. */
  private groupTaxLines(
    rows: { taxRate: Prisma.Decimal; netAmount: Prisma.Decimal; taxAmount: Prisma.Decimal }[],
  ): ElectronicInvoiceTaxLine[] {
    const byRate = new Map<string, ElectronicInvoiceTaxLine>();
    for (const row of rows) {
      const key = row.taxRate.toFixed(2);
      const existing = byRate.get(key);
      if (existing) {
        existing.netAmount = existing.netAmount.add(row.netAmount);
        existing.taxAmount = existing.taxAmount.add(row.taxAmount);
      } else {
        byRate.set(key, { rate: row.taxRate, netAmount: row.netAmount, taxAmount: row.taxAmount });
      }
    }
    return Array.from(byRate.values());
  }

  /**
   * Número del próximo comprobante de la secuencia según ARCA (último
   * autorizado + 1), no según lo que Oplex tiene guardado: ARCA es la que
   * valida la correlatividad (error 10016 si no coincide).
   *
   * El advisory lock serializa, hasta el fin de la transacción, a todo el
   * que numere la misma secuencia del mismo tenant: dos cajas facturando a
   * la vez leerían el mismo "último" y una sería rechazada. Como el CAE se
   * pide al final del request (beforeCommit), el número queda reservado
   * desde acá hasta el commit, y si el request falla antes del CAE el
   * número se libera sin haber tocado ARCA.
   *
   * Si ARCA va adelantado respecto de Oplex, hay comprobantes autorizados
   * que Oplex no tiene: se registran y se avisa (recordUnregisteredVouchers)
   * en vez de saltearlos en silencio.
   */
  private async reserveVoucherNumber(sequence: VoucherSequence): Promise<string> {
    const db = getTenantDb();
    const tenantId = getTenantId();
    const lockKey = `arca-numbering:${tenantId}:${sequence.kind}:${sequence.documentLetter}:${sequence.pointOfSale}`;
    await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;

    const arcaLast = await this.electronicInvoicing.lastAuthorizedNumber(sequence);
    const localLast = await this.lastLocalNumber(sequence);
    if (arcaLast > localLast) {
      await this.recordUnregisteredVouchers(sequence, localLast + 1, arcaLast);
    }

    const number = String(arcaLast + 1).padStart(8, '0');
    const taken =
      sequence.kind === 'FACTURA'
        ? await db.invoice.findFirst({
            where: { pointOfSale: sequence.pointOfSale, documentLetter: sequence.documentLetter, number },
            select: { id: true },
          })
        : await db.creditNote.findFirst({
            where: { pointOfSale: sequence.pointOfSale, documentLetter: sequence.documentLetter, number },
            select: { id: true },
          });
    if (taken) {
      // Oplex tiene un comprobante con un número que ARCA todavía no
      // autorizó: datos viejos sin CAE real (p. ej. de antes de conectar
      // ARCA) o un certificado de otro ambiente. Nunca pisarlo.
      throw new BadRequestException(
        `No se puede numerar el comprobante: ARCA informa como último autorizado el ${String(arcaLast).padStart(8, '0')} en el punto de venta ${sequence.pointOfSale}, pero Oplex ya tiene registrado el ${number}. Revisá que el certificado ARCA sea del ambiente correcto (homologación o producción).`,
      );
    }
    return number;
  }

  private async lastLocalNumber(sequence: VoucherSequence): Promise<number> {
    const db = getTenantDb();
    const where = { pointOfSale: sequence.pointOfSale, documentLetter: sequence.documentLetter };
    // number es texto con ceros a la izquierda (8 dígitos): el orden
    // alfabético coincide con el numérico.
    const last =
      sequence.kind === 'FACTURA'
        ? await db.invoice.findFirst({ where, orderBy: { number: 'desc' }, select: { number: true } })
        : await db.creditNote.findFirst({ where, orderBy: { number: 'desc' }, select: { number: true } });
    // También los que ARCA tiene y Oplex no (huérfanos ya registrados y las
    // notas de crédito que Oplex emitió para anularlos): sin esto, la nota
    // de crédito de una anulación aparecería como huérfana en la siguiente.
    const known = await db.arcaUnregisteredVoucher.findFirst({
      where: { ...where, kind: sequence.kind },
      orderBy: { number: 'desc' },
      select: { number: true },
    });
    return Math.max(last ? Number.parseInt(last.number, 10) : 0, known ? Number.parseInt(known.number, 10) : 0);
  }

  /**
   * "Comprobantes de ARCA sin registrar" (Facturación, mockup aprobado
   * 2026-10-02): pendientes y resueltos, más nuevos primero. Las notas de
   * crédito que Oplex emitió para anular uno (resolution CANCELLATION) no se
   * listan aparte - figuran en la fila que anularon (cancelledBy*).
   */
  async listUnregisteredVouchers() {
    const db = getTenantDb();
    const rows = await db.arcaUnregisteredVoucher.findMany({
      where: { OR: [{ resolution: null }, { resolution: { not: 'CANCELLATION' } }] },
      orderBy: [{ detectedAt: 'desc' }, { number: 'desc' }],
    });
    const userIds = [...new Set(rows.map((r) => r.resolvedByUserId).filter((id): id is string => !!id))];
    const users = userIds.length
      ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } })
      : [];
    const userName = new Map(users.map((u) => [u.id, u.name?.trim() || u.email]));
    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      documentLetter: row.documentLetter,
      pointOfSale: row.pointOfSale,
      number: row.number,
      cae: row.cae,
      issueDate: row.issueDate?.toISOString() ?? null,
      total: row.total?.toFixed(2) ?? null,
      customerDocNumber: row.customerDocNumber,
      detectedAt: row.detectedAt.toISOString(),
      resolvedAt: row.resolvedAt?.toISOString() ?? null,
      resolvedByName: row.resolvedByUserId ? (userName.get(row.resolvedByUserId) ?? null) : null,
      resolution: row.resolution,
      resolutionNote: row.resolutionNote,
      cancelledByNumber: row.cancelledByNumber,
      cancelledByCae: row.cancelledByCae,
    }));
  }

  /** "Marcar como resuelto": no emite nada en ARCA, sólo deja el motivo. */
  async resolveUnregisteredVoucher(id: string, input: { reason: 'OTHER_SYSTEM' | 'TEST' | 'OTHER'; note?: string }) {
    const row = await this.lockPendingUnregisteredVoucher(id);
    const note = input.note?.trim() || null;
    if (input.reason === 'OTHER' && !note) {
      throw new BadRequestException('Contá el motivo en la nota');
    }
    await getTenantDb().arcaUnregisteredVoucher.update({
      where: { id: row.id },
      data: { resolvedAt: new Date(), resolvedByUserId: getUserId(), resolution: input.reason, resolutionNote: note },
    });
  }

  /**
   * "Anular con nota de crédito": emite en ARCA una nota de crédito por el
   * total, asociada a la factura huérfana y con los mismos importes que ARCA
   * tiene de ella (FECompConsultar, no lo que Oplex creía: Oplex nunca la
   * registró). En los libros de Oplex no se toca nada - esa venta no está.
   * La nota de crédito queda como fila CANCELLATION de esta misma tabla para
   * que la numeración la cuente.
   */
  async cancelUnregisteredVoucher(id: string): Promise<{ creditNoteNumber: string; cae: string | null }> {
    const db = getTenantDb();
    const tenantId = getTenantId();
    const row = await this.lockPendingUnregisteredVoucher(id);
    if (row.kind !== 'FACTURA') {
      throw new BadRequestException(
        'Sólo se pueden anular facturas: una nota de crédito sin registrar se marca como resuelta',
      );
    }
    const label = `Factura ${row.documentLetter} ${row.pointOfSale}-${row.number}`;
    const invoiceSequence: VoucherSequence = {
      kind: 'FACTURA',
      documentLetter: row.documentLetter,
      pointOfSale: row.pointOfSale,
    };
    const voucher = await this.electronicInvoicing.getAuthorizedVoucher(invoiceSequence, Number.parseInt(row.number, 10));
    const detail = voucher.detail;
    if (!detail) {
      throw new BadRequestException(
        `ARCA informa datos de la ${label} que Oplex no sabe copiar (moneda, alícuota o tipo de documento): anulala desde ARCA y marcala como resuelta`,
      );
    }

    // CondicionIVAReceptorId: lo que informa ARCA; si no, la ficha del
    // cliente en Oplex (por CUIT). Nunca adivinarlo.
    let customerTaxCondition: string | null = null;
    let customerName: string | undefined;
    if (detail.condicionIvaReceptorId === null && detail.customerTaxId) {
      const digits = detail.customerTaxId.replace(/\D/g, '');
      const companies = await db.company.findMany({
        where: { taxId: { not: null } },
        select: { name: true, taxId: true, taxCondition: true },
      });
      const company = companies.find((c) => c.taxId?.replace(/\D/g, '') === digits);
      if (!company) {
        throw new BadRequestException(
          `La ${label} es a nombre del CUIT ${digits}, que no está cargado en Oplex: cargalo en Empresas (con "Buscar en ARCA") y reintentá`,
        );
      }
      customerTaxCondition = company.taxCondition;
      customerName = company.name;
    }

    const number = await this.reserveVoucherNumber({
      kind: 'NOTA_CREDITO',
      documentLetter: row.documentLetter,
      pointOfSale: row.pointOfSale,
    });
    const result: { creditNoteNumber: string; cae: string | null } = { creditNoteNumber: number, cae: null };
    // Mismo criterio que createCreditNote: el CAE al final del request.
    await beforeCommit(async () => {
      const { cae } = await this.electronicInvoicing.requestCae({
        kind: 'NOTA_CREDITO',
        documentLetter: row.documentLetter,
        concept: detail.concept,
        pointOfSale: row.pointOfSale,
        number,
        issueDate: new Date(),
        dueDate: null,
        customerTaxId: detail.customerTaxId,
        customerTaxCondition,
        condicionIvaReceptorId: detail.condicionIvaReceptorId ?? undefined,
        customerName,
        currencyCode: detail.currencyCode,
        exchangeRate: detail.exchangeRate,
        netAmount: detail.netAmount,
        exemptAmount: detail.exemptAmount,
        nonTaxedAmount: detail.nonTaxedAmount,
        taxAmount: detail.taxAmount,
        total: detail.total,
        taxLines: detail.taxLines,
        otherTaxes: detail.otherTaxes,
        associatedVoucher: { documentLetter: row.documentLetter, pointOfSale: row.pointOfSale, number: row.number },
      });
      const now = new Date();
      const userId = getUserId();
      await db.arcaUnregisteredVoucher.create({
        data: {
          tenantId,
          kind: 'NOTA_CREDITO',
          documentLetter: row.documentLetter,
          pointOfSale: row.pointOfSale,
          number,
          cae,
          issueDate: now,
          total: detail.total,
          customerDocNumber: detail.customerTaxId ?? '0',
          resolvedAt: now,
          resolvedByUserId: userId,
          resolution: 'CANCELLATION',
          resolutionNote: `Anula la ${label}`,
        },
      });
      await db.arcaUnregisteredVoucher.update({
        where: { id: row.id },
        data: {
          resolvedAt: now,
          resolvedByUserId: userId,
          resolution: 'CREDIT_NOTE',
          cancelledByNumber: number,
          cancelledByCae: cae,
        },
      });
      result.cae = cae;
    });
    return result;
  }

  /** Lock de la fila: dos personas anulando a la vez emitirían dos notas de
   * crédito para la misma factura. */
  private async lockPendingUnregisteredVoucher(id: string) {
    const db = getTenantDb();
    await db.$queryRaw`SELECT id FROM arca_unregistered_vouchers WHERE id = ${id} FOR UPDATE`;
    const row = await db.arcaUnregisteredVoucher.findUnique({ where: { id } });
    if (!row || row.resolution === 'CANCELLATION') {
      throw new NotFoundException('Comprobante no encontrado');
    }
    if (row.resolvedAt) {
      throw new BadRequestException('Este comprobante ya está resuelto');
    }
    return row;
  }

  /**
   * Deja registro de los comprobantes `from`..`to` que ARCA autorizó y
   * Oplex no tiene, y avisa a quien administra la facturación. Corre dentro
   * de la transacción de la venta en curso: si esa venta termina en
   * rollback, el registro también, pero se vuelve a detectar en la próxima
   * (ARCA sigue adelantado) - nunca se pierde.
   */
  private async recordUnregisteredVouchers(sequence: VoucherSequence, from: number, to: number): Promise<void> {
    const db = getTenantDb();
    const tenantId = getTenantId();
    const last = Math.min(to, from + MAX_UNREGISTERED_TO_RECORD - 1);
    const rows: Prisma.ArcaUnregisteredVoucherCreateManyInput[] = [];
    for (let n = from; n <= last; n++) {
      let details: AuthorizedVoucher | null = null;
      if (n - from < MAX_UNREGISTERED_TO_QUERY) {
        try {
          details = await this.electronicInvoicing.getAuthorizedVoucher(sequence, n);
        } catch (err) {
          // Sin los datos igual se registra: el número solo ya alcanza
          // para avisar y buscarlo en ARCA.
          this.logger.warn(`No se pudo consultar en ARCA el comprobante ${n}: ${(err as Error).message}`);
        }
      }
      rows.push({
        tenantId,
        kind: sequence.kind,
        documentLetter: sequence.documentLetter,
        pointOfSale: sequence.pointOfSale,
        number: String(n).padStart(8, '0'),
        cae: details?.cae ?? null,
        issueDate: details?.issueDate ?? null,
        total: details?.total ?? null,
        customerDocNumber: details?.customerDocNumber ?? null,
      });
    }
    await db.arcaUnregisteredVoucher.createMany({ data: rows, skipDuplicates: true });

    const label = sequence.kind === 'FACTURA' ? 'Factura' : 'Nota de crédito';
    const range =
      from === to
        ? `${label} ${sequence.documentLetter} ${sequence.pointOfSale}-${String(from).padStart(8, '0')}`
        : `${label} ${sequence.documentLetter} ${sequence.pointOfSale}-${String(from).padStart(8, '0')} a ${String(to).padStart(8, '0')}`;
    this.logger.warn(`Tenant ${tenantId}: ARCA tiene autorizados comprobantes que Oplex no registró: ${range}`);

    await notify({
      recipientUserIds: await userIdsWithRoles(['OWNER', 'ADMIN', 'ACCOUNTANT']),
      category: 'BILLING',
      type: 'arca.unregistered_voucher',
      message:
        from === to
          ? `ARCA tiene autorizada la **${range}**, que **no está registrada en Oplex**. Hay que registrarla o anularla con una nota de crédito.`
          : `ARCA tiene autorizados comprobantes que **no están registrados en Oplex**: **${range}**. Hay que registrarlos o anularlos con notas de crédito.`,
      link: '/invoicing?arca=pendientes',
    });
  }

  /** Función pura de la Agenda (Fase 2, ver docs/plan-agenda.md) - fuente
   * "Ventas/Facturación": la fecha del PRÓXIMO recordatorio recurrente de
   * cobranza (TenantSettings.arReminderIntervalDays), no el vencimiento
   * original de la factura (eso ya lo cubre ReceivablesService.
   * getCalendarEntries, fuente 'collect' - duplicarlo acá mostraría la
   * misma fecha dos veces bajo dos colores distintos). Vacío si el tenant
   * nunca activó recordatorios recurrentes (arReminderIntervalDays null,
   * default) o todavía no tiene fila en TenantSettings. */
  async getCalendarEntries(from: Date, to: Date): Promise<CalendarEntry[]> {
    const db = getTenantDb();
    const settings = await db.tenantSettings.findUnique({ where: { tenantId: getTenantId() } });
    const intervalDays = settings?.arReminderIntervalDays;
    if (!intervalDays) return [];

    const invoices = await db.invoice.findMany({
      where: { balanceDue: { gt: 0 }, status: 'OVERDUE' },
    });

    const entries: CalendarEntry[] = [];
    for (const invoice of invoices) {
      const base = invoice.lastOverdueReminderAt ?? invoice.dueDate;
      if (!base) continue;
      const nextReminder = new Date(base.getTime() + intervalDays * 24 * 60 * 60 * 1000);
      if (nextReminder < from || nextReminder > to) continue;
      entries.push({
        id: invoice.id,
        source: 'sale',
        title: invoice.customerName,
        date: nextReminder.toISOString(),
        amount: invoice.balanceDue.toNumber(),
        flow: 'in',
        ref: 'Recordatorio recurrente',
        editable: false,
        link: { module: 'invoice', id: invoice.id },
      });
    }
    return entries;
  }
}
