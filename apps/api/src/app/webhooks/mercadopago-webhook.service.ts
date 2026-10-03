import { randomUUID } from 'node:crypto';
import { Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConnectorService } from '@plexo/connectors';
import {
  getTenantDb,
  getTenantId,
  getUserId,
  Prisma,
  PrismaService,
  withActingUser,
  withTenantContext,
  type ConnectorProvider,
} from '@plexo/database';
import {
  MercadoPagoConfigService,
  MercadoPagoConnector,
  MercadoPagoPaymentClient,
  MercadoPagoQrService,
  verifyMercadoPagoWebhookSignature,
} from '@plexo/mercadopago';
import { INVOICE_PAID, type InvoicePaidEvent } from '../dashboard/events.js';
import { SalesService } from '../sales/sales.service.js';

const PROVIDER: ConnectorProvider = 'MERCADO_PAGO';

export interface MercadoPagoWebhookInput {
  signatureHeader: string | undefined;
  requestId: string | undefined;
  dataId: string | undefined;
  type: string | undefined;
  tenantIdParam: string | undefined;
  payload: unknown;
}

/**
 * Composition root for Fase 4: the ONLY thing this adds on top of what
 * already exists is "how does a Mercado Pago notification turn into a
 * verified, idempotent call to SalesService.recordReceipt" - no new
 * accounting logic, no new Receipt/JournalEntry shape. Lives in apps/api
 * (not @plexo/mercadopago) for the same reason SalesService itself does:
 * it composes across modules (mercadopago + sales) that must never import
 * each other directly.
 */
@Injectable()
export class MercadoPagoWebhookService {
  private readonly logger = new Logger(MercadoPagoWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: MercadoPagoConfigService,
    private readonly connectorService: ConnectorService,
    private readonly mercadoPagoConnector: MercadoPagoConnector,
    private readonly paymentClient: MercadoPagoPaymentClient,
    private readonly salesService: SalesService,
    private readonly eventEmitter: EventEmitter2,
    private readonly qrService: MercadoPagoQrService,
  ) {}

