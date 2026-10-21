import { api } from '@/lib/api';

export type MercadoPagoConnectorStatus =
  | 'DISCONNECTED'
  | 'PENDING'
  | 'CONNECTED'
  | 'EXPIRED'
  | 'REVOKED'
  | 'ERROR';

export interface MercadoPagoConnectorStatusResponse {
  status: MercadoPagoConnectorStatus;
  nickname: string | null;
  connectedAt: string | null;
  connectedByName: string | null;
}

/** Estados en los que hay que volver a autorizar la cuenta. */
export const MERCADOPAGO_NEEDS_RECONNECT: MercadoPagoConnectorStatus[] = ['EXPIRED', 'REVOKED', 'ERROR'];

export type PaymentLinkDocumentType = 'INVOICE' | 'QUOTE';

export interface PaymentIntent {
  id: string;
  status: 'PENDING' | 'PAID' | 'EXPIRED' | 'CANCELLED' | 'REFUNDED' | 'ERROR';
  documentType: PaymentLinkDocumentType;
  documentId: string;
  amount: string;
  currency: string;
  initPoint: string | null;
  qrCodeBase64: string | null;
  createdAt: string;
}

export const mercadoPagoApi = {
  getStatus: () =>
    api.get<MercadoPagoConnectorStatusResponse>('/connectors/mercadopago/status').then((r) => r.data),
  authorize: () =>
    api.get<{ authorizationUrl: string }>('/connectors/mercadopago/authorize').then((r) => r.data),
  disconnect: () => api.post('/connectors/mercadopago/disconnect').then((r) => r.data),
  createPaymentLink: (documentType: PaymentLinkDocumentType, documentId: string) =>
    api
      .post<PaymentIntent>('/connectors/mercadopago/payment-links', { documentType, documentId })
      .then((r) => r.data),
  getPaymentLink: (id: string) =>
    api.get<PaymentIntent>(`/connectors/mercadopago/payment-links/${id}`).then((r) => r.data),
  cancelPaymentLink: (id: string) =>
    api.post<PaymentIntent>(`/connectors/mercadopago/payment-links/${id}/cancel`).then((r) => r.data),
};
