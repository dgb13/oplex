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

export type MovementOriginFilter = 'all' | 'caja' | 'docs' | 'outside' | 'unassigned';

export interface MovementsQuery {
  from?: string;
  to?: string;
  origin?: MovementOriginFilter;
  page?: number;
}

export type OplexState = 'ASSIGNED' | 'UNASSIGNED' | 'REFUNDED' | 'QUOTE_PAID' | 'PENDING' | 'OUTSIDE';

/** Un pago de la cuenta de MP (MercadoPagoMovementsService en la API). */
export interface MovementRow {
  id: string;
  mpPaymentId: string;
  date: string;
  originKind: 'CAJA' | 'FACTURA' | 'COTIZACION' | 'FUERA';
  originLabel: string;
  originDetail: string;
  payerEmail: string | null;
  method: string;
  currency: string;
  gross: string;
  fee: string;
  net: string | null;
  refunded: string;
  releaseDate: string | null;
  released: boolean;
  mpStatus: string;
  mpStatusLabel: string;
  oplexState: OplexState;
  oplexLabel: string;
  registerId: string | null;
}

export interface MovementsPage {
  rows: MovementRow[];
  total: number;
  page: number;
  pageSize: number;
  unassignedCount: number;
  lastSyncAt: string | null;
}

export interface MovementsSummary {
  currency: string;
  gross: string;
  fee: string;
  net: string;
  count: number;
  feePercent: number | null;
  byOrigin: { kind: 'CAJA' | 'DOCS' | 'FUERA'; gross: string }[];
  pendingRelease: string;
  upcomingReleases: { date: string; amount: string }[];
  otherCurrencies: { currency: string; gross: string; count: number }[];
  unassignedCount: number;
  lastSyncAt: string | null;
}

export interface MovementsSyncResult {
  synced: number;
  lastSyncAt: string;
  partial: boolean;
}

function saveBlob(data: Blob, fileName: string) {
  const url = window.URL.createObjectURL(data);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

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
  listMovements: (query: MovementsQuery) =>
    api.get<MovementsPage>('/connectors/mercadopago/movements', { params: query }).then((r) => r.data),
  getSummary: (range: { from: string; to: string }) =>
    api.get<MovementsSummary>('/connectors/mercadopago/movements/summary', { params: range }).then((r) => r.data),
  syncMovements: () =>
    api.post<MovementsSyncResult>('/connectors/mercadopago/movements/sync').then((r) => r.data),
  exportMovements: async (query: MovementsQuery) => {
    const { page: _page, ...filters } = query;
    const res = await api.get('/connectors/mercadopago/movements/export', { params: filters, responseType: 'blob' });
    saveBlob(res.data, 'movimientos-mercado-pago.xlsx');
  },
  cancelPaymentLink: (id: string) =>
    api.post<PaymentIntent>(`/connectors/mercadopago/payment-links/${id}/cancel`).then((r) => r.data),
};
