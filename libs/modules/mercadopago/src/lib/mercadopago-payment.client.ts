import { Injectable } from '@nestjs/common';
import { MercadoPagoConfig, Payment } from 'mercadopago';
import type { PaymentResponse } from 'mercadopago/dist/clients/payment/commonTypes.js';
import type { PaymentSearch, PaymentSearchOptions } from 'mercadopago/dist/clients/payment/search/types.js';
import { retryMercadoPagoCall } from './mercadopago-retry.util.js';

/**
 * Thin wrapper around the SDK's Payment client - only `.get()` (the
 * webhook's follow-up `GET /v1/payments/:id`, since the notification
 * itself never carries a trustworthy final status - see plan section
 * 4.1/4.4). Same per-call-accessToken reasoning as
 * MercadoPagoPreferenceClient: this always authenticates as the TENANT
 * whose payment is being looked up, never OPLEX's own platform account.
 */
@Injectable()
export class MercadoPagoPaymentClient {
  /**
   * Throws (a MercadoPagoError subtype) on a non-2xx response - same
   * behavior already confirmed for OAuth/Preference.
   *
   * Wrapped in retryMercadoPagoCall (Fase 6 hardening): a transient
   * failure here must never turn into a silent "couldn't reconcile" -
   * MercadoPagoWebhookService's caller still sees the final error if all
   * retries fail, which keeps WebhookEvent.processed=false and the
   * response non-2xx, so MP's own webhook retry remains the real safety
   * net (see that service's doc comment on this exact guarantee).
   */
  getPayment(tenantAccessToken: string, paymentId: string): Promise<PaymentResponse> {
    return retryMercadoPagoCall(() => {
      const payment = new Payment(new MercadoPagoConfig({ accessToken: tenantAccessToken }));
      return payment.get({ id: paymentId });
    });
  }

  /** One page of GET /v1/payments/search as the tenant (sección Mercado
   * Pago, MercadoPagoPaymentsSyncService) - same retry wrapper as getPayment. */
  searchPayments(tenantAccessToken: string, options: PaymentSearchOptions): Promise<PaymentSearch> {
    return retryMercadoPagoCall(() => {
      const payment = new Payment(new MercadoPagoConfig({ accessToken: tenantAccessToken }));
      return payment.search({ options });
    });
  }
}
