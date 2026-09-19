import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { getTenantDb, getTenantId, getUserId, Prisma } from '@plexo/database';
import type { PdfStyle, PurchaseDocumentStatus, PurchaseSendChannel } from '@plexo/database';
import type { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto.js';
import type { SendPurchaseOrderEmailDto } from './dto/send-purchase-order-email.dto.js';
import type { UpdatePurchaseOrderDto } from './dto/update-purchase-order.dto.js';
import { PURCHASE_EMAIL_SENDER, type PurchaseEmailSender } from './email/purchase-email-sender.port.js';
import { getReceivedQuantitiesByLine } from './goods-receipt.service.js';
import { buildPurchaseDocumentPdfData } from './pdf/build-pdf-data.js';
import { PdfGeneratorService } from './pdf/pdf-generator.service.js';
import { PurchaseNumberingService } from './purchase-numbering.service.js';

// Exported so QuoteRequestService.convert() can return the same shape
// when it creates a PurchaseOrder - the frontend's send dialog needs
// supplier.id/name/email right off that response, not just `lines`.
export const PURCHASE_ORDER_DETAIL_INCLUDE = {
  lines: { include: { articleVariant: { include: { article: true } } } },
  supplier: { select: { id: true, name: true, taxId: true, email: true, fiscalAddress: true } },
  quoteRequest: { select: { id: true, number: true } },
  currency: true,
  transportMode: true,
  paymentTerm: true,
  deliveryTime: true,
  createdBy: { select: { id: true, name: true, email: true } },
  // Remitos logged against this order - see GoodsReceiptService. Newest
  // first so the detail panel shows the latest delivery on top.
  receipts: {
    include: {
      // Pre-existing gap, found while building SupplierReturnModal (first
      // consumer to actually read this nested field from this specific
      // include path): this used to be a shallow `lines: true`, which
      // never nested purchaseOrderLine - fine for GoodsReceiptService.
      // create()'s own return value (that one uses a separate, correctly
      // deep RECEIPT_DETAIL_INCLUDE), but silently wrong here since
      // nothing had read receipt.lines[].purchaseOrderLine through THIS
      // path until now.
      lines: { include: { purchaseOrderLine: { select: { id: true, articleVariantId: true, unitCost: true } } } },
      receivedBy: { select: { id: true, name: true, email: true } },
      // Devoluciones a proveedor logged against this specific remito - see
      // SupplierReturnService. Nested one level deeper than receipts
      // because a return is always scoped to one receipt, never the whole
      // order (see that service's own doc comment on why).
      returns: {
        include: {
          lines: {
            include: {
              goodsReceiptLine: {
                include: { purchaseOrderLine: { include: { articleVariant: { include: { article: true } } } } },
              },
            },
          },
          returnedBy: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
    orderBy: { receivedAt: 'desc' },
  },
} satisfies Prisma.PurchaseOrderInclude;
const DETAIL_INCLUDE = PURCHASE_ORDER_DETAIL_INCLUDE;

const LIST_INCLUDE = {
  lines: true,
  // email needed so the "Enviada vía" hover card in the list can offer
  // "Reenviar por email" without a second fetch for the full detail.
  supplier: { select: { id: true, name: true, email: true } },
  currency: { select: { code: true } },
} satisfies Prisma.PurchaseOrderInclude;

type RawPurchaseOrderListRow = Prisma.PurchaseOrderGetPayload<{ include: typeof LIST_INCLUDE }>;
type RawPurchaseOrderDetail = Prisma.PurchaseOrderGetPayload<{ include: typeof DETAIL_INCLUDE }>;

/** Every PurchaseOrderLine, whatever shape it's fetched in, gains
 * receivedQuantity/pendingQuantity derived from GoodsReceiptLine - never
 * stored (see GoodsReceipt's schema comment on why: avoids a cached
 * counter that could drift). Used by list()/get() below and by
 * QuoteRequestService.convert() (a freshly-issued order has nothing
 * received yet, but the frontend type expects the fields regardless of
 * which endpoint produced the order). */
export async function attachReceivingInfo<T extends { id: string; quantity: Prisma.Decimal }>(
  lines: T[],
): Promise<(T & { receivedQuantity: Prisma.Decimal; pendingQuantity: Prisma.Decimal })[]> {
  const received = await getReceivedQuantitiesByLine(lines.map((l) => l.id));
  return lines.map((line) => {
    const receivedQuantity = received.get(line.id) ?? new Prisma.Decimal(0);
    return { ...line, receivedQuantity, pendingQuantity: line.quantity.sub(receivedQuantity) };
  });
}

// See QuoteRequestListRow's comment - tsc needs an explicit, nameable
// return type to emit a .d.ts for this method.
export type PurchaseOrderListRow = Omit<RawPurchaseOrderListRow, 'lines'> & {
  lines: Awaited<ReturnType<typeof attachReceivingInfo<RawPurchaseOrderListRow['lines'][number]>>>;
};
export type PurchaseOrderDetail = Omit<RawPurchaseOrderDetail, 'lines'> & {
  lines: Awaited<ReturnType<typeof attachReceivingInfo<RawPurchaseOrderDetail['lines'][number]>>>;
};

@Injectable()
export class PurchaseOrderService {
  constructor(
    private readonly numbering: PurchaseNumberingService,
    private readonly pdfGenerator: PdfGeneratorService,
    @Inject(PURCHASE_EMAIL_SENDER) private readonly emailSender: PurchaseEmailSender,
  ) {}

  async list(status?: PurchaseDocumentStatus, supplierId?: string): Promise<PurchaseOrderListRow[]> {
    const orders = await getTenantDb().purchaseOrder.findMany({
      where: { status, supplierId },
      include: LIST_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(
      orders.map(async (order) => ({ ...order, lines: await attachReceivingInfo(order.lines) })),
    );
  }

  async get(id: string): Promise<PurchaseOrderDetail> {
    const order = await this.findOrThrow(id);
    return { ...order, lines: await attachReceivingInfo(order.lines) };
  }

  async create(dto: CreatePurchaseOrderDto) {
    const db = getTenantDb();
    const tenantId = getTenantId();
    const userId = requireUserId();

    await this.validateReferences(dto);
    const number = await this.numbering.nextNumber('purchaseOrder');
    const total = dto.lines.reduce(
      (sum, line) => sum.add(new Prisma.Decimal(line.unitCost).mul(line.quantity)),
      new Prisma.Decimal(0),
    );

    return db.purchaseOrder.create({
      data: {
        tenantId,
        number,
        supplierId: dto.supplierId,
        currencyId: dto.currencyId,
        transportModeId: dto.transportModeId,
        paymentTermId: dto.paymentTermId,
        deliveryTimeId: dto.deliveryTimeId,
        notes: dto.notes,
        total,
        createdByUserId: userId,
        lines: {
          createMany: {
            data: dto.lines.map((line) => ({
              tenantId,
              articleVariantId: line.articleVariantId,
              quantity: line.quantity,
              unitCost: line.unitCost,
              notes: line.notes,
            })),
          },
        },
      },
      include: DETAIL_INCLUDE,
    });
  }

  async update(id: string, dto: UpdatePurchaseOrderDto) {
    const db = getTenantDb();
    const tenantId = getTenantId();
    const existing = await db.purchaseOrder.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Purchase order not found');
    }
    if (existing.status !== 'DRAFT') {
      throw new BadRequestException('Only a DRAFT purchase order can be edited');
    }

    await this.validateReferences(dto);

    let total = existing.total;
    if (dto.lines) {
      total = dto.lines.reduce(
        (sum, line) => sum.add(new Prisma.Decimal(line.unitCost).mul(line.quantity)),
        new Prisma.Decimal(0),
      );
      await db.purchaseOrderLine.deleteMany({ where: { purchaseOrderId: id } });
      await db.purchaseOrderLine.createMany({
        data: dto.lines.map((line) => ({
          tenantId,
          purchaseOrderId: id,
          articleVariantId: line.articleVariantId,
          quantity: line.quantity,
          unitCost: line.unitCost,
          notes: line.notes,
        })),
      });
    }

    return db.purchaseOrder.update({
      where: { id },
      data: {
        supplierId: dto.supplierId,
        currencyId: dto.currencyId,
        transportModeId: dto.transportModeId,
        paymentTermId: dto.paymentTermId,
        deliveryTimeId: dto.deliveryTimeId,
        notes: dto.notes,
        total,
      },
      include: DETAIL_INCLUDE,
    });
  }

  async cancel(id: string) {
    const db = getTenantDb();
    const existing = await db.purchaseOrder.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Purchase order not found');
    }
    if (existing.status === 'CANCELLED') {
      throw new BadRequestException('This purchase order is already cancelled');
    }
    return db.purchaseOrder.update({ where: { id }, data: { status: 'CANCELLED' } });
  }

  /** "Enviar por Email" in the send dialog - attaches the user's default
   * PDF style, marks sentAt/sentVia so the UI can show "Reenviar" instead
   * of "Enviar" afterward. Returns the updated order (not just void) so
   * the controller's @AuditEntity('purchaseOrder') logs a real diff
   * (status/sentAt/sentVia) instead of an empty one - the interceptor
   * diffs whatever the handler returns, it never re-fetches on its own.
   * `dto.to` lets the dialog target a specific Company.people contact's
   * own email instead of the institutional one - omitted, this is
   * unchanged from before (always the supplier's email on file). */
  async sendEmail(id: string, dto?: SendPurchaseOrderEmailDto) {
    const purchaseOrder = await this.findOrThrow(id);
    const toEmail = dto?.to || purchaseOrder.supplier.email;
    if (!toEmail) {
      throw new BadRequestException('This supplier has no email on file');
    }
    const { buffer, filename } = await this.generatePdf(id);
    await this.emailSender.sendPurchaseOrderEmail({
      to: toEmail,
      purchaseOrderNumber: purchaseOrder.number,
      supplierName: purchaseOrder.supplier.name,
      total: purchaseOrder.total.toString(),
      currencyCode: purchaseOrder.currency.code,
      pdfBuffer: buffer,
      pdfFilename: filename,
    });
    return this.markSent(id, 'EMAIL', {
      sentToEmail: toEmail,
      sentToContactName: dto?.contactName ?? null,
      sentToContactAvatarUrl: dto?.contactAvatarUrl ?? null,
    });
  }

  /** Server-side text so wording stays in one place (mirrors invoicing's
   * overdue-email-templates.ts) - the frontend just opens
   * `https://wa.me/{phone}?text=...`. There's no delivery receipt for this:
   * "sent" means the user confirmed they went through with it (see
   * markSentWhatsapp), not a verified read/delivery status. */
  async buildWhatsappLink(id: string, phone: string): Promise<{ url: string }> {
    const purchaseOrder = await this.findOrThrow(id);
    const digitsOnly = phone.replace(/[^0-9]/g, '');
    if (!digitsOnly) {
      throw new BadRequestException('Invalid WhatsApp number');
    }
    const message =
      `Hola ${purchaseOrder.supplier.name}, te enviamos la Orden de Compra ` +
      `${purchaseOrder.number} por un total de ${purchaseOrder.currency.code} ${purchaseOrder.total.toString()}. ` +
      `Adjuntamos el PDF con el detalle.`;
    return { url: `https://wa.me/${digitsOnly}?text=${encodeURIComponent(message)}` };
  }

  /** "Mensaje rápido" desde el badge "Enviada vía" - un nudge corto (una de
   * 5 plantillas o texto libre, ver PurchaseOrderFollowUpModal), no un
   * reenvío del documento: sin PDF adjunto, y a propósito no pasa por
   * markSent/sentAt/sentVia - esos campos representan cuándo se mandó *la
   * orden*, no cuándo se insistió por ella. findOrThrow sólo para validar
   * que la orden existe antes de gastar un envío real. */
  async sendFollowUpEmail(id: string, dto: { to: string; subject?: string; text: string }): Promise<void> {
    const purchaseOrder = await this.findOrThrow(id);
    await this.emailSender.sendFollowUpEmail({
      to: dto.to,
      subject: dto.subject?.trim() || `Seguimiento OC ${purchaseOrder.number}`,
      text: dto.text,
    });
  }

  async markSentWhatsapp(id: string, phone: string, contactName?: string, contactAvatarUrl?: string) {
    await this.findOrThrow(id);
    return this.markSent(id, 'WHATSAPP', {
      sentToPhone: phone,
      sentToContactName: contactName ?? null,
      sentToContactAvatarUrl: contactAvatarUrl ?? null,
    });
  }

  async generatePdf(id: string, style?: PdfStyle): Promise<{ buffer: Buffer; filename: string }> {
    const db = getTenantDb();
    const purchaseOrder = await this.findOrThrow(id);
    const tenant = await db.tenant.findUniqueOrThrow({ where: { id: getTenantId() } });
    const resolvedStyle = style ?? (await this.resolveRequesterPdfStyle());

    const data = buildPurchaseDocumentPdfData(
      'Orden de Compra',
      {
        number: purchaseOrder.number,
        createdAt: purchaseOrder.createdAt,
        notes: purchaseOrder.notes,
        total: purchaseOrder.total,
        currency: purchaseOrder.currency,
        supplier: purchaseOrder.supplier,
        transportMode: purchaseOrder.transportMode,
        paymentTerm: purchaseOrder.paymentTerm,
        deliveryTime: purchaseOrder.deliveryTime,
        lines: purchaseOrder.lines,
      },
      tenant,
    );

    const buffer = await this.pdfGenerator.generate(resolvedStyle, data);
    return { buffer, filename: `${purchaseOrder.number}.pdf` };
  }

  private async findOrThrow(id: string) {
    const purchaseOrder = await getTenantDb().purchaseOrder.findUnique({
      where: { id },
      include: DETAIL_INCLUDE,
    });
    if (!purchaseOrder) {
      throw new NotFoundException('Purchase order not found');
    }
    return purchaseOrder;
  }

  private markSent(
    id: string,
    channel: PurchaseSendChannel,
    recipient: {
      sentToEmail?: string | null;
      sentToPhone?: string | null;
      sentToContactName?: string | null;
      sentToContactAvatarUrl?: string | null;
    },
  ) {
    return getTenantDb().purchaseOrder.update({
      where: { id },
      data: { status: 'SENT', sentAt: new Date(), sentVia: channel, ...recipient },
      include: DETAIL_INCLUDE,
    });
  }

  private async resolveRequesterPdfStyle(): Promise<PdfStyle> {
    const userId = requireUserId();
    const user = await getTenantDb().user.findUniqueOrThrow({
      where: { id: userId },
      select: { purchaseDocumentPdfStyle: true },
    });
    return user.purchaseDocumentPdfStyle;
  }

  private async validateReferences(
    dto: Pick<
      CreatePurchaseOrderDto | UpdatePurchaseOrderDto,
      'supplierId' | 'currencyId' | 'transportModeId' | 'paymentTermId' | 'deliveryTimeId' | 'lines'
    >,
  ): Promise<void> {
    const db = getTenantDb();

    if (dto.supplierId) {
      const supplier = await db.company.findUnique({
        where: { id: dto.supplierId },
        include: { roles: true },
      });
      if (!supplier) {
        throw new NotFoundException('Supplier not found');
      }
      if (!supplier.active) {
        throw new BadRequestException('This supplier is inactive');
      }
      if (!supplier.roles.some((r) => r.role === 'SUPPLIER')) {
        throw new BadRequestException('This company is not flagged as a supplier');
      }
    }

    if (dto.currencyId) {
      const currency = await db.currency.findUnique({ where: { id: dto.currencyId } });
      if (!currency) {
        throw new NotFoundException('Currency not found');
      }
    }

    if (dto.transportModeId) {
      const found = await db.transportMode.findUnique({ where: { id: dto.transportModeId } });
      if (!found) {
        throw new NotFoundException('Transport mode not found');
      }
    }
    if (dto.paymentTermId) {
      const found = await db.paymentTerm.findUnique({ where: { id: dto.paymentTermId } });
      if (!found) {
        throw new NotFoundException('Payment term not found');
      }
    }
    if (dto.deliveryTimeId) {
      const found = await db.deliveryTime.findUnique({ where: { id: dto.deliveryTimeId } });
      if (!found) {
        throw new NotFoundException('Delivery time not found');
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
