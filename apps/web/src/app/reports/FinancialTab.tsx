'use client';

import { bankReconciliationApi, type BankStatementLine } from '@/lib/bank-reconciliation';
import { reportsApi, type FinancialAccountProvider } from '@/lib/reports';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import CreateTransactionFromLineModal from './CreateTransactionFromLineModal';
import ImportBankStatementModal from './ImportBankStatementModal';
import LinkStatementLineModal from './LinkStatementLineModal';
import NewFinancialAccountModal from './NewFinancialAccountModal';
import NewFinancialTransactionModal from './NewFinancialTransactionModal';
import TransferBetweenAccountsModal from './TransferBetweenAccountsModal';

const PROVIDER_LABELS: Record<FinancialAccountProvider, string> = {
  BANK: 'Banco',
  MERCADOPAGO: 'MercadoPago',
  PAYPAL: 'PayPal',
  CASH: 'Efectivo',
};

export default function FinancialTab() {
  const queryClient = useQueryClient();
  const [newAccountOpen, setNewAccountOpen] = useState(false);
  const [newTxOpen, setNewTxOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [linkLine, setLinkLine] = useState<BankStatementLine | null>(null);
  const [createTxLine, setCreateTxLine] = useState<BankStatementLine | null>(null);
  const [selectedId, setSelectedId] = useState('');

  const accountsQuery = useQuery({
    queryKey: ['financial-accounts'],
    queryFn: reportsApi.listFinancialAccounts,
  });
  const accounts = accountsQuery.data ?? [];

  const reconciliationQuery = useQuery({
    queryKey: ['financial-reconciliation', selectedId],
    queryFn: () => reportsApi.getReconciliationSummary(selectedId),
    enabled: Boolean(selectedId),
  });
  const unreconciledQuery = useQuery({
    queryKey: ['financial-unreconciled', selectedId],
    queryFn: () => reportsApi.listUnreconciledTransactions(selectedId),
    enabled: Boolean(selectedId),
  });
  const pendingLinesQuery = useQuery({
    queryKey: ['bank-statement-lines', selectedId],
    queryFn: () => bankReconciliationApi.listLines(selectedId, 'PENDING'),
    enabled: Boolean(selectedId),
  });

  const reconcileMutation = useMutation({
    mutationFn: (id: string) => reportsApi.reconcileTransaction(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['financial-unreconciled', selectedId] });
      void queryClient.invalidateQueries({ queryKey: ['financial-reconciliation', selectedId] });
    },
  });
  const ignoreLineMutation = useMutation({
    mutationFn: (lineId: string) => bankReconciliationApi.ignoreLine(lineId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['bank-statement-lines', selectedId] });
    },
  });

  const summary = reconciliationQuery.data;
  const unreconciled = unreconciledQuery.data ?? [];
  const pendingLines = pendingLinesQuery.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Cuentas financieras</h2>
          <div className="flex gap-2">
            {accounts.length >= 2 && (
              <button
                onClick={() => setTransferOpen(true)}
                className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300 transition hover:bg-slate-200 dark:hover:bg-slate-800"
              >
                Transferir entre cuentas
              </button>
            )}
            <button
              onClick={() => setNewAccountOpen(true)}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
            >
              + Nueva cuenta
            </button>
          </div>
        </div>
        {accountsQuery.isLoading ? (
          <div className="flex h-24 items-center justify-center text-slate-500">Cargando...</div>
        ) : accounts.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-600">Sin cuentas financieras creadas</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-xs text-slate-500">
                <th className="pb-2 pr-4">Nombre</th>
                <th className="pb-2 pr-4">Proveedor</th>
                <th className="pb-2 text-right">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((acc) => (
                <tr
                  key={acc.id}
                  onClick={() => setSelectedId(acc.id)}
                  className={`cursor-pointer border-b border-slate-200/50 dark:border-slate-800/50 hover:bg-slate-200/40 dark:hover:bg-slate-800/40 ${
                    selectedId === acc.id ? 'bg-slate-200/60 dark:bg-slate-800/60' : ''
                  }`}
                >
                  <td className="py-2 pr-4 text-slate-800 dark:text-slate-200">{acc.name}</td>
                  <td className="py-2 pr-4 text-slate-600 dark:text-slate-400">{PROVIDER_LABELS[acc.provider]}</td>
                  <td className="py-2 text-right font-medium text-slate-900 dark:text-slate-100">
                    ${Number(acc.currentBalance).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selectedId && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Conciliación — {summary?.accountName ?? '...'}
            </h2>
            <div className="flex gap-2">
              <button
                onClick={() => setImportOpen(true)}
                className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300 transition hover:bg-slate-200 dark:hover:bg-slate-800"
              >
                Importar extracto
              </button>
              <button
                onClick={() => setNewTxOpen(true)}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
              >
                + Nuevo movimiento
              </button>
            </div>
          </div>

          {summary && (
            <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <p className="text-xs text-slate-500">Saldo contable</p>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  ${Number(summary.bookBalance).toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Conciliado</p>
                <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                  ${Number(summary.reconciledTotal).toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Sin conciliar</p>
                <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                  ${Number(summary.unreconciledTotal).toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Pendiente de conciliación</p>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  ${Number(summary.pendingReconciliation).toFixed(2)}
                </p>
              </div>
            </div>
          )}

          <h3 className="mb-2 text-xs font-semibold text-slate-500">Movimientos sin conciliar</h3>
          {unreconciledQuery.isLoading ? (
            <div className="flex h-20 items-center justify-center text-slate-500">Cargando...</div>
          ) : unreconciled.length === 0 ? (
            <p className="text-sm text-slate-400 dark:text-slate-600">No hay movimientos pendientes de conciliación</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-xs text-slate-500">
                  <th className="pb-2 pr-4">Fecha</th>
                  <th className="pb-2 pr-4">Referencia</th>
                  <th className="pb-2 pr-4 text-right">Importe</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {unreconciled.map((tx) => (
                  <tr key={tx.id} className="border-b border-slate-200/50 dark:border-slate-800/50">
                    <td className="py-2 pr-4 text-slate-600 dark:text-slate-400">
                      {new Date(tx.occurredAt).toLocaleDateString('es-AR')}
                    </td>
                    <td className="py-2 pr-4 text-slate-700 dark:text-slate-300">{tx.externalRef ?? '—'}</td>
                    <td
                      className={`py-2 pr-4 text-right font-medium ${
                        Number(tx.amount) < 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-slate-100'
                      }`}
                    >
                      ${Number(tx.amount).toFixed(2)}
                    </td>
                    <td className="py-2 text-right">
                      <button
                        onClick={() => reconcileMutation.mutate(tx.id)}
                        disabled={reconcileMutation.isPending}
                        className="text-xs font-medium text-indigo-600 dark:text-indigo-400 transition hover:text-indigo-700 dark:hover:text-indigo-300 disabled:opacity-50"
                      >
                        Conciliar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <h3 className="mb-2 mt-4 text-xs font-semibold text-slate-500">
            Líneas de extracto pendientes de revisión
          </h3>
          {pendingLinesQuery.isLoading ? (
            <div className="flex h-20 items-center justify-center text-slate-500">Cargando...</div>
          ) : pendingLines.length === 0 ? (
            <p className="text-sm text-slate-400 dark:text-slate-600">No hay líneas de extracto pendientes</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-xs text-slate-500">
                  <th className="pb-2 pr-4">Fecha</th>
                  <th className="pb-2 pr-4">Descripción</th>
                  <th className="pb-2 pr-4 text-right">Importe</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {pendingLines.map((line) => (
                  <tr key={line.id} className="border-b border-slate-200/50 dark:border-slate-800/50">
                    <td className="py-2 pr-4 text-slate-600 dark:text-slate-400">
                      {new Date(line.lineDate).toLocaleDateString('es-AR', { timeZone: 'UTC' })}
                    </td>
                    <td className="py-2 pr-4 text-slate-700 dark:text-slate-300">{line.description}</td>
                    <td
                      className={`py-2 pr-4 text-right font-medium ${
                        Number(line.amount) < 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-slate-100'
                      }`}
                    >
                      ${Number(line.amount).toFixed(2)}
                    </td>
                    <td className="py-2 text-right whitespace-nowrap">
                      <button
                        onClick={() => setLinkLine(line)}
                        className="mr-3 text-xs font-medium text-indigo-600 dark:text-indigo-400 transition hover:text-indigo-700 dark:hover:text-indigo-300"
                      >
                        Vincular
                      </button>
                      <button
                        onClick={() => setCreateTxLine(line)}
                        className="mr-3 text-xs font-medium text-indigo-600 dark:text-indigo-400 transition hover:text-indigo-700 dark:hover:text-indigo-300"
                      >
                        Crear movimiento
                      </button>
                      <button
                        onClick={() => ignoreLineMutation.mutate(line.id)}
                        disabled={ignoreLineMutation.isPending}
                        className="text-xs font-medium text-slate-500 transition hover:text-slate-700 dark:hover:text-slate-300 disabled:opacity-50"
                      >
                        Ignorar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {newAccountOpen && <NewFinancialAccountModal onClose={() => setNewAccountOpen(false)} />}
      {newTxOpen && (
        <NewFinancialTransactionModal financialAccountId={selectedId} onClose={() => setNewTxOpen(false)} />
      )}
      {transferOpen && (
        <TransferBetweenAccountsModal
          accounts={accounts}
          defaultFromId={selectedId || accounts[0]?.id || ''}
          onClose={() => setTransferOpen(false)}
        />
      )}
      {importOpen && (
        <ImportBankStatementModal financialAccountId={selectedId} onClose={() => setImportOpen(false)} />
      )}
      {linkLine && (
        <LinkStatementLineModal line={linkLine} candidates={unreconciled} onClose={() => setLinkLine(null)} />
      )}
      {createTxLine && (
        <CreateTransactionFromLineModal line={createTxLine} onClose={() => setCreateTxLine(null)} />
      )}
    </div>
  );
}
