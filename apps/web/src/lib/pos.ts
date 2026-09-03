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

export const posApi = {
  createRegister: (dto: CreateCashRegisterInput) =>
    api.post<CashRegister>('/pos/registers', dto).then((r) => r.data),
  listRegisters: () => api.get<CashRegister[]>('/pos/registers').then((r) => r.data),
  listOpenSessions: () => api.get<CashSessionListRow[]>('/pos/sessions/open').then((r) => r.data),
  listSessions: () => api.get<CashSessionListRow[]>('/pos/sessions').then((r) => r.data),
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
};
