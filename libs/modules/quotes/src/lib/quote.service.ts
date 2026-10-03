import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { getTenantDb, getTenantId, getUserId, Prisma, resolveCurrentTaxDefinition } from '@plexo/database';
import type { PdfStyle, QuoteSendChannel, QuoteStatus, TaxDefinition, TaxLineKind } from '@plexo/database';
import type { CreateQuoteDto } from './dto/create-quote.dto.js';
import type { QuoteLineDto } from './dto/quote-line.dto.js';
import type { UpdateQuoteDto } from './dto/update-quote.dto.js';
import { QUOTE_EMAIL_SENDER, type QuoteEmailSender } from './email/quote-email-sender.port.js';
import { buildQuotePdfData } from './pdf/build-pdf-data.js';
import { loadPdfImage } from './pdf/load-pdf-image.js';
import { PdfGeneratorService } from './pdf/pdf-generator.service.js';
import { QuoteNumberingService } from './quote-numbering.service.js';

const DETAIL_INCLUDE = {
  lines: { include: { articleVariant: { include: { article: true } } } },
  customer: {
    select: { id: true, name: true, taxId: true, email: true, fiscalAddress: true, taxCondition: true, phone: true },
  },
  contactPerson: { select: { id: true, firstName: true, lastName: true, email: true, whatsapp: true } },
  currency: true,
  createdBy: { select: { id: true, name: true, email: true } },
  // A lo sumo una (Invoice.quoteId es @@unique por tenant) - el frontend la
  // usa para mostrar "Ya facturada" en vez del botón "Convertir a factura".
  invoices: { select: { id: true, number: true } },
} satisfies Prisma.QuoteInclude;

const LIST_INCLUDE = {
  lines: true,
  customer: { select: { id: true, name: true, email: true } },
  currency: { select: { code: true } },
} satisfies Prisma.QuoteInclude;

export type QuoteListRow = Prisma.QuoteGetPayload<{ include: typeof LIST_INCLUDE }>;
export type QuoteDetail = Prisma.QuoteGetPayload<{ include: typeof DETAIL_INCLUDE }>;

/**
 * "Cotización" - a sales-side proposal to a customer, mirroring
 * @plexo/purchases' PurchaseOrderService (single-document lifecycle: no
 * separate "request → order" split like QuoteRequest/PurchaseOrder has,
 * since a customer-facing quote doesn't need that internal working-draft
 * step). DRAFT -> SENT (email/WhatsApp) -> ACCEPTED/REJECTED (the
 * customer's decision, recorded by hand) or CANCELLED at any point before
 * a decision.
 */
@Injectable()
export class QuoteService {
  constructor(
    private readonly numbering: QuoteNumberingService,
    private readonly pdfGenerator: PdfGeneratorService,
    @Inject(QUOTE_EMAIL_SENDER) private readonly emailSender: QuoteEmailSender,
  ) {}

