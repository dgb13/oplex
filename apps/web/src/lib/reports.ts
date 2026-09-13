import { api } from '@/lib/api';

export interface DateRange {
  from?: string;
  to?: string;
}

export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';

export interface IncomeStatementLine {
  accountId: string;
  code: string;
  name: string;
  type: AccountType;
  amount: string;
}

export interface IncomeStatement {
  from: string;
  to: string;
  lines: IncomeStatementLine[];
  totalRevenue: string;
  totalExpenses: string;
  netIncome: string;
}

export interface RevenueSummary {
  from: string;
  to: string;
  invoiceCount: number;
  subtotal: string;
  taxTotal: string;
  total: string;
}

export interface CustomerSales {
  customerId: string;
  customerName: string;
  invoiceCount: number;
  totalSales: string;
}

export interface ProductSales {
  articleVariantId: string;
  sku: string;
  articleName: string;
  quantitySold: string;
  revenue: string;
}

export type FinancialAccountProvider = 'BANK' | 'MERCADOPAGO' | 'PAYPAL' | 'CASH';

export interface FinancialAccount {
  id: string;
  name: string;
  provider: FinancialAccountProvider;
  currentBalance: string;
  // null = moneda base del tenant - ver FinancialAccount.currencyId.
  currencyId: string | null;
  currency: { id: string; code: string; name: string } | null;
  lastRevaluationRate: string | null;
}

export interface FinancialTransaction {
  id: string;
  financialAccountId: string;
  amount: string;
  reconciled: boolean;
  externalRef: string | null;
  occurredAt: string;
}

export interface ReconciliationSummary {
  financialAccountId: string;
  accountName: string;
  bookBalance: string;
  reconciledTotal: string;
  unreconciledTotal: string;
  pendingReconciliation: string;
}

export interface CreateFinancialAccountInput {
  name: string;
  provider: FinancialAccountProvider;
  currentBalance?: number;
  currencyId?: string;
}

export interface RecordFinancialTransactionInput {
  financialAccountId: string;
  amount: number;
  occurredAt?: string;
  externalRef?: string;
}

export interface TransferBetweenAccountsInput {
  fromFinancialAccountId: string;
  toFinancialAccountId: string;
  amount: number;
  occurredAt?: string;
  note?: string;
}

export const reportsApi = {
  getIncomeStatement: (range: DateRange) =>
    api.get<IncomeStatement>('/reports/pnl/income-statement', { params: range }).then((r) => r.data),
  getRevenueSummary: (range: DateRange) =>
    api.get<RevenueSummary>('/reports/pnl/revenue-summary', { params: range }).then((r) => r.data),
  getSalesByCustomer: (range: DateRange) =>
    api.get<CustomerSales[]>('/reports/sales/by-customer', { params: range }).then((r) => r.data),
  getSalesByProduct: (range: DateRange) =>
    api.get<ProductSales[]>('/reports/sales/by-product', { params: range }).then((r) => r.data),
  listFinancialAccounts: () =>
    api.get<FinancialAccount[]>('/reports/financial/accounts').then((r) => r.data),
  createFinancialAccount: (dto: CreateFinancialAccountInput) =>
    api.post<FinancialAccount>('/reports/financial/accounts', dto).then((r) => r.data),
  recordFinancialTransaction: (dto: RecordFinancialTransactionInput) =>
    api.post<FinancialTransaction>('/reports/financial/transactions', dto).then((r) => r.data),
  transferBetweenAccounts: (dto: TransferBetweenAccountsInput) =>
    api
      .post<{ from: FinancialTransaction; to: FinancialTransaction }>('/reports/financial/transfers', dto)
      .then((r) => r.data),
  reconcileTransaction: (id: string) =>
    api.post<FinancialTransaction>(`/reports/financial/transactions/${id}/reconcile`).then((r) => r.data),
  listUnreconciledTransactions: (financialAccountId?: string) =>
    api
      .get<FinancialTransaction[]>('/reports/financial/transactions/unreconciled', {
        params: financialAccountId ? { financialAccountId } : undefined,
      })
      .then((r) => r.data),
  getReconciliationSummary: (financialAccountId: string) =>
    api
      .get<ReconciliationSummary>(`/reports/financial/accounts/${financialAccountId}/reconciliation`)
      .then((r) => r.data),
  revalueFinancialAccount: (financialAccountId: string, rate?: number) =>
    api
      .post<{ account: FinancialAccount; journalEntry: unknown }>(
        `/reports/financial/accounts/${financialAccountId}/revalue`,
        rate !== undefined ? { rate } : undefined,
      )
      .then((r) => r.data),
};
