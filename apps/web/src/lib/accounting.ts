import { api } from '@/lib/api';

export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';
export type JournalLineDirection = 'DEBIT' | 'CREDIT';

export interface AccountingAccount {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  isMonetary: boolean;
}

export interface TrialBalanceRow {
  accountId: string;
  code: string;
  name: string;
  type: AccountType;
  debitTotal: string;
  creditTotal: string;
  balance: string;
}

export interface JournalEntryLine {
  id: string;
  accountId: string;
  direction: JournalLineDirection;
  amount: string;
}

export interface JournalEntry {
  id: string;
  description: string;
  date: string;
  invoiceId: string | null;
  reversalOfId: string | null;
  lines: JournalEntryLine[];
}

export interface LedgerLine {
  id: string;
  direction: JournalLineDirection;
  amount: string;
  journalEntry: { id: string; description: string; date: string };
}

export interface AccountLedger {
  accountId: string;
  code: string;
  name: string;
  lines: LedgerLine[];
}

export interface CreateAccountInput {
  code: string;
  name: string;
  type: AccountType;
}

export interface PostJournalEntryLineInput {
  accountId: string;
  direction: JournalLineDirection;
  amount: number;
}

export interface PostJournalEntryInput {
  description: string;
  date?: string;
  lines: PostJournalEntryLineInput[];
}

export interface InflationAdjustmentAccountRow {
  accountId: string;
  code: string;
  name: string;
  type: AccountType;
  openingBalance: string;
  movementsNominal: string;
  closingBalanceNominal: string;
  closingBalanceReexpressed: string;
  contribution: string;
}

export interface InflationAdjustmentPreview {
  from: string;
  to: string;
  rows: InflationAdjustmentAccountRow[];
  /** Positivo = pérdida (posición monetaria neta activa, erosionada por la
   * inflación). Negativo = ganancia (posición neta pasiva). */
  recpam: string;
}

export interface InflationAdjustment {
  id: string;
  periodFrom: string;
  periodTo: string;
  recpamAmount: string;
  createdAt: string;
}

export interface PostInflationAdjustmentResult {
  adjustment: InflationAdjustment;
  journalEntry: JournalEntry | null;
}

export const accountingApi = {
  listAccounts: () => api.get<AccountingAccount[]>('/accounting/accounts').then((r) => r.data),
  createAccount: (dto: CreateAccountInput) =>
    api.post<AccountingAccount>('/accounting/accounts', dto).then((r) => r.data),
  updateAccount: (id: string, dto: { isMonetary: boolean }) =>
    api.patch<AccountingAccount>(`/accounting/accounts/${id}`, dto).then((r) => r.data),
  getTrialBalance: (from?: string, to?: string) =>
    api
      .get<TrialBalanceRow[]>('/accounting/trial-balance', { params: { from, to } })
      .then((r) => r.data),
  listJournalEntries: () =>
    api.get<JournalEntry[]>('/accounting/journal-entries').then((r) => r.data),
  postJournalEntry: (dto: PostJournalEntryInput) =>
    api.post<JournalEntry>('/accounting/journal-entries', dto).then((r) => r.data),
  getAccountLedger: (accountId: string) =>
    api.get<AccountLedger>(`/accounting/accounts/${accountId}/ledger`).then((r) => r.data),
  getInflationAdjustmentPreview: (from: string, to: string) =>
    api
      .get<InflationAdjustmentPreview>('/accounting/inflation-adjustment/preview', { params: { from, to } })
      .then((r) => r.data),
  listInflationAdjustments: () =>
    api.get<InflationAdjustment[]>('/accounting/inflation-adjustment').then((r) => r.data),
  postInflationAdjustment: (from: string, to: string) =>
    api
      .post<PostInflationAdjustmentResult>('/accounting/inflation-adjustment', { from, to })
      .then((r) => r.data),
};
