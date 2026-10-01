import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConnectorService } from '@plexo/connectors';
import { getTenantDb, getTenantId, getUserId, Prisma, type PaymentIntent } from '@plexo/database';
import { MercadoPagoConnector } from './mercadopago.connector.js';
import { MercadoPagoApiError, MercadoPagoInStoreClient, type QrOrderResponse } from './mercadopago-instore.client.js';
import { buildPaymentLinkQrDataUri } from './mercadopago-qr.util.js';

export const POS_QR_DOCUMENT_TYPE = 'POS_QR';

/** Same 10 minutes as the approved mockup's countdown. */
const QR_ORDER_TTL_MINUTES = 10;

/** MP order statuses that end a QR charge for good. */
const TERMINAL_ORDER_STATUS: Record<string, 'PAID' | 'EXPIRED' | 'CANCELLED' | 'REFUNDED'> = {
  processed: 'PAID',
  expired: 'EXPIRED',
  canceled: 'CANCELLED',
  cancelled: 'CANCELLED',
  refunded: 'REFUNDED',
};

/** Payment-attempt statuses that mean "the customer tried and it failed" -
 * the order itself stays open, so the Caja can offer a new attempt. */
const REJECTED_PAYMENT_STATUS = new Set(['failed', 'rejected']);

export interface ActivateRegisterQrInput {
  streetName: string;
  streetNumber: string;
  cityName: string;
  stateName: string;
  latitude: number;
  longitude: number;
}

export interface RegisterQrSetup {
  active: boolean;
  qrImageUrl: string | null;
  qrTemplateUrl: string | null;
  registerName: string;
  branchName: string;
  /** true when the branch already has its MP store - the address below is
   * the one MP has, and activating another register reuses it. */
  storeExists: boolean;
  address: ActivateRegisterQrInput | (Omit<ActivateRegisterQrInput, 'latitude' | 'longitude'> & {
    latitude: null;
    longitude: null;
  });
}

export interface QrCharge {
  id: string;
  status: PaymentIntent['status'];
  /** Last payment attempt was rejected and the order is still open. */
  rejected: boolean;
  amount: string;
  qrCodeBase64: string | null;
  expiresAt: string | null;
  externalPaymentId: string | null;
}

/**
 * Cobro con QR presencial en Caja (API de órdenes de MP, modo híbrido):
 * el cliente escanea el QR de la pantalla o el impreso de la caja con la app
 * de Mercado Pago y paga el monto ya cargado.
 *
 * A QR charge is a PaymentIntent with documentType POS_QR and documentId =
 * the cash register: there is no invoice yet, the POS sale is only created
 * once the payment is credited (PosService.checkout consumes the charge via
 * consumeForSale). The intent's status is kept in sync two ways - the
 * "Order (Mercado Pago)" webhook AND the Caja polling getCharge() while it
 * waits - so a lost notification never leaves the cashier stuck.
 */
@Injectable()
export class MercadoPagoQrService {
  private readonly logger = new Logger(MercadoPagoQrService.name);

  constructor(
    private readonly connectorService: ConnectorService,
    private readonly connector: MercadoPagoConnector,
    private readonly client: MercadoPagoInStoreClient,
  ) {}

  listCities(stateName: string): Promise<string[]> {
    return this.client.listCities(stateName);
  }

  async getRegisterSetup(registerId: string): Promise<RegisterQrSetup> {
    const register = await this.loadRegister(registerId);
    const store = register.branch.mercadoPagoStore;
    return {
      active: Boolean(register.mpPosId),
      qrImageUrl: register.mpQrImageUrl,
      qrTemplateUrl: register.mpQrTemplateUrl,
      registerName: register.name,
      branchName: register.branch.name,
      storeExists: Boolean(store),
      address: store
        ? {
            streetName: store.streetName,
            streetNumber: store.streetNumber,
            cityName: store.cityName,
            stateName: store.stateName,
            latitude: store.latitude.toNumber(),
            longitude: store.longitude.toNumber(),
          }
        : { ...splitFiscalAddress(register.branch.fiscalAddress), latitude: null, longitude: null },
    };
  }

  /** Creates the branch's MP store the first time (later registers of the
   * same branch reuse it) and this register's MP POS, whose response carries
   * the fixed QR to print. */
  async activateRegister(registerId: string, input: ActivateRegisterQrInput): Promise<RegisterQrSetup> {
    try {
      return await this.doActivateRegister(registerId, input);
    } catch (err) {
      if (err instanceof MercadoPagoApiError && err.status >= 400 && err.status < 500) {
        throw new BadRequestException(`Mercado Pago rechazó los datos: ${describeMercadoPagoError(err)}`);
      }
      throw err;
    }
  }

