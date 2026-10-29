import { BadRequestException, Injectable } from '@nestjs/common';
import { ConnectorService } from '@plexo/connectors';
import { getTenantDb, getTenantId, Prisma } from '@plexo/database';
import type { PaymentResponse } from 'mercadopago/dist/clients/payment/commonTypes.js';
import type { PaymentSearchResult } from 'mercadopago/dist/clients/payment/search/types.js';
import { MercadoPagoPaymentClient } from './mercadopago-payment.client.js';
import { MercadoPagoConnector } from './mercadopago.connector.js';

const PROVIDER = 'MERCADO_PAGO' as const;
const PAGE_SIZE = 100;
// La documentación de MP no deja claro hasta qué offset pagina la búsqueda
// (A CONFIRMAR con una cuenta real, ver el plan). Para no depender de eso,
// cada tanto se corre la ventana: la próxima página arranca en la fecha de
// actualización del último pago visto, con offset 0 (el upsert absorbe los
// repetidos del borde).
const MAX_OFFSET = 1_000;
const FIRST_SYNC_DAYS = 90;
const OVERLAP_MS = 24 * 60 * 60 * 1000;
// Una sincronización a mano no puede colgar el request para siempre.
const MAX_PAGES_PER_SYNC = 20;

// Estados en los que MP efectivamente cobró: sólo ahí tiene sentido la
// comisión (bruto - neto). Un rechazado o pendiente trae neto 0.
const COLLECTED_STATUSES = new Set(['approved', 'refunded', 'charged_back', 'in_mediation']);

type MpPayment = PaymentSearchResult | PaymentResponse;

export interface MercadoPagoSyncResult {
  synced: number;
  lastSyncAt: Date;
  /** true si cortó por el tope de páginas: la próxima sigue desde ahí. */
  partial: boolean;
}

/**
 * Trae los pagos de la cuenta de Mercado Pago del tenant a
 * MercadoPagoPayment (sección Mercado Pago, etapa 2 de
 * plan-seccion-mercadopago.md). Corre siempre dentro del contexto del
 * tenant (getTenantDb): desde el botón "Actualizar movimientos", el
 * webhook y el cron de la noche.
 */
@Injectable()
export class MercadoPagoPaymentsSyncService {
  constructor(
    private readonly connectorService: ConnectorService,
    private readonly connector: MercadoPagoConnector,
    private readonly paymentClient: MercadoPagoPaymentClient,
  ) {}

  async sync(): Promise<MercadoPagoSyncResult> {
    const accessToken = await this.accessToken();
    const db = getTenantDb();
    const tenantId = getTenantId();
    const settings = await db.tenantSettings.findUnique({
      where: { tenantId },
      select: { mercadoPagoLastSyncAt: true },
    });

    const startedAt = new Date();
    let since = settings?.mercadoPagoLastSyncAt
      ? new Date(settings.mercadoPagoLastSyncAt.getTime() - OVERLAP_MS)
      : new Date(startedAt.getTime() - FIRST_SYNC_DAYS * OVERLAP_MS);
    let offset = 0;
    let synced = 0;
    let lastSeen: Date | null = null;

    for (let page = 0; page < MAX_PAGES_PER_SYNC; page++) {
      const result = await this.paymentClient.searchPayments(accessToken, {
        sort: 'date_last_updated',
        criteria: 'asc',
        range: 'date_last_updated',
        begin_date: since.toISOString(),
        end_date: startedAt.toISOString(),
        limit: PAGE_SIZE,
        offset,
      });
      const results = result.results ?? [];
      await this.upsertMany(results);
      synced += results.length;
      const last = results[results.length - 1]?.date_last_updated;
      if (last) lastSeen = new Date(last);

      const total = result.paging?.total ?? 0;
      offset += results.length;
      if (results.length < PAGE_SIZE || offset >= total) {
        await this.markSynced(startedAt);
        return { synced, lastSyncAt: startedAt, partial: false };
      }
      if (offset >= MAX_OFFSET && lastSeen) {
        since = lastSeen;
        offset = 0;
      }
    }

    // Tope de páginas: se guarda hasta dónde llegó, la próxima sigue de ahí.
    const reached = lastSeen ?? startedAt;
    await this.markSynced(reached);
    return { synced, lastSyncAt: reached, partial: true };
  }

  /** Los pagos creados en un rango (Control de cobros con Point: cada pocos
   * minutos mientras haya ventas con Point sin pago). No toca
   * mercadoPagoLastSyncAt: es una consulta corta aparte de la sincronización
   * de Movimientos. */
  async syncRange(begin: Date, end: Date): Promise<number> {
    const accessToken = await this.accessToken();
    let offset = 0;
    let synced = 0;
    for (let page = 0; page < MAX_PAGES_PER_SYNC; page++) {
      const result = await this.paymentClient.searchPayments(accessToken, {
        sort: 'date_created',
        criteria: 'asc',
        range: 'date_created',
        begin_date: begin.toISOString(),
        end_date: end.toISOString(),
        limit: PAGE_SIZE,
        offset,
      });
      const results = result.results ?? [];
      await this.upsertMany(results);
      synced += results.length;
      offset += results.length;
      if (results.length < PAGE_SIZE || offset >= (result.paging?.total ?? 0) || offset >= MAX_OFFSET) break;
    }
    return synced;
  }

