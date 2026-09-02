import { api } from '@/lib/api';

export type BankStatementLineStatus = 'PENDING' | 'MATCHED' | 'IGNORED';

export interface BankStatementLine {
  id: string;
  bankStatementImportId: string;
  financialAccountId: string;
  lineDate: string;
  description: string;
  amount: string;
  status: BankStatementLineStatus;
  matchedTransactionId: string | null;
  createdAt: string;
}

export interface BankStatementImportRowError {
  row: number;
  message: string;
}

export interface BankStatementImportResult {
  importId?: string;
  totalLines: number;
  matchedCount: number;
  pendingCount: number;
  errors: BankStatementImportRowError[];
}

export const bankReconciliationApi = {
  downloadTemplate: async () => {
    const res = await api.get('/bank-reconciliation/template', { responseType: 'blob' });
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'plantilla-extracto-bancario.xlsx';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },
  importStatement: (financialAccountId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api
      .post<BankStatementImportResult>(`/bank-reconciliation/accounts/${financialAccountId}/import`, formData)
      .then((r) => r.data);
  },
  listLines: (financialAccountId: string, status?: BankStatementLineStatus) =>
    api
      .get<BankStatementLine[]>(`/bank-reconciliation/accounts/${financialAccountId}/lines`, {
        params: status ? { status } : undefined,
      })
      .then((r) => r.data),
  linkLine: (lineId: string, transactionId: string) =>
    api.post(`/bank-reconciliation/lines/${lineId}/link`, { transactionId }).then((r) => r.data),
  createTransactionFromLine: (lineId: string, dto: { kind: 'EXPENSE' | 'INCOME'; description?: string }) =>
    api.post(`/bank-reconciliation/lines/${lineId}/create-transaction`, dto).then((r) => r.data),
  ignoreLine: (lineId: string) => api.post(`/bank-reconciliation/lines/${lineId}/ignore`).then((r) => r.data),
};