  private async doActivateRegister(registerId: string, input: ActivateRegisterQrInput): Promise<RegisterQrSetup> {
    const register = await this.loadRegister(registerId);
    if (register.mpPosId) {
      throw new BadRequestException('El QR de esta caja ya está activo');
    }
    const { connectorId, accessToken, mpUserId } = await this.requireConnection();
    const db = getTenantDb();

    let store = register.branch.mercadoPagoStore;
    if (!store) {
      const externalId = `OPX${register.branchId.replace(/-/g, '')}`;
      const created =
        (await this.client.findStore(accessToken, mpUserId, externalId)) ??
        (await this.client.createStore(accessToken, mpUserId, {
        name: register.branch.name,
        external_id: externalId,
        location: {
          street_name: input.streetName,
          street_number: input.streetNumber,
          city_name: input.cityName,
          state_name: input.stateName,
          latitude: input.latitude,
          longitude: input.longitude,
        },
      }));
      store = await db.mercadoPagoStore.create({
        data: {
          tenantId: getTenantId(),
          branchId: register.branchId,
          mpStoreId: String(created.id),
          externalId,
          streetName: input.streetName,
          streetNumber: input.streetNumber,
          cityName: input.cityName,
          stateName: input.stateName,
          latitude: new Prisma.Decimal(input.latitude),
          longitude: new Prisma.Decimal(input.longitude),
        },
      });
    }

    const externalPosId = `OPX${register.id.replace(/-/g, '')}`;
    const pos =
      (await this.client.findPos(accessToken, externalPosId)) ??
      (await this.client.createPos(accessToken, {
        name: register.name,
        store_id: store.mpStoreId,
        external_id: externalPosId,
        config: { qr: { operating_mode: 'pdv' } },
      }));
    const qr = pos.qr_response ?? pos.qr;

    await db.cashRegister.update({
      where: { id: register.id },
      data: {
        mpPosId: String(pos.id),
        mpExternalPosId: externalPosId,
        mpQrImageUrl: qr?.image ?? null,
        mpQrTemplateUrl: qr?.template_document ?? null,
        mpQrActivatedAt: new Date(),
      },
    });
    this.logger.log(`QR activado en la caja ${register.id} (connector ${connectorId}, pos ${pos.id})`);
    return this.getRegisterSetup(register.id);
  }

  async deactivateRegister(registerId: string): Promise<RegisterQrSetup> {
    const register = await this.loadRegister(registerId);
    if (!register.mpPosId) {
      return this.getRegisterSetup(register.id);
    }
    try {
      const { accessToken } = await this.requireConnection();
      await this.client.deletePos(accessToken, register.mpPosId);
    } catch (err) {
      // Deactivating in Oplex must work even if MP refuses the delete (or the
      // account got disconnected): without mpExternalPosId no new order can
      // target this POS anyway.
      this.logger.warn(`No se pudo borrar la caja ${register.mpPosId} en Mercado Pago: ${(err as Error).message}`);
    }
    await getTenantDb().cashRegister.update({
      where: { id: register.id },
      data: { mpPosId: null, mpExternalPosId: null, mpQrImageUrl: null, mpQrTemplateUrl: null, mpQrActivatedAt: null },
    });
    return this.getRegisterSetup(register.id);
  }

  async createCharge(registerId: string, amount: number): Promise<QrCharge> {
    const register = await this.loadRegister(registerId);
    if (!register.mpExternalPosId) {
      throw new BadRequestException('Esta caja no tiene el QR de Mercado Pago activado');
    }
    const total = new Prisma.Decimal(amount).toDecimalPlaces(2);
    if (total.lte(0)) {
      throw new BadRequestException('El monto a cobrar tiene que ser mayor a cero');
    }
    const { connectorId, accessToken } = await this.requireConnection();
    const db = getTenantDb();

    // One open QR charge per register: a new one replaces whatever was left
    // waiting (the cashier closed the modal, changed the amount, etc.).
    const open = await db.paymentIntent.findMany({
      where: { documentType: POS_QR_DOCUMENT_TYPE, documentId: register.id, status: 'PENDING' },
    });
    for (const previous of open) {
      await this.cancelIntent(previous, accessToken);
    }

    const expiresAt = new Date(Date.now() + QR_ORDER_TTL_MINUTES * 60_000);
    const intent = await db.paymentIntent.create({
      data: {
        tenantId: getTenantId(),
        connectorId,
        documentType: POS_QR_DOCUMENT_TYPE,
        documentId: register.id,
        amount: total,
        currency: 'ARS',
        idempotencyKey: randomUUID(),
        createdByUserId: getUserId(),
        expiresAt,
      },
    });

    let order: QrOrderResponse;
    try {
      order = await this.client.createQrOrder(
        accessToken,
        {
          externalReference: intent.id,
          externalPosId: register.mpExternalPosId,
          totalAmount: total.toFixed(2),
          expirationTime: `PT${QR_ORDER_TTL_MINUTES}M`,
          description: `Venta ${register.name}`,
        },
        intent.idempotencyKey,
      );
    } catch (err) {
      await db.paymentIntent.update({ where: { id: intent.id }, data: { status: 'ERROR' } });
      if (err instanceof MercadoPagoApiError && err.status >= 400 && err.status < 500) {
        const detail = describeMercadoPagoError(err);
        const minimum = detail.match(/greater than or equal to ([d.]+)/);
        throw new BadRequestException(
          minimum
            ? `El monto mínimo para cobrar con QR de Mercado Pago es $${minimum[1]}`
            : `Mercado Pago no aceptó el cobro: ${detail}`,
        );
      }
      throw err;
    }

    const qrData = order.type_response?.qr_data;
    const updated = await db.paymentIntent.update({
      where: { id: intent.id },
      data: {
        externalId: order.id ?? null,
        externalStatus: describeOrderStatus(order),
        qrCodeBase64: qrData ? await buildPaymentLinkQrDataUri(qrData) : null,
      },
    });
    return toCharge(updated);
  }

