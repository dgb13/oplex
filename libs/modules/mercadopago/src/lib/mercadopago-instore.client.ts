import { Injectable } from '@nestjs/common';
import { MercadoPagoConfig, Order } from 'mercadopago';
import type { OrderResponse } from 'mercadopago/dist/clients/order/commonTypes.js';
import { retryMercadoPagoCall } from './mercadopago-retry.util.js';

const API_BASE = 'https://api.mercadopago.com';
// Ubicaciones públicas de Mercado Libre: Mercado Pago valida
// location.state_name / city_name de una sucursal contra estas mismas listas
// (en CABA, city_name es el barrio). Sin auth.
const LOCATIONS_BASE = 'https://api.mercadolibre.com';

/** Thrown for a non-2xx answer from the store/POS endpoints - the SDK has
 * no client for those, so they go through plain fetch (see below). `body`
 * keeps MP's own error payload, which names the offending field. */
export class MercadoPagoApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`Mercado Pago respondió ${status}: ${JSON.stringify(body)}`);
    this.name = 'MercadoPagoApiError';
  }
}

export interface MercadoPagoStoreLocation {
  street_name: string;
  street_number: string;
  city_name: string;
  state_name: string;
  latitude: number;
  longitude: number;
  reference?: string;
}

export interface CreateStoreBody {
  name: string;
  external_id: string;
  location: MercadoPagoStoreLocation;
}

export interface CreatePosBody {
  name: string;
  store_id: string;
  external_id: string;
  /** pdv = caja atendida, integrada con un sistema (Oplex). */
  config: { qr: { operating_mode: 'pdv' } };
}

export interface PosResponse {
  id: string | number;
  external_id?: string;
  /** El QR fijo para imprimir. */
  qr_response?: { image?: string; template_document?: string; template_image?: string };
  /** Lo que devuelve GET /pos (clásico) en vez de qr_response. */
  qr?: { image?: string; template_document?: string; template_image?: string };
}

export interface CreateQrOrderBody {
  externalReference: string;
  externalPosId: string;
  totalAmount: string;
  /** ISO 8601 duration, e.g. PT10M. */
  expirationTime: string;
  description: string;
}

/** The QR-specific bits of an Orders API response the SDK's own types
 * don't model yet (config.qr, type_response.qr_data). */
export type QrOrderResponse = OrderResponse & {
  type_response?: { qr_data?: string };
};

/**
 * Cobro con QR presencial (API de órdenes, modo híbrido). Same
 * per-call-accessToken rule as MercadoPagoPreferenceClient: everything here
 * authenticates as the TENANT (the money and the store live in the tenant's
 * own MP account), never OPLEX's platform account.
 *
 * Orders go through the SDK's Order client (typed errors, so
 * retryMercadoPagoCall can tell transient failures apart). Stores and POS
 * have no SDK client in mercadopago@3.6, so those use fetch directly.
 */
@Injectable()
export class MercadoPagoInStoreClient {
  // Cambian rarísima vez - una consulta por proceso y provincia alcanza.
  private stateIds: Map<string, string> | null = null;
  private readonly citiesByState = new Map<string, string[]>();

  /** Ciudades (barrios en CABA) que Mercado Pago acepta para una provincia,
   * por el mismo nombre que acepta en state_name ("Capital Federal"). */
  async listCities(stateName: string): Promise<string[]> {
    const cached = this.citiesByState.get(stateName);
    if (cached) return cached;
    if (!this.stateIds) {
      const country = await this.fetchLocations<{ states?: { id: string; name: string }[] }>('/countries/AR');
      this.stateIds = new Map((country.states ?? []).map((s) => [s.name, s.id]));
    }
    const stateId = this.stateIds.get(stateName);
    if (!stateId) return [];
    const state = await this.fetchLocations<{ cities?: { name: string }[] }>(`/states/${encodeURIComponent(stateId)}`);
    const cities = (state.cities ?? []).map((c) => c.name).sort((a, b) => a.localeCompare(b, 'es'));
    this.citiesByState.set(stateName, cities);
    return cities;
  }

