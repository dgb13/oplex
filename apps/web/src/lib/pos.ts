import { api } from '@/lib/api';
import type { CreateSaleLineInput, Invoice, ReceiptCheckInput } from '@/lib/invoicing';

export interface CashRegister {
  id: string;
  name: string;
  branchId: string;
  branch: { id: string; name: string };
  warehouseId: string;
  warehouse: { id: string; name: string };
  financialAccountId: string;
  active: boolean;
  createdAt: string;
  // Caja dada de alta en Mercado Pago para cobrar con QR (null = sin activar).
  mpPosId: string | null;
}

export interface CreateCashRegisterInput {
  name: string;
  branchId: string;
  warehouseId: string;
}

export interface UpdateCashRegisterInput {
  name?: string;
  active?: boolean;
}

// $100 existe como billete y como moneda a la vez en la Argentina real -
// por eso cada fila del desglose lleva `kind` además de `denomination`, no
// sólo un número (mismo criterio que ars-denominations.ts en el backend,
// la fuente de verdad real que recalcula/valida esto).
export type DenominationKind = 'BILL' | 'COIN';

export interface DenominationBreakdownItem {
  kind: DenominationKind;
  denomination: number;
  count: number;
}

export type CashMovementType = 'SALE' | 'CASH_IN' | 'CASH_OUT';

export interface CashMovement {
  id: string;
  sessionId: string;
  type: CashMovementType;
  amount: string;
  invoiceId: string | null;
  reason: string | null;
  createdByUserId: string;
  createdAt: string;
}

export type CashSessionStatus = 'OPEN' | 'CLOSED';

interface UserSummary {
  id: string;
  name: string | null;
  email: string;
}

export interface CashSessionListRow {
  id: string;
  registerId: string;
  register: { id: string; name: string };
  status: CashSessionStatus;
  openedByUserId: string;
  openedBy: UserSummary;
  openingAmount: string;
  openedAt: string;
  closedByUserId: string | null;
  closedBy: UserSummary | null;
  countedAmount: string | null;
  expectedAmount: string | null;
  difference: string | null;
  closedAt: string | null;
  notes: string | null;
  denominationBreakdown: DenominationBreakdownItem[] | null;
  // Simétrico a lo de arriba pero para la APERTURA (Fase 3) - desglose con
  // el que el cajero entrante contó el cajón, y diferencia contra el
  // countedAmount del último turno cerrado de esa misma caja. Null si es
  // el primer turno de la caja o si abrió en modo "monto simple".
  openingDenominationBreakdown: DenominationBreakdownItem[] | null;
  openingDifference: string | null;
}

export interface CashSessionDetail extends CashSessionListRow {
  movements: CashMovement[];
}

export interface CashSessionSummary {
  session: CashSessionDetail;
  expectedAmount: string;
}

export interface OpenCashSessionInput {
  registerId: string;
  openingAmount: number;
  // Opcional - sólo se manda en modo "Desglose por billetes". El servidor
  // recalcula openingAmount a partir de esto e ignora el de arriba cuando
  // llega (ver CashSessionsService.openSession) - se manda igual por
  // prolijidad de payload, nunca es la fuente de verdad. Mismo criterio que
  // CloseCashSessionInput.denominationBreakdown.
  denominationBreakdown?: DenominationBreakdownItem[];
}

export interface CashMovementInput {
  amount: number;
  reason: string;
}

export interface CloseCashSessionInput {
  countedAmount: number;
  notes?: string;
  // Opcional - sólo se manda en modo "Desglose por billetes". El servidor
  // recalcula countedAmount a partir de esto e ignora el de arriba cuando
  // llega (ver CashSessionsService.closeSession) - se manda igual por
  // prolijidad de payload, nunca es la fuente de verdad.
  denominationBreakdown?: DenominationBreakdownItem[];
}

export interface ListSessionsFilter {
  registerId?: string;
  from?: string;
  to?: string;
}

