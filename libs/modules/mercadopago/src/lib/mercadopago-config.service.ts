import { Injectable } from '@nestjs/common';

/**
 * Single place that reads MP_* env vars - same "isConfigured() instead of
 * throwing at boot" convention as OAuthConfigService (apps/api's Google/
 * Microsoft/Apple config): a tenant clicking "Conectar Mercado Pago" before
 * an ops person has loaded real MP credentials into this environment
 * should get a clear 400, not a 500 from a service that failed to
 * construct.
 *
 * MP_ACCESS_TOKEN is OPLEX's own platform-level MP access token (the
 * integrator's, not any tenant's) - the official SDK's OAuth client
 * requires a MercadoPagoConfig with an accessToken even to call
 * POST /oauth/token on a tenant's behalf (confirmed by reading the
 * installed `mercadopago` package's own oAuth/create implementation: it
 * sends `Authorization: Bearer <config.accessToken>` on that call). Not
 * listed in the plan's section 2.2 - a real requirement the SDK surfaced,
 * not something invented here.
 */
@Injectable()
export class MercadoPagoConfigService {
  get clientId(): string | undefined {
    return process.env['MP_CLIENT_ID'];
  }

  get clientSecret(): string | undefined {
    return process.env['MP_CLIENT_SECRET'];
  }

  get redirectUri(): string | undefined {
    return process.env['MP_OAUTH_REDIRECT_URI'];
  }

  get accessToken(): string | undefined {
    return process.env['MP_ACCESS_TOKEN'];
  }

  /** App-level secret (one per OPLEX application in MP's panel, not per
   * tenant) used to validate the x-signature HMAC on every webhook -
   * every tenant's Checkout Pro preferences are created under this same
   * client_id, so MP signs every notification with this same secret
   * regardless of which tenant's payment it's about. */
  get webhookSecret(): string | undefined {
    return process.env['MP_WEBHOOK_SECRET'];
  }

  isConfigured(): boolean {
    return Boolean(this.clientId && this.clientSecret && this.redirectUri && this.accessToken);
  }

  /**
   * Where MP should POST payment notifications for a preference (see
   * apps/api's MercadoPagoWebhookController). Reuses OAUTH_CALLBACK_BASE_URL ("public origin of
   * THIS api process", already documented in .env.example for the Google/
   * Microsoft OAuth callbacks) instead of a new env var - one place names
   * this server's public URL, not two. `?client=<tenantId>` is how the
   * webhook will identify which tenant's connector to use (see plan
   * section 4.2) since the notification body alone doesn't carry it.
   *
   * `source_news=webhooks`: without it MP sends the legacy IPN/Feed format
   * (`?topic=payment&id=...`, seen live 2026-09-30) whose x-signature does
   * not validate against the app's webhook secret - every real payment
   * notification got a 401. With it MP should send only the Webhooks
   * format (`type`/`data.id`), the one verifyMercadoPagoWebhookSignature
   * checks.
   */
  webhookNotificationUrl(tenantId: string): string | undefined {
    const base = process.env['OAUTH_CALLBACK_BASE_URL'];
    if (!base) {
      return undefined;
    }
    return `${base}/webhooks/mercadopago?client=${tenantId}&source_news=webhooks`;
  }
}
