import { Injectable } from '@nestjs/common';
import { MercadoPagoConfig, Preference } from 'mercadopago';
import type { PreferenceRequest, PreferenceResponse } from 'mercadopago/dist/clients/preference/commonTypes.js';

/**
 * Thin wrapper around the official SDK's Checkout Pro Preference client -
 * same isolation reasoning as MercadoPagoOAuthClient (mockable without
 * touching the SDK, keeps the SDK dependency in one file per concern).
 *
 * Unlike MercadoPagoOAuthClient (always authenticates as OPLEX's own
 * platform account via MP_ACCESS_TOKEN), every call here authenticates as
 * the TENANT whose invoice/quote is being collected - `accessToken` is a
 * parameter, never read from config, because the whole point of the
 * marketplace OAuth flow (Fase 2) is that the money lands in the tenant's
 * own MP account, not OPLEX's. A fresh MercadoPagoConfig/Preference pair
 * is constructed per call for exactly this reason - there's no single
 * "the" access token to configure once.
 */
@Injectable()
export class MercadoPagoPreferenceClient {
  /** Throws (a MercadoPagoError subtype) on a non-2xx response - see the
   * installed package's RestClient.fetch, same behavior confirmed for the
   * OAuth client in Fase 2. */
  createPreference(
    tenantAccessToken: string,
    body: PreferenceRequest,
    idempotencyKey: string,
  ): Promise<PreferenceResponse> {
    const preference = new Preference(new MercadoPagoConfig({ accessToken: tenantAccessToken }));
    return preference.create({ body, requestOptions: { idempotencyKey } });
  }

  /** Vence la preferencia ya (al cancelar un link en Oplex): marca
   * `expires` con fecha de fin ahora, así el link deja de aceptar pagos.
   * El tipo del SDK pide `items` (es el mismo que para crear), pero el PUT
   * de MP actualiza sólo los campos que se mandan - A CONFIRMAR con una
   * cuenta real (ver plan-seccion-mercadopago.md, etapa 4); quien llama lo
   * hace a modo de mejor esfuerzo. */
  expirePreference(tenantAccessToken: string, preferenceId: string): Promise<PreferenceResponse> {
    const preference = new Preference(new MercadoPagoConfig({ accessToken: tenantAccessToken }));
    return preference.update({
      id: preferenceId,
      updatePreferenceRequest: { expires: true, expiration_date_to: new Date().toISOString() } as PreferenceRequest,
    });
  }
}