export interface DailyPosition {
  openSessionsCount: number;
  openSessionsExpectedTotal: string;
  closedTodayCount: number;
  closedTodayCountedTotal: string;
  closedTodayDifferenceTotal: string;
}

export interface CheckoutPaymentInput {
  amount: number;
  method: string;
  check?: ReceiptCheckInput;
  // Sólo MERCADOPAGO cobrado con el QR de la caja (ver QrChargePanel).
  paymentIntentId?: string;
}

// QR de Mercado Pago de una caja (ver MercadoPagoQrService en el backend).
export interface RegisterQrAddress {
  streetName: string;
  streetNumber: string;
  cityName: string;
  stateName: string;
  latitude: number | null;
  longitude: number | null;
}

export interface RegisterQrSetup {
  active: boolean;
  qrImageUrl: string | null;
  qrTemplateUrl: string | null;
  registerName: string;
  branchName: string;
  storeExists: boolean;
  address: RegisterQrAddress;
}

export interface ActivateRegisterQrInput {
  streetName: string;
  streetNumber: string;
  cityName: string;
  stateName: string;
  latitude: number;
  longitude: number;
}

export type QrChargeStatus = 'PENDING' | 'PAID' | 'EXPIRED' | 'CANCELLED' | 'REFUNDED' | 'ERROR';

export interface QrCharge {
  id: string;
  status: QrChargeStatus;
  rejected: boolean;
  amount: string;
  qrCodeBase64: string | null;
  expiresAt: string | null;
  externalPaymentId: string | null;
}

/** Cobro QR acreditado que no llegó a ser venta (ver "Cobros con QR sin
 * venta" en la Caja). `sale` es null en cobros anteriores a guardar la venta. */
export interface UnclaimedQrCharge {
  id: string;
  amount: string;
  paidAt: string | null;
  createdAt: string;
  externalPaymentId: string | null;
  createdByName: string | null;
  sale: {
    customerName: string;
    documentLetter: string;
    lines: { articleName: string; quantity: number; unitPrice: number | null }[];
  } | null;
}

/** "hoy 14:32", "ayer 18:10" o "29/09 14:32" - cuándo se acreditó un cobro. */
export function formatPaidAt(iso: string): string {
  const date = new Date(iso);
  const time = date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const dayMs = 24 * 60 * 60 * 1000;
  if (date >= startOfToday) return `hoy ${time}`;
  if (date.getTime() >= startOfToday.getTime() - dayMs) return `ayer ${time}`;
  return `${date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })} ${time}`;
}

/** La venta sin la caja - lo que se guarda junto con el cobro QR. */
export type CheckoutSaleInput = Omit<CheckoutInput, 'registerId'>;

export interface CheckoutInput {
  registerId: string;
  customerId?: string;
  documentLetter: 'A' | 'B' | 'C' | 'M';
  currencyId: string;
  exchangeRate?: number;
  globalDiscountPercent?: number;
  pricesIncludeTax?: boolean;
  lines: CreateSaleLineInput[];
  payments: CheckoutPaymentInput[];
}

export const POS_PAYMENT_METHODS = [
  { value: 'CASH', label: 'Efectivo' },
  { value: 'CARD', label: 'Tarjeta' },
  { value: 'MERCADOPAGO', label: 'Mercado Pago' },
  { value: 'BANK_TRANSFER', label: 'Transferencia' },
  { value: 'CHECK', label: 'Cheque' },
] as const;

function downloadBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

function sessionsParams(filter?: ListSessionsFilter) {
  return {
    ...(filter?.registerId ? { registerId: filter.registerId } : {}),
    ...(filter?.from ? { from: filter.from } : {}),
    ...(filter?.to ? { to: filter.to } : {}),
  };
}