  createStore(accessToken: string, mpUserId: string, body: CreateStoreBody): Promise<{ id: string | number }> {
    return this.request(accessToken, 'POST', `/users/${encodeURIComponent(mpUserId)}/stores`, body);
  }

  /** Activar puede quedar a medias (MP creó la sucursal, falló la caja y la
   * transacción de Oplex se revirtió) - estas búsquedas por external_id
   * permiten reintentar reusando lo que MP ya tiene. */
  async findStore(accessToken: string, mpUserId: string, externalId: string): Promise<{ id: string | number } | null> {
    const res = await this.request<{ results?: { id: string | number }[] }>(
      accessToken,
      'GET',
      `/users/${encodeURIComponent(mpUserId)}/stores/search?external_id=${encodeURIComponent(externalId)}`,
    );
    return res.results?.[0] ?? null;
  }

  async findPos(accessToken: string, externalId: string): Promise<PosResponse | null> {
    const res = await this.request<{ results?: PosResponse[] }>(
      accessToken,
      'GET',
      `/pos?external_id=${encodeURIComponent(externalId)}`,
    );
    return res.results?.[0] ?? null;
  }

  createPos(accessToken: string, body: CreatePosBody): Promise<PosResponse> {
    // /v2/pos exige X-Idempotency-Key; derivada del external_id, un
    // reintento nunca crea una segunda caja.
    return this.request(accessToken, 'POST', '/v2/pos', body, `pos-${body.external_id}`);
  }

  /** Classic DELETE /pos/{id} - not confirmed against the /v2/pos docs, so
   * callers treat a failure here as non-fatal (see deactivateRegister). */
  async deletePos(accessToken: string, posId: string): Promise<void> {
    await this.request(accessToken, 'DELETE', `/pos/${encodeURIComponent(posId)}`);
  }

  // Por fetch y no por el Order del SDK: en un 400 el SDK tira
  // MPBadRequestError con error/causes vacíos y se pierde el motivo, que es
  // justo lo que hace falta ver (campo inválido, caja inexistente...).
  createQrOrder(accessToken: string, input: CreateQrOrderBody, idempotencyKey: string): Promise<QrOrderResponse> {
    return this.request(
      accessToken,
      'POST',
      '/v1/orders',
      {
        type: 'qr',
        total_amount: input.totalAmount,
        external_reference: input.externalReference,
        expiration_time: input.expirationTime,
        description: input.description,
        config: { qr: { external_pos_id: input.externalPosId, mode: 'hybrid' } },
        transactions: { payments: [{ amount: input.totalAmount }] },
      },
      idempotencyKey,
    );
  }

  getOrder(accessToken: string, orderId: string): Promise<QrOrderResponse> {
    return retryMercadoPagoCall(() => {
      const order = new Order(new MercadoPagoConfig({ accessToken }));
      return order.get({ id: orderId }) as Promise<QrOrderResponse>;
    });
  }

  cancelOrder(accessToken: string, orderId: string): Promise<QrOrderResponse> {
    const order = new Order(new MercadoPagoConfig({ accessToken }));
    return order.cancel({ id: orderId }) as Promise<QrOrderResponse>;
  }

  private async fetchLocations<T>(path: string): Promise<T> {
    const res = await fetch(`${LOCATIONS_BASE}${path}`);
    if (!res.ok) {
      throw new MercadoPagoApiError(res.status, await res.text());
    }
    return (await res.json()) as T;
  }

  private async request<T>(
    accessToken: string,
    method: string,
    path: string,
    body?: unknown,
    idempotencyKey?: string,
  ): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...(idempotencyKey ? { 'X-Idempotency-Key': idempotencyKey } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    const parsed: unknown = text ? safeJson(text) : undefined;
    if (!res.ok) {
      throw new MercadoPagoApiError(res.status, parsed ?? text);
    }
    return parsed as T;
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
