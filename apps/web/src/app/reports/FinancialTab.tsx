'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
      <Card>
        <CardContent>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Cuentas financieras</h2>
            <div className="flex gap-2">
              {accounts.length >= 2 && (
                <Button type="button" variant="outline" onClick={() => setTransferOpen(true)}>
                  Transferir entre cuentas
                </Button>
              )}
              <Button type="button" onClick={() => setNewAccountOpen(true)}>
                + Nueva cuenta
              </Button>
            </div>
          </div>
          {accountsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Cargando...</p>
          ) : accounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin cuentas financieras creadas</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left text-muted-foreground">
                    <th className="p-3">Nombre</th>
                    <th className="p-3">Proveedor</th>
                    <th className="p-3 text-right">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((acc) => (
                    <tr
                      key={acc.id}
                      onClick={() => setSelectedId(acc.id)}
                      className={`cursor-pointer border-b border-border/50 hover:bg-muted/40 ${
                        selectedId === acc.id ? 'bg-muted/60' : ''
                      }`}
                    >
                      <td className="p-3">{acc.name}</td>
                      <td className="p-3 text-muted-foreground">{PROVIDER_LABELS[acc.provider]}</td>
                      <td className="p-3 text-right font-medium">${Number(acc.currentBalance).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedId && (
        <Card>
          <CardContent>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Conciliación — {summary?.accountName ?? '...'}</h2>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setImportOpen(true)}>
                  Importar extracto
                </Button>
                <Button type="button" onClick={() => setNewTxOpen(true)}>
                  + Nuevo movimiento
                </Button>
              </div>
            </div>

            {summary && (
              <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div>
                  <p className="text-xs text-muted-foreground">Saldo contable</p>
                  <p className="text-sm font-semibold">${Number(summary.bookBalance).toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Conciliado</p>
                  <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                    ${Number(summary.reconciledTotal).toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Sin conciliar</p>
                  <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                    ${Number(summary.unreconciledTotal).toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Pendiente de conciliación</p>
                  <p className="text-sm font-semibold">${Number(summary.pendingReconciliation).toFixed(2)}</p>
                </div>
              </div>
            )}

            <h3 className="mb-2 text-xs font-semibold text-muted-foreground">Movimientos sin conciliar</h3>
            {unreconciledQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Cargando...</p>
            ) : unreconciled.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay movimientos pendientes de conciliación</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-left text-muted-foreground">
                      <th className="p-3">Fecha</th>
                      <th className="p-3">Referencia</th>
                      <th className="p-3 text-right">Importe</th>
                      <th className="p-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {unreconciled.map((tx) => (
                      <tr key={tx.id} className="border-b border-border/50">
                        <td className="p-3 text-muted-foreground">
                          {new Date(tx.occurredAt).toLocaleDateString('es-AR')}
                        </td>
                        <td className="p-3">{tx.externalRef ?? '—'}</td>
                        <td
                          className={`p-3 text-right font-medium ${
                            Number(tx.amount) < 0 ? 'text-red-600 dark:text-red-400' : ''
                          }`}
                        >
                          ${Number(tx.amount).toFixed(2)}
                        </td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => reconcileMutation.mutate(tx.id)}
                            disabled={reconcileMutation.isPending}
                            className="text-xs font-medium text-primary hover:text-primary/80 disabled:opacity-50"
                          >
                            Conciliar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <h3 className="mb-2 mt-4 text-xs font-semibold text-muted-foreground">
              Líneas de extracto pendientes de revisión
            </h3>
            {pendingLinesQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Cargando...</p>
            ) : pendingLines.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay líneas de extracto pendientes</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-left text-muted-foreground">
                      <th className="p-3">Fecha</th>
                      <th className="p-3">Descripción</th>
                      <th className="p-3 text-right">Importe</th>
                      <th className="p-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {pendingLines.map((line) => (
                      <tr key={line.id} className="border-b border-border/50">
                        <td className="p-3 text-muted-foreground">
                          {new Date(line.lineDate).toLocaleDateString('es-AR', { timeZone: 'UTC' })}
                        </td>
                        <td className="p-3">{line.description}</td>
                        <td
                          className={`p-3 text-right font-medium ${
                            Number(line.amount) < 0 ? 'text-red-600 dark:text-red-400' : ''
                          }`}
                        >
                          ${Number(line.amount).toFixed(2)}
                        </td>
                        <td className="p-3 text-right whitespace-nowrap">
                          <button
                            onClick={() => setLinkLine(line)}
                            className="mr-3 text-xs font-medium text-primary hover:text-primary/80"
                          >
                            Vincular
                          </button>
                          <button
                            onClick={() => setCreateTxLine(line)}
                            className="mr-3 text-xs font-medium text-primary hover:text-primary/80"
                          >
                            Crear movimiento
                          </button>
                          <button
                            onClick={() => ignoreLineMutation.mutate(line.id)}
                            disabled={ignoreLineMutation.isPending}
                            className="text-xs font-medium text-muted-foreground transition hover:text-foreground disabled:opacity-50"
                          >
                            Ignorar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
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