export const posApi = {
  createRegister: (dto: CreateCashRegisterInput) =>
    api.post<CashRegister>('/pos/registers', dto).then((r) => r.data),
  listRegisters: (includeInactive?: boolean) =>
    api
      .get<CashRegister[]>('/pos/registers', { params: includeInactive ? { includeInactive: 'true' } : undefined })
      .then((r) => r.data),
  updateRegister: (id: string, dto: UpdateCashRegisterInput) =>
    api.patch<CashRegister>(`/pos/registers/${id}`, dto).then((r) => r.data),
  getLastClosedSession: (registerId: string) =>
    api.get<CashSessionDetail | null>(`/pos/registers/${registerId}/last-closed-session`).then((r) => r.data),
  listOpenSessions: () => api.get<CashSessionListRow[]>('/pos/sessions/open').then((r) => r.data),
  listSessions: (filter?: ListSessionsFilter) =>
    api.get<CashSessionListRow[]>('/pos/sessions', { params: sessionsParams(filter) }).then((r) => r.data),
  exportSessions: async (filter?: ListSessionsFilter) => {
    const res = await api.get('/pos/sessions/export', { params: sessionsParams(filter), responseType: 'blob' });
    downloadBlob(new Blob([res.data]), 'historial-turnos.xlsx');
  },
  openSession: (dto: OpenCashSessionInput) =>
    api.post<CashSessionDetail>('/pos/sessions', dto).then((r) => r.data),
  getSessionSummary: (id: string) =>
    api.get<CashSessionSummary>(`/pos/sessions/${id}`).then((r) => r.data),
  cashIn: (sessionId: string, dto: CashMovementInput) =>
    api.post<CashMovement>(`/pos/sessions/${sessionId}/cash-in`, dto).then((r) => r.data),
  cashOut: (sessionId: string, dto: CashMovementInput) =>
    api.post<CashMovement>(`/pos/sessions/${sessionId}/cash-out`, dto).then((r) => r.data),
  closeSession: (sessionId: string, dto: CloseCashSessionInput) =>
    api.post<CashSessionDetail>(`/pos/sessions/${sessionId}/close`, dto).then((r) => r.data),
  checkout: (dto: CheckoutInput) => api.post<Invoice>(`/pos/checkout`, dto).then((r) => r.data),
  getDailyPosition: () => api.get<DailyPosition>('/pos/dashboard').then((r) => r.data),
  listQrCities: (state: string) =>
    api.get<string[]>('/pos/mercadopago-qr/cities', { params: { state } }).then((r) => r.data),
  getRegisterQr: (registerId: string) =>
    api.get<RegisterQrSetup>(`/pos/registers/${registerId}/mercadopago-qr`).then((r) => r.data),
  activateRegisterQr: (registerId: string, dto: ActivateRegisterQrInput) =>
    api.post<RegisterQrSetup>(`/pos/registers/${registerId}/mercadopago-qr/activate`, dto).then((r) => r.data),
  deactivateRegisterQr: (registerId: string) =>
    api.post<RegisterQrSetup>(`/pos/registers/${registerId}/mercadopago-qr/deactivate`).then((r) => r.data),
  createQrCharge: (registerId: string, amount: number, sale?: CheckoutSaleInput) =>
    api.post<QrCharge>('/pos/qr-charges', { registerId, amount, sale }).then((r) => r.data),
  listUnclaimedQrCharges: (registerId: string) =>
    api.get<UnclaimedQrCharge[]>(`/pos/registers/${registerId}/qr-charges/unclaimed`).then((r) => r.data),
  confirmQrSale: (id: string) => api.post<Invoice>(`/pos/qr-charges/${id}/confirm-sale`).then((r) => r.data),
  getQrCharge: (id: string) => api.get<QrCharge>(`/pos/qr-charges/${id}`).then((r) => r.data),
  cancelQrCharge: (id: string) => api.post<QrCharge>(`/pos/qr-charges/${id}/cancel`).then((r) => r.data),
};