  /** Polled by the Caja while it waits. Asks MP for the order's current
   * state when the charge is still open, so the cashier finds out even if
   * the webhook never arrives. */
  async getCharge(intentId: string): Promise<QrCharge> {
    let intent = await this.loadCharge(intentId);
    if (intent.status === 'PENDING' && intent.externalId) {
      const { accessToken } = await this.requireConnection();
      const order = await this.client.getOrder(accessToken, intent.externalId);
      intent = await this.applyOrder(intent, order);
    }
    return toCharge(intent);
  }

  async cancelCharge(intentId: string): Promise<QrCharge> {
    const intent = await this.loadCharge(intentId);
    if (intent.status !== 'PENDING') {
      return toCharge(intent);
    }
    const { accessToken } = await this.requireConnection();
    return toCharge(await this.cancelIntent(intent, accessToken));
  }

  /** "Order (Mercado Pago)" webhook, already inside the tenant's context -
   * the notification is never trusted for the status, MP is asked again. */
  async syncFromWebhook(orderId: string): Promise<void> {
    const intent = await getTenantDb().paymentIntent.findFirst({
      where: { externalId: orderId, documentType: POS_QR_DOCUMENT_TYPE },
    });
    if (!intent || intent.status !== 'PENDING') {
      return;
    }
    const { accessToken } = await this.requireConnection();
    const order = await this.client.getOrder(accessToken, orderId);
    await this.applyOrder(intent, order);
  }

  /** Called by PosService.checkout inside the sale's transaction: a credited
   * QR charge pays exactly one sale, of exactly its amount, on its register. */
  async consumeForSale(input: {
    intentId: string;
    registerId: string;
    amount: number;
    invoiceId: string;
  }): Promise<void> {
    const intent = await this.loadCharge(input.intentId);
    if (intent.documentId !== input.registerId) {
      throw new BadRequestException('Ese cobro QR es de otra caja');
    }
    if (intent.status !== 'PAID') {
      throw new BadRequestException('El cobro QR todavía no se acreditó');
    }
    if (intent.consumedByInvoiceId) {
      throw new BadRequestException('Ese cobro QR ya se usó en otra venta');
    }
    if (!intent.amount.eq(new Prisma.Decimal(input.amount).toDecimalPlaces(2))) {
      throw new BadRequestException(
        `El cobro QR es de $${intent.amount.toFixed(2)} y la fila de Mercado Pago dice $${input.amount.toFixed(2)}`,
      );
    }
    await getTenantDb().paymentIntent.update({
      where: { id: intent.id },
      data: { consumedByInvoiceId: input.invoiceId },
    });
  }

  private async applyOrder(intent: PaymentIntent, order: QrOrderResponse): Promise<PaymentIntent> {
    const db = getTenantDb();
    const terminal = order.status ? TERMINAL_ORDER_STATUS[order.status] : undefined;
    const externalStatus = describeOrderStatus(order);

    if (terminal === 'PAID') {
      const payment = order.transactions?.payments?.[0];
      return db.paymentIntent.update({
        where: { id: intent.id },
        data: {
          status: 'PAID',
          externalStatus,
          externalPaymentId: payment?.id ?? null,
          paidAt: new Date(),
          paymentRaw: order as unknown as Prisma.InputJsonValue,
        },
      });
    }
    if (terminal) {
      return db.paymentIntent.update({ where: { id: intent.id }, data: { status: terminal, externalStatus } });
    }
    if (intent.expiresAt && intent.expiresAt.getTime() < Date.now() - 60_000) {
      // MP should have expired it already; a minute of grace before Oplex
      // gives up on its own so the Caja never waits forever.
      return db.paymentIntent.update({ where: { id: intent.id }, data: { status: 'EXPIRED', externalStatus } });
    }
    if (externalStatus !== intent.externalStatus) {
      return db.paymentIntent.update({ where: { id: intent.id }, data: { externalStatus } });
    }
    return intent;
  }