  list(status?: QuoteStatus, customerId?: string): Promise<QuoteListRow[]> {
    return getTenantDb().quote.findMany({
      where: { status, customerId },
      include: LIST_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(id: string): Promise<QuoteDetail> {
    return this.findOrThrow(id);
  }

  async create(dto: CreateQuoteDto): Promise<QuoteDetail> {
    const db = getTenantDb();
    const tenantId = getTenantId();
    const userId = requireUserId();

    await this.validateReferences(dto);
    const number = await this.numbering.nextNumber();
    const { lineInputs, total } = await this.resolveLines(dto.lines, dto.pricesIncludeTax);
    const defaults = await db.tenantSettings.findUnique({
      where: { tenantId },
      select: {
        quoteDefaultPaymentTerms: true,
        quoteDefaultDeliveryTerms: true,
        quoteDefaultDeliveryPlace: true,
        quoteDefaultWarranty: true,
      },
    });

    return db.quote.create({
      data: {
        tenantId,
        number,
        customerId: dto.customerId,
        currencyId: dto.currencyId,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
        notes: dto.notes,
        paymentTerms: dto.paymentTerms ?? defaults?.quoteDefaultPaymentTerms,
        deliveryTerms: dto.deliveryTerms ?? defaults?.quoteDefaultDeliveryTerms,
        deliveryPlace: dto.deliveryPlace ?? defaults?.quoteDefaultDeliveryPlace,
        warranty: dto.warranty ?? defaults?.quoteDefaultWarranty,
        contactPersonId: dto.contactPersonId ?? undefined,
        total,
        createdByUserId: userId,
        lines: {
          createMany: { data: lineInputs.map((line) => ({ tenantId, ...line })) },
        },
      },
      include: DETAIL_INCLUDE,
    });
  }

  async update(id: string, dto: UpdateQuoteDto): Promise<QuoteDetail> {
    const db = getTenantDb();
    const tenantId = getTenantId();
    const existing = await db.quote.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Quote not found');
    }
    if (existing.status !== 'DRAFT') {
      throw new BadRequestException('Only a DRAFT quote can be edited');
    }

    await this.validateReferences(dto, existing.customerId);

    let total = existing.total;
    if (dto.lines) {
      const resolved = await this.resolveLines(dto.lines, dto.pricesIncludeTax);
      total = resolved.total;
      await db.quoteLine.deleteMany({ where: { quoteId: id } });
      await db.quoteLine.createMany({
        data: resolved.lineInputs.map((line) => ({ tenantId, quoteId: id, ...line })),
      });
    }

    return db.quote.update({
      where: { id },
      data: {
        customerId: dto.customerId,
        currencyId: dto.currencyId,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
        notes: dto.notes,
        paymentTerms: dto.paymentTerms,
        deliveryTerms: dto.deliveryTerms,
        deliveryPlace: dto.deliveryPlace,
        warranty: dto.warranty,
        contactPersonId: dto.contactPersonId,
        total,
      },
      include: DETAIL_INCLUDE,
    });
  }

  /** Resuelve precio/alícuota por línea - override del DTO si vino, si no
   * el catálogo (Article.taxDefinition, mismo criterio que
   * InvoicingService.resolveLineTax, duplicado acá a propósito: un lib
   * module nunca importa el Service de otro módulo, mismo idioma ya usado
   * para QuoteSendChannel/PurchaseSendChannel). Con pricesIncludeTax, el
   * unitPrice del DTO se interpreta como precio final y se desglosa a neto
   * acá mismo - una línea EXENTO/NO_GRAVADO tiene taxRate=0, así que el
   * desglose es un no-op para ellas. Sin descuento global (a diferencia de
   * Facturación), sólo la bonificación de cada línea: netAmount ya la tiene
   * descontada y lineTotal es netAmount+taxAmount de esa línea sola. */
  private async resolveLines(
    lines: QuoteLineDto[],
    pricesIncludeTax: boolean | undefined,
  ): Promise<{
    lineInputs: Omit<Prisma.QuoteLineCreateManyInput, 'tenantId' | 'quoteId'>[];
    total: Prisma.Decimal;
  }> {
    const db = getTenantDb();
    const lineInputs: Omit<Prisma.QuoteLineCreateManyInput, 'tenantId' | 'quoteId'>[] = [];
    let total = new Prisma.Decimal(0);
    // Un emisor Monotributo/Exento factura C, sin IVA: la cotización tampoco
    // lo suma (la cotización todavía no tiene letra - se decide por la
    // condición del tenant, la misma que fija la C al facturar).
    const settings = await db.tenantSettings.findUnique({
      where: { tenantId: getTenantId() },
      select: { ownTaxCondition: true },
    });
    const withoutVat = settings?.ownTaxCondition === 'MONOTRIBUTO' || settings?.ownTaxCondition === 'EXENTO';

    for (const line of lines) {
      const variant = await db.articleVariant.findUnique({
        where: { id: line.articleVariantId },
        include: { article: { include: { taxDefinition: true } } },
      });
      if (!variant) {
        throw new NotFoundException(`Article variant ${line.articleVariantId} not found`);
      }

      // Mismo criterio que InvoicingService.createInvoice: la versión del
      // impuesto vigente hoy, no la guardada en el artículo.
      const { rate: taxRate, kind: taxKind } = withoutVat
        ? { rate: new Prisma.Decimal(0), kind: 'GRAVADO' as TaxLineKind }
        : line.taxKind !== undefined || line.taxRate !== undefined
          ? this.resolveLineTaxOverride(line.taxKind, line.taxRate)
          : this.resolveLineTax(await resolveCurrentTaxDefinition(db, variant.article.taxDefinition));

      const rawUnitPrice = new Prisma.Decimal(line.unitPrice);
      const unitPrice =
        pricesIncludeTax && taxRate.gt(0)
          ? rawUnitPrice.div(new Prisma.Decimal(1).add(taxRate.div(100)))
          : rawUnitPrice;

      const quantity = new Prisma.Decimal(line.quantity);
      const discountPercent = new Prisma.Decimal(line.discountPercent ?? 0);
      const netAmount = unitPrice.mul(quantity).mul(new Prisma.Decimal(100).sub(discountPercent)).div(100);
      const taxAmount = taxKind === 'GRAVADO' ? netAmount.mul(taxRate).div(100) : new Prisma.Decimal(0);
      const lineTotal = netAmount.add(taxAmount);

      total = total.add(lineTotal);
      lineInputs.push({
        articleVariantId: line.articleVariantId,
        quantity: line.quantity,
        unitPrice,
        notes: line.notes,
        discountPercent,
        taxRate,
        taxKind,
        netAmount,
        lineTotal,
      });
    }

    return { lineInputs, total };
  }

  /** Ver InvoicingService.resolveLineTax - mismo mapeo
   * TaxCalculationType->(rate,kind), duplicado a propósito (ver comentario
   * de resolveLines). FORMULA/FIXED_AMOUNT no están soportados acá tampoco
   * (ninguna de las dos tiene un evaluador seguro todavía). */
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
    if (taxDefinition.calculationType === 'FORMULA' || taxDefinition.calculationType === 'FIXED_AMOUNT') {
      throw new BadRequestException(
        `Tax definition ${taxDefinition.code} uses ${taxDefinition.calculationType}, which isn't wired up yet`,
      );
    }
    return { rate: taxDefinition.rate ?? new Prisma.Decimal(0), kind: 'GRAVADO' };
  }

  /** Override de línea (QuoteLineDto.taxKind/taxRate) en vez del catálogo -
   * ver InvoicingService.resolveLineTaxOverride, mismo criterio. */
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

  async cancel(id: string): Promise<QuoteDetail> {
    const existing = await this.findOrThrow(id);
    if (existing.status === 'CANCELLED') {
      throw new BadRequestException('This quote is already cancelled');
    }
    return getTenantDb().quote.update({ where: { id }, data: { status: 'CANCELLED' }, include: DETAIL_INCLUDE });
  }

  /** The customer's decision, recorded by hand - there's no automated
   * customer-facing acceptance flow (no portal), so this is always someone
   * on our side entering what the customer told them. Only meaningful once
   * the quote has actually been sent. */
  async accept(id: string): Promise<QuoteDetail> {
    return this.resolveDecision(id, 'ACCEPTED');
  }

  async reject(id: string): Promise<QuoteDetail> {
    return this.resolveDecision(id, 'REJECTED');
  }

  private async resolveDecision(id: string, status: 'ACCEPTED' | 'REJECTED'): Promise<QuoteDetail> {
    const existing = await this.findOrThrow(id);
    if (existing.status !== 'SENT') {
      throw new BadRequestException('Only a SENT quote can be accepted or rejected');
    }
    return getTenantDb().quote.update({ where: { id }, data: { status }, include: DETAIL_INCLUDE });
  }

  /** "Enviar por Email" - attaches the user's default PDF style, marks
   * sentAt/sentVia so the UI can show "Reenviar" instead of "Enviar"
   * afterward. Mirrors PurchaseOrderService.sendEmail exactly. */
  async sendEmail(id: string): Promise<QuoteDetail> {
    const quote = await this.findOrThrow(id);
    if (!quote.customer.email) {
      throw new BadRequestException('This customer has no email on file');
    }
    const { buffer, filename } = await this.generatePdf(id);
    await this.emailSender.sendQuoteEmail({
      to: quote.customer.email,
      quoteNumber: quote.number,
      customerName: quote.customer.name,
      total: quote.total.toString(),
      currencyCode: quote.currency.code,
      pdfBuffer: buffer,
      pdfFilename: filename,
    });
    return this.markSent(id, 'EMAIL');
  }

  /** Same "no delivery receipt" semantics as PurchaseOrderService.
   * buildWhatsappLink - the frontend just opens
   * `https://wa.me/{phone}?text=...`; "sent" means the user confirmed it
   * (see markSentWhatsapp), not a verified read/delivery status. */
  async buildWhatsappLink(id: string, phone: string): Promise<{ url: string }> {
    const quote = await this.findOrThrow(id);
    const digitsOnly = phone.replace(/[^0-9]/g, '');
    if (!digitsOnly) {
      throw new BadRequestException('Invalid WhatsApp number');
    }
    const message =
      `Hola ${quote.customer.name}, te enviamos la Cotización ` +
      `${quote.number} por un total de ${quote.currency.code} ${quote.total.toString()}. ` +
      `Adjuntamos el PDF con el detalle.`;
    return { url: `https://wa.me/${digitsOnly}?text=${encodeURIComponent(message)}` };
  }

  async markSentWhatsapp(id: string): Promise<QuoteDetail> {
    await this.findOrThrow(id);
    return this.markSent(id, 'WHATSAPP');
  }

  async generatePdf(id: string, style?: PdfStyle): Promise<{ buffer: Buffer; filename: string }> {
    const db = getTenantDb();
    const quote = await this.findOrThrow(id);
    const tenant = await db.tenant.findUniqueOrThrow({ where: { id: getTenantId() } });
    const settings = await db.tenantSettings.findUnique({ where: { tenantId: getTenantId() } });
    // Discriminar o no el IVA depende de la condición del emisor: sin ella
    // no hay forma correcta de armar el presupuesto (mismo criterio que
    // Facturación, que no emite sin la condición cargada).
    if (!settings?.ownTaxCondition) {
      throw new BadRequestException(
        'Cargá tu condición frente al IVA en Contabilidad → Conexión con ARCA → Datos de la empresa para generar cotizaciones',
      );
    }
    const resolvedStyle = style ?? (await this.resolveRequesterPdfStyle());

    const [logo, ...lineImages] = await Promise.all([
      loadPdfImage(settings.logoUrl),
      // Sólo Natural muestra fotos de artículos; las demás no las leen de disco.
      ...quote.lines.map((line) => (resolvedStyle === 'NATURAL' ? loadPdfImage(line.articleVariant.article.imageUrl) : null)),
    ]);

    const data = buildQuotePdfData(
      quote,
      { ...settings, name: tenant.name, taxId: tenant.taxId, ownTaxCondition: settings.ownTaxCondition },
      { logo, lineImages },
    );

    const buffer = await this.pdfGenerator.generate(resolvedStyle, data);
    return { buffer, filename: `${quote.number}.pdf` };
  }

  private async findOrThrow(id: string): Promise<QuoteDetail> {
    const quote = await getTenantDb().quote.findUnique({ where: { id }, include: DETAIL_INCLUDE });
    if (!quote) {
      throw new NotFoundException('Quote not found');
    }
    return quote;
  }

  private markSent(id: string, channel: QuoteSendChannel): Promise<QuoteDetail> {
    return getTenantDb().quote.update({
      where: { id },
      data: { status: 'SENT', sentAt: new Date(), sentVia: channel },
      include: DETAIL_INCLUDE,
    });
  }

  private async resolveRequesterPdfStyle(): Promise<PdfStyle> {
    const userId = requireUserId();
    const user = await getTenantDb().user.findUniqueOrThrow({
      where: { id: userId },
      select: { quotePdfStyle: true },
    });
    return user.quotePdfStyle;
  }

  private async validateReferences(
    dto: Pick<CreateQuoteDto | UpdateQuoteDto, 'customerId' | 'currencyId' | 'lines' | 'contactPersonId'>,
    currentCustomerId?: string,
  ): Promise<void> {
    const db = getTenantDb();

    if (dto.contactPersonId) {
      const person = await db.person.findUnique({ where: { id: dto.contactPersonId } });
      if (!person || person.companyId !== (dto.customerId ?? currentCustomerId)) {
        throw new BadRequestException('El contacto elegido no pertenece a este cliente');
      }
    }

    if (dto.customerId) {
      const customer = await db.company.findUnique({
        where: { id: dto.customerId },
        include: { roles: true },
      });
      if (!customer) {
        throw new NotFoundException('Customer not found');
      }
      if (!customer.active) {
        throw new BadRequestException('This customer is inactive');
      }
      if (!customer.roles.some((r) => r.role === 'CUSTOMER')) {
        throw new BadRequestException('This company is not flagged as a customer');
      }
    }

    if (dto.currencyId) {
      const currency = await db.currency.findUnique({ where: { id: dto.currencyId } });
      if (!currency) {
        throw new NotFoundException('Currency not found');
      }
    }

    if (dto.lines) {
      for (const line of dto.lines) {
        const variant = await db.articleVariant.findUnique({ where: { id: line.articleVariantId } });
        if (!variant) {
          throw new NotFoundException(`Article variant ${line.articleVariantId} not found`);
        }
      }
    }
  }
}

function requireUserId(): string {
  const userId = getUserId();
  if (!userId) {
    throw new BadRequestException('An authenticated user is required');
  }
  return userId;
}