  /** Un solo pago (webhook de un link): GET /v1/payments/{id} y upsert. */
  async syncOne(mpPaymentId: string): Promise<void> {
    const accessToken = await this.accessToken();
    const payment = await this.paymentClient.getPayment(accessToken, mpPaymentId);
    await this.upsertMany([payment]);
  }

  private async accessToken(): Promise<string> {
    const connector = await this.connectorService.getConnector(PROVIDER);
    if (!connector || connector.status !== 'CONNECTED') {
      throw new BadRequestException(
        'La cuenta de Mercado Pago de esta empresa no está conectada - conectala desde la sección Mercado Pago',
      );
    }
    return this.connector.getValidAccessToken(connector.id);
  }

  private async markSynced(at: Date): Promise<void> {
    await getTenantDb().tenantSettings.updateMany({
      where: { tenantId: getTenantId() },
      data: { mercadoPagoLastSyncAt: at },
    });
  }

  private async upsertMany(payments: MpPayment[]): Promise<void> {
    const valid = payments.filter((p) => p.id != null && p.date_created);
    if (valid.length === 0) return;
    const db = getTenantDb();
    const tenantId = getTenantId();

    // Cruce con nuestros cobros: el external_reference es el id del
    // PaymentIntent (links y órdenes de QR lo mandan así); si no, el id de
    // pago que guardó el webhook o la orden.
    const ids = valid.map((p) => String(p.id));
    const refs = valid.map((p) => p.external_reference).filter((r): r is string => !!r);
    const intents = await db.paymentIntent.findMany({
      where: { OR: [{ id: { in: refs } }, { externalPaymentId: { in: ids } }] },
      select: { id: true, externalPaymentId: true },
    });
    const intentById = new Set(intents.map((i) => i.id));
    const intentByPaymentId = new Map(intents.filter((i) => i.externalPaymentId).map((i) => [i.externalPaymentId, i.id]));

    for (const p of valid) {
      const mpPaymentId = String(p.id);
      const paymentIntentId =
        (p.external_reference && intentById.has(p.external_reference) ? p.external_reference : null) ??
        intentByPaymentId.get(mpPaymentId) ??
        null;
      const data = toRow(p, paymentIntentId);
      await db.mercadoPagoPayment.upsert({
        where: { tenantId_mpPaymentId: { tenantId, mpPaymentId } },
        create: { tenantId, mpPaymentId, ...data },
        update: data,
      });
    }
  }
}

/**
 * ¿El pago se hizo con un posnet Point? Lo marca point_of_interaction.type
 * (los QR llegan como "INSTORE" y los links como "CHECKOUT").
 * A CONFIRMAR con un pago real de Point: si Mercado Pago lo informa con
 * otro valor, se corrige sólo acá.
 */
export function isPointPayment(raw: unknown): boolean {
  const type = (raw as { point_of_interaction?: { type?: string } } | null)?.point_of_interaction?.type;
  return type === 'POINT';
}

function toDate(value: string | undefined | null): Date | null {
  return value ? new Date(value) : null;
}

/** Mapea un pago de MP a la fila local. Exportada para los tests. */
export function toRow(
  p: MpPayment,
  paymentIntentId: string | null,
): Omit<Prisma.MercadoPagoPaymentUncheckedCreateInput, 'tenantId' | 'mpPaymentId'> {
  const gross = p.transaction_amount ?? 0;
  const net = p.transaction_details?.net_received_amount;
  const status = p.status ?? 'unknown';
  const fee = COLLECTED_STATUSES.has(status) && net != null ? Math.max(gross - net, 0) : 0;
  return {
    status,
    statusDetail: p.status_detail ?? null,
    dateCreated: new Date(p.date_created as string),
    dateApproved: toDate(p.date_approved),
    dateLastUpdated: toDate(p.date_last_updated),
    paymentMethodId: p.payment_method_id ?? null,
    paymentTypeId: p.payment_type_id ?? null,
    installments: p.installments ?? null,
    currency: p.currency_id ?? 'ARS',
    grossAmount: new Prisma.Decimal(gross).toDecimalPlaces(2),
    feeAmount: new Prisma.Decimal(fee).toDecimalPlaces(2),
    netAmount: net != null ? new Prisma.Decimal(net).toDecimalPlaces(2) : null,
    refundedAmount: new Prisma.Decimal(p.transaction_amount_refunded ?? 0).toDecimalPlaces(2),
    moneyReleaseDate: toDate(p.money_release_date),
    moneyReleaseStatus: (p as { money_release_status?: string }).money_release_status ?? null,
    externalReference: p.external_reference ?? null,
    description: p.description ?? null,
    payerEmail: p.payer?.email ?? null,
    paymentIntentId,
    raw: p as unknown as Prisma.InputJsonValue,
  };
}