  private async cancelIntent(intent: PaymentIntent, accessToken: string): Promise<PaymentIntent> {
    if (intent.externalId) {
      try {
        const order = await this.client.cancelOrder(accessToken, intent.externalId);
        const synced = await this.applyOrder(intent, order);
        if (synced.status !== 'PENDING') {
          return synced;
        }
      } catch (err) {
        // MP refuses to cancel an order that already moved on (paid in the
        // last second, or expired) - ask for its real state instead of
        // overwriting a payment with CANCELLED.
        this.logger.warn(`No se pudo cancelar la orden ${intent.externalId}: ${(err as Error).message}`);
        const order = await this.client.getOrder(accessToken, intent.externalId);
        const synced = await this.applyOrder(intent, order);
        if (synced.status !== 'PENDING') {
          return synced;
        }
      }
    }
    return getTenantDb().paymentIntent.update({ where: { id: intent.id }, data: { status: 'CANCELLED' } });
  }

  private async loadRegister(registerId: string) {
    const register = await getTenantDb().cashRegister.findUnique({
      where: { id: registerId },
      include: { branch: { include: { mercadoPagoStore: true } } },
    });
    if (!register) {
      throw new NotFoundException('Caja no encontrada');
    }
    return register;
  }

  private async loadCharge(intentId: string): Promise<PaymentIntent> {
    const intent = await getTenantDb().paymentIntent.findUnique({ where: { id: intentId } });
    if (!intent || intent.documentType !== POS_QR_DOCUMENT_TYPE) {
      throw new NotFoundException('Cobro QR no encontrado');
    }
    return intent;
  }

  private async requireConnection(): Promise<{ connectorId: string; accessToken: string; mpUserId: string }> {
    const row = await this.connectorService.getConnector('MERCADO_PAGO');
    if (!row || row.status !== 'CONNECTED' || !row.externalAccountId) {
      throw new BadRequestException(
        'La cuenta de Mercado Pago de esta empresa no está conectada - conectala desde Preferencias',
      );
    }
    const accessToken = await this.connector.getValidAccessToken(row.id);
    return { connectorId: row.id, accessToken, mpUserId: row.externalAccountId };
  }
}

/** MP's own validation text ("location.state_name was invalid. Valid values
 * are: ...") - it names the field, which is what the user needs to fix. */
function describeMercadoPagoError(err: MercadoPagoApiError): string {
  // Dos formatos: el clásico (causes[].description) y el de /v1/orders
  // (errors[].details[]).
  const body = err.body as
    | { message?: string; causes?: { description?: string }[]; errors?: { message?: string; details?: string[] }[] }
    | undefined;
  return (
    body?.causes?.[0]?.description ??
    body?.errors?.[0]?.details?.[0] ??
    body?.errors?.[0]?.message ??
    body?.message ??
    JSON.stringify(err.body)
  );
}

/** "<order status>|<last payment status>" - enough to tell a rejected
 * attempt apart from an order nobody has scanned yet. */
function describeOrderStatus(order: QrOrderResponse): string {
  const payment = order.transactions?.payments?.[0];
  return `${order.status ?? ''}|${payment?.status ?? ''}`;
}

function toCharge(intent: PaymentIntent): QrCharge {
  const paymentStatus = intent.externalStatus?.split('|')[1] ?? '';
  return {
    id: intent.id,
    status: intent.status,
    rejected: intent.status === 'PENDING' && REJECTED_PAYMENT_STATUS.has(paymentStatus),
    amount: intent.amount.toFixed(2),
    qrCodeBase64: intent.qrCodeBase64,
    expiresAt: intent.expiresAt?.toISOString() ?? null,
    externalPaymentId: intent.externalPaymentId,
  };
}

/** Best-effort prefill from Company.fiscalAddress ("Av. Corrientes 1234,
 * CABA") - the cashier fixes whatever this gets wrong in the form. */
export function splitFiscalAddress(fiscalAddress: string | null): {
  streetName: string;
  streetNumber: string;
  cityName: string;
  stateName: string;
} {
  const empty = { streetName: '', streetNumber: '', cityName: '', stateName: '' };
  if (!fiscalAddress) {
    return empty;
  }
  const [street = '', city = '', state = ''] = fiscalAddress.split(',').map((part) => part.trim());
  const match = street.match(/^(.*?)\s+(\d+[a-zA-Z]?)$/);
  return {
    streetName: match ? match[1] : street,
    streetNumber: match ? match[2] : '',
    cityName: city,
    stateName: state,
  };
}
