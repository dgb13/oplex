import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConnectorService } from '@plexo/connectors';
import { getTenantDb, getTenantId, getUserId, type PaymentIntent, type Prisma } from '@plexo/database';
import type { Items } from 'mercadopago/dist/clients/commonTypes.js';
import { MercadoPagoConfigService } from './mercadopago-config.service.js';
import { MercadoPagoConnector } from './mercadopago.connector.js';
import { buildPaymentLinkQrDataUri } from './mercadopago-qr.util.js';
import { MercadoPagoPreferenceClient } from './mercadopago-preference.client.js';

export type PaymentLinkDocumentType = 'INVOICE' | 'QUOTE';

export interface CreatePaymentLinkInput {
  documentType: PaymentLinkDocumentType;
  documentId: string;
}

/** What the document lookup below needs, regardless of which table it
 * actually came from - keeps createPaymentLink's own body document-type
 * agnostic past this point. */
interface PayableDocument {
  amount: Prisma.Decimal;
  currencyCode: string;
  description: string;
}

@Injectable()
export class MercadoPagoPaymentService {
  constructor(
    private readonly connectorService: ConnectorService,
    private readonly connector: MercadoPagoConnector,
    private readonly preferenceClient: MercadoPagoPreferenceClient,
    private readonly config: MercadoPagoConfigService,
  ) {}

  /**
   * Idempotent by design: a second call for the same (documentType,
   * documentId, amount) while a PENDING intent from the first call is
   * still open returns that SAME intent instead of creating a second
   * preference - this is the real duplicate-prevention mechanism (not the
   * idempotencyKey sent to MP, which only guards a single call's own
   * network retries - see PaymentIntent's doc comment in schema.prisma).
   */
  async createPaymentLink(input: CreatePaymentLinkInput): Promise<PaymentIntent> {
    const document = await this.loadPayableDocument(input.documentType, input.documentId);

    const db = getTenantDb();
    const existing = await db.paymentIntent.findFirst({
      where: {
        documentType: input.documentType,
        documentId: input.documentId,
        status: 'PENDING',
        amount: document.amount,
      },
    });
    if (existing) {
      return existing;
    }

    const connectorRow = await this.connectorService.getConnector('MERCADO_PAGO');
    if (!connectorRow || connectorRow.status === 'DISCONNECTED' || connectorRow.status === 'PENDING') {
      throw new BadRequestException(
        'Esta empresa todavía no vinculó una cuenta de Mercado Pago - conectala desde la sección Mercado Pago antes de generar un link de cobro',
      );
    }
    if (connectorRow.status !== 'CONNECTED') {
      // EXPIRED/REVOKED/ERROR (Fase 6, 6.1/6.2): distinct from "never
      // connected" - this tenant WAS linked, something needs fixing on
      // their end, not a first-time setup. Same "Cobrar con Mercado
      // Pago" button in the UI is already gated on status === CONNECTED
      // (see GestionTab.tsx), so this only ever surfaces for a direct API
      // call bypassing that gate.
      throw new BadRequestException(
        'La conexión con Mercado Pago de esta empresa necesita reconectarse - hacelo desde la sección Mercado Pago antes de generar un link de cobro',
      );
    }

    const notificationUrl = this.config.webhookNotificationUrl(getTenantId());
    if (!notificationUrl) {
      throw new ServiceUnavailableException(
        'Mercado Pago no está configurado en este servidor - falta OAUTH_CALLBACK_BASE_URL',
      );
    }

    const accessToken = await this.connector.getValidAccessToken(connectorRow.id);

    // Created PENDING before calling MP so a failure on the MP call still
    // leaves the row in place for the caller to see the ERROR status,
    // rather than losing the attempt entirely.
    const paymentIntent = await db.paymentIntent.create({
      data: {
        tenantId: getTenantId(),
        connectorId: connectorRow.id,
        documentType: input.documentType,
        documentId: input.documentId,
        amount: document.amount,
        currency: document.currencyCode,
        idempotencyKey: randomUUID(),
        createdByUserId: getUserId(),
      },
    });

    const items: Items[] = [
      {
        id: input.documentId,
        title: document.description,
        quantity: 1,
        currency_id: document.currencyCode,
        unit_price: document.amount.toNumber(),
      },
    ];

    let preference;
    try {
      preference = await this.preferenceClient.createPreference(
        accessToken,
        { items, external_reference: paymentIntent.id, notification_url: notificationUrl },
        paymentIntent.idempotencyKey,
      );
    } catch (err) {
      await db.paymentIntent.update({ where: { id: paymentIntent.id }, data: { status: 'ERROR' } });
      throw err;
    }

    if (!preference.init_point) {
      await db.paymentIntent.update({ where: { id: paymentIntent.id }, data: { status: 'ERROR' } });
      throw new Error('Mercado Pago no devolvió init_point al crear la preferencia');
    }

    const qrCodeBase64 = await buildPaymentLinkQrDataUri(preference.init_point);

    return db.paymentIntent.update({
      where: { id: paymentIntent.id },
      data: { externalId: preference.id, initPoint: preference.init_point, qrCodeBase64 },
    });
  }

  async getPaymentLink(id: string): Promise<PaymentIntent> {
    const intent = await getTenantDb().paymentIntent.findUnique({ where: { id } });
    if (!intent) {
      throw new NotFoundException('Payment link not found');
    }
    return intent;
  }

  async cancelPaymentLink(id: string): Promise<PaymentIntent> {
    const intent = await this.getPaymentLink(id);
    if (intent.status !== 'PENDING') {
      throw new BadRequestException(`No se puede cancelar un link en estado ${intent.status}`);
    }
    return getTenantDb().paymentIntent.update({ where: { id }, data: { status: 'CANCELLED' } });
  }

  /**
   * QUOTE never has a `balanceDue` (see the enum/model's own doc comment
   * in schema.prisma - it's a budget, not a fiscal document with a
   * tracked payment), so "el monto a cobrar" is the whole `total`, and
   * only an already-ACCEPTED quote is payable at all (rejecting/cancelled
   * ones, or a still-open DRAFT nobody agreed to yet, aren't). INVOICE
   * uses the exact same open-balance criterion ReceivablesService already
   * uses everywhere (`balanceDue: { gt: 0 }`), not a status check - a
   * partially-paid invoice is still payable for the remainder.
   */
  private async loadPayableDocument(
    documentType: PaymentLinkDocumentType,
    documentId: string,
  ): Promise<PayableDocument> {
    const db = getTenantDb();

    if (documentType === 'INVOICE') {
      const invoice = await db.invoice.findUnique({
        where: { id: documentId },
        include: { currency: true },
      });
      if (!invoice) {
        throw new NotFoundException('Invoice not found');
      }
      if (invoice.balanceDue.lte(0)) {
        throw new BadRequestException('Esta factura no tiene saldo pendiente');
      }
      return {
        amount: invoice.balanceDue,
        currencyCode: invoice.currency.code,
        description: `Factura ${invoice.documentLetter} ${invoice.pointOfSale}-${invoice.number}`,
      };
    }

    const quote = await db.quote.findUnique({
      where: { id: documentId },
      include: { currency: true },
    });
    if (!quote) {
      throw new NotFoundException('Quote not found');
    }
    if (quote.status !== 'ACCEPTED') {
      throw new BadRequestException('Sólo se puede generar un link de cobro para una cotización aceptada');
    }
    return {
      amount: quote.total,
      currencyCode: quote.currency.code,
      description: `Cotización ${quote.number}`,
    };
  }
}