  /**
   * Structural ordering, not incidental: signature validation is the
   * FIRST thing this does, before `tenantIdParam` is read for anything
   * beyond parsing - a request with a bad signature gets byte-for-byte
   * the same 401 whether `?client=` names a real tenant, a nonexistent
   * one, or is missing entirely. Nothing here may branch on tenant
   * existence before this check passes.
   */
  async handleNotification(input: MercadoPagoWebhookInput): Promise<void> {
    const secret = this.config.webhookSecret;
    const signatureOk =
      Boolean(secret) &&
      verifyMercadoPagoWebhookSignature({
        signatureHeader: input.signatureHeader,
        requestId: input.requestId,
        dataId: input.dataId,
        secret: secret as string,
      });

    if (!signatureOk) {
      // Fase 6 observability (6.4, "tasa de firmas inválidas"): logged as
      // its own WebhookEvent row rather than silently 401ing, so an
      // admin metric can actually count these. externalId falls back to
      // a fresh UUID when dataId is missing/blank so unrelated malformed
      // attempts never collide into the same row under the
      // (provider, externalId, type) unique constraint.
      //
      // KNOWN GAP, left for infra hardening (flagged in the PR, not
      // fixed here): this is an unauthenticated POST endpoint - every
      // invalid attempt is one DB insert, with no rate limiting in front
      // of it. A flood of bogus requests is both a write-amplification
      // and a "the invalid-signature metric itself gets noisy" problem.
      // Needs a rate limiter (e.g. at the reverse proxy, or a NestJS
      // throttler guard) in front of this route before it's internet-
      // facing at real scale - out of scope for this integration alone.
      await this.prisma.webhookEvent
        .create({
          data: {
            provider: PROVIDER,
            externalId: input.dataId || randomUUID(),
            type: input.type || 'unknown',
            requestId: input.requestId,
            signatureOk: false,
            tenantId: input.tenantIdParam,
            payload: (input.payload ?? {}) as Prisma.InputJsonValue,
            error: 'Invalid x-signature',
          },
        })
        .catch((err: unknown) => {
          // Logging the rejection must never be why the rejection itself
          // fails - same tolerance as ActivityLogInterceptor's own write.
          this.logger.warn(`Failed to log invalid webhook signature attempt: ${(err as Error).message}`);
        });
      throw new UnauthorizedException('Firma de Mercado Pago inválida');
    }

    // "Order (Mercado Pago)": cobro con QR en Caja. Llega sin ?client= (lo
    // manda la configuración de webhooks de la app, no una notification_url
    // por orden), así que el tenant sale del id de la orden - sólo MP y el
    // tenant que la creó lo conocen. Nada de esto toca la contabilidad: la
    // venta la confirma la Caja con PosService.checkout una vez acreditado.
    if (input.type === 'order' && input.dataId) {
      await this.handleQrOrder(input.dataId);
      return;
    }

    // Only "payment" notifications carry anything to reconcile - MP also
    // sends merchant_order/other types under the same URL. Ack without a
    // WebhookEvent row: there's nothing to deduplicate against later since
    // there's no accounting action tied to these.
    if (input.type !== 'payment' || !input.dataId) {
      return;
    }

    const existing = await this.prisma.webhookEvent.findUnique({
      where: { provider_externalId_type: { provider: PROVIDER, externalId: input.dataId, type: input.type } },
    });
    if (existing?.processed) {
      // Genuine duplicate delivery of an already-fully-reconciled event -
      // this is the "doble notificación = un solo asiento" guarantee.
      return;
    }

    const webhookEvent =
      existing ??
      (await this.prisma.webhookEvent.create({
        data: {
          provider: PROVIDER,
          externalId: input.dataId,
          type: input.type,
          requestId: input.requestId,
          signatureOk: true,
          tenantId: input.tenantIdParam,
          payload: (input.payload ?? {}) as Prisma.InputJsonValue,
        },
      }));

    if (!input.tenantIdParam) {
      // Can never be resolved by retrying - the notification URL simply
      // has no ?client= on it. Ack (ties off the WebhookEvent as an
      // error, not silently), don't ask MP to keep retrying forever.
      await this.prisma.webhookEvent.update({
        where: { id: webhookEvent.id },
        data: { error: 'Missing ?client=<tenantId> on notification_url' },
      });
      return;
    }

    try {
      const result = await withTenantContext(this.prisma, input.tenantIdParam, () =>
        this.reconcile(input.dataId as string),
      );
      // Only reached if the tenant-scoped transaction above committed -
      // marking processed here (a SEPARATE statement against the bare,
      // non-RLS WebhookEvent table) is what makes the whole thing
      // atomic-in-effect: a PAID PaymentIntent only ever coexists with
      // processed=true, never PAID+processed=false, because a thrown
      // error below rolls the tenant transaction back before this line
      // ever runs.
      await this.prisma.webhookEvent.update({
        where: { id: webhookEvent.id },
        data: { processed: true, processedAt: new Date() },
      });
      if (result?.invoicePaidEvent) {
        this.eventEmitter.emit(INVOICE_PAID, result.invoicePaidEvent);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.prisma.webhookEvent.update({ where: { id: webhookEvent.id }, data: { error: message } });
      this.logger.error(`Fallo al conciliar webhook de Mercado Pago (data.id=${input.dataId}): ${message}`);
      // Rethrow so the controller surfaces a non-2xx and MP retries -
      // processed stays false, so the retry re-enters this same method
      // and tries again from scratch (see the orphan-PaymentIntent case
      // in reconcile(), the concrete race this exists for).
      throw err;
    }
  }

  /**
   * Runs entirely inside the tenant transaction withTenantContext opened
   * above - every write here (paymentIntent.update, recordReceipt's
   * Receipt+JournalEntry, userActivityLog) shares that ONE transaction,
   * so a throw anywhere below (recordReceipt included) rolls back
   * everything this function already did, not just its own step. This is
   * the atomicity the review asked for: no code here opens its own
   * transaction, on purpose - see SalesService's own class doc comment
   * for the same guarantee already relied on elsewhere.
   */
  private async reconcile(dataId: string): Promise<{ invoicePaidEvent?: InvoicePaidEvent } | undefined> {
    const db = getTenantDb();

    const connector = await this.connectorService.getConnector(PROVIDER);
    if (!connector || connector.status !== 'CONNECTED') {
      // Terminal for now (Fase 6's proactive refresh doesn't exist yet) -
      // retrying won't reconnect the tenant's account by itself. Ack.
      return undefined;
    }

    const accessToken = await this.mercadoPagoConnector.getValidAccessToken(connector.id);
    const payment = await this.paymentClient.getPayment(accessToken, dataId);

    if (!payment.external_reference) {
      return undefined;
    }

    // external_reference IS the PaymentIntent.id set at creation (Fase 3) -
    // findFirst under getTenantDb() is RLS-scoped to THIS tenant only, so
    // an external_reference that belongs to another tenant's intent (a
    // guessed/replayed id, or a mismatched ?client=) resolves to null
    // here exactly as if it didn't exist - that's the multi-tenant
    // isolation guarantee, not a special case handled in code.
    const intent = await db.paymentIntent.findFirst({ where: { id: payment.external_reference } });
    if (!intent) {
      // Could be a genuine race (Fase 3's createPaymentLink hasn't
      // committed its PaymentIntent row yet when this notification
      // lands) as much as a garbage reference - throwing here (not
      // returning) keeps WebhookEvent.processed=false so a legitimate MP
      // retry gets a real second chance instead of the door being closed
      // on the very first attempt.
      throw new NotFoundException(`No PaymentIntent found for external_reference ${payment.external_reference}`);
    }

    if (intent.status !== 'PENDING') {
      // Already reconciled (PAID, any externalPaymentId), or a terminal
      // state from a prior notification (ERROR/CANCELLED/EXPIRED/
      // REFUNDED) - never re-run recordReceipt for a second time no
      // matter how many more notifications arrive for the same intent.
      return undefined;
    }

    if (payment.status !== 'approved') {
      // pending/in_process/rejected/etc - nothing to reconcile yet, this
      // intent stays PENDING for a later notification to pick up.
      return undefined;
    }

    const paymentAmount =
      payment.transaction_amount != null ? new Prisma.Decimal(payment.transaction_amount) : undefined;
    const amountMatches = Boolean(paymentAmount?.equals(intent.amount));
    const currencyMatches = payment.currency_id === intent.currency;
    if (!amountMatches || !currencyMatches) {
      // Defense against an altered amount/currency between preference
      // creation and payment - never asienta on a mismatch. Committed as
      // its own outcome (not a throw): retrying won't change what MP
      // already approved, so no retry is warranted either.
      await db.paymentIntent.update({ where: { id: intent.id }, data: { status: 'ERROR' } });
      this.logger.error(
        `Mercado Pago payment ${payment.id} amount/currency mismatch for intent ${intent.id}: ` +
          `expected ${intent.amount.toString()} ${intent.currency}, got ${payment.transaction_amount} ${payment.currency_id}`,
      );
      return undefined;
    }

    await db.paymentIntent.update({
      where: { id: intent.id },
      data: {
        status: 'PAID',
        externalPaymentId: String(payment.id),
        paidAt: payment.date_approved ? new Date(payment.date_approved) : new Date(),
        paymentRaw: payment as unknown as Prisma.InputJsonValue,
      },
    });

    if (intent.documentType !== 'INVOICE') {
      // QUOTE: informational only, per the Fase 3 decision - no
      // SalesService call, no journal entry, nothing else to do.
      return undefined;
    }

    // No acting user here (MP calls server-to-server), but the receipt's
    // JournalEntry needs an author - postJournalEntry throws without one.
    // Whoever generated the payment link is the natural owner of the
    // collection; createdByUserId is nullable, so fall back to the tenant's
    // OWNER rather than leave the payment unreconciled.
    const authorId =
      intent.createdByUserId ??
      (await db.user.findFirst({ where: { role: 'OWNER' }, orderBy: { createdAt: 'asc' }, select: { id: true } }))?.id;
    if (!authorId) {
      throw new NotFoundException('No user to author the Mercado Pago receipt journal entry');
    }

    await withActingUser(authorId, () =>
      this.salesService.recordReceipt({
        invoiceId: intent.documentId,
        amount: intent.amount.toNumber(),
        method: 'MERCADOPAGO',
      }),
    );

    await db.userActivityLog.create({
      data: {
        tenantId: getTenantId(),
        userId: getUserId(), // undefined - system-initiated, no acting user
        action: 'mercadopago.payment_received',
        outcome: 'SUCCESS',
        entityType: 'Invoice',
        entityId: intent.documentId,
        entityLabel: `Cobro Mercado Pago recibido - $${intent.amount.toString()}`,
      },
    });

    const invoice = await db.invoice.findUnique({ where: { id: intent.documentId } });

    return {
      invoicePaidEvent: {
        tenantId: getTenantId(),
        invoiceId: intent.documentId,
        amount: intent.amount.toString(),
        balanceDue: invoice?.balanceDue.toString() ?? '0',
        status: invoice?.status ?? 'PAID',
      },
    };
  }

  private async handleQrOrder(orderId: string): Promise<void> {
    const rows = await this.prisma.$queryRaw<{ tenant_id: string }[]>`
      SELECT tenant_id FROM find_payment_intent_tenant_by_external_id(${orderId})
    `;
    const tenantId = rows[0]?.tenant_id;
    if (!tenantId) {
      // An order Oplex never created (or a link payment's merchant order) -
      // nothing to sync, and retrying won't change that.
      return;
    }
    // syncFromWebhook le pregunta a MP el estado real dentro de la transacción.
    await withTenantContext(this.prisma, tenantId, () => this.qrService.syncFromWebhook(orderId), undefined, undefined, 30_000);
  }
}
