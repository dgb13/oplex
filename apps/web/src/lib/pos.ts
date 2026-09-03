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
}

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
};
