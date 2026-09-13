'use client';

import { Input } from '@/components/ui/input';
import { companiesApi } from '@/lib/companies';
import { reportsApi } from '@/lib/reports';
import {
  CHECK_KIND_LABELS,
  describeCheckStatus,
  treasuryApi,
  type Check,
  type CheckKind,
  type CheckStatus,
} from '@/lib/treasury';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';
import DateRangeFilter from '../reports/DateRangeFilter';
import DepositCheckModal from './DepositCheckModal';
import RejectCheckModal from './RejectCheckModal';

const selectClass =
  'h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

const STATUS_OPTIONS: CheckStatus[] = [
  'PORTFOLIO',
  'DEPOSITED',
  'ENDORSED',
  'ISSUED',
  'CLEARED',
  'REJECTED',
  'VOIDED',
];

export default function TreasuryPage() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<CheckStatus | ''>('');
  const [kind, setKind] = useState<CheckKind | ''>('');
  const [bankName, setBankName] = useState('');
  const [dueFrom, setDueFrom] = useState('');
  const [dueTo, setDueTo] = useState('');
  const [depositing, setDepositing] = useState<Check | null>(null);
  const [rejecting, setRejecting] = useState<Check | null>(null);
  const [clearingId, setClearingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const checksQuery = useQuery({
    queryKey: ['checks', { status, kind, bankName, dueFrom, dueTo }],
    queryFn: () =>
      treasuryApi.listChecks({
        status: status || undefined,
        kind: kind || undefined,
        bankName: bankName || undefined,
        dueFrom: dueFrom || undefined,
        dueTo: dueTo || undefined,
      }),
  });
  const checks = checksQuery.data ?? [];

  const companiesQuery = useQuery({ queryKey: ['companies', 'all'], queryFn: () => companiesApi.list() });
  const companyNameById = new Map((companiesQuery.data ?? []).map((c) => [c.id, c.name]));

  const accountsQuery = useQuery({ queryKey: ['financial-accounts'], queryFn: reportsApi.listFinancialAccounts });
  const accounts = accountsQuery.data ?? [];
  const accountNameById = new Map(accounts.map((a) => [a.id, a.name]));

  const clearMutation = useMutation({
    mutationFn: (id: string) => treasuryApi.markCleared(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['checks'] });
      void queryClient.invalidateQueries({ queryKey: ['financial-accounts'] });
      setClearingId(null);
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo acreditar el cheque';
      setError(Array.isArray(message) ? message.join(', ') : message);
      setClearingId(null);
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Cartera de Cheques</h1>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border p-4">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          Estado
          <select className={selectClass} value={status} onChange={(e) => setStatus(e.target.value as CheckStatus | '')}>
            <option value="">Todos</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {describeCheckStatus(s).label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          Tipo
          <select className={selectClass} value={kind} onChange={(e) => setKind(e.target.value as CheckKind | '')}>
            <option value="">Todos</option>
            <option value="THIRD_PARTY">{CHECK_KIND_LABELS.THIRD_PARTY}</option>
            <option value="OWN">{CHECK_KIND_LABELS.OWN}</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          Banco
          <Input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="Filtrar por banco" />
        </label>
        <DateRangeFilter
          from={dueFrom}
          to={dueTo}
          onFromChange={setDueFrom}
          onToChange={setDueTo}
          onPreset={(range) => {
            setDueFrom(range.from);
            setDueTo(range.to);
          }}
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {checksQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando...</p>
      ) : checks.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay cheques que coincidan con el filtro</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-muted-foreground">
                <th className="p-3">Vencimiento</th>
                <th className="p-3">Tipo</th>
                <th className="p-3">Número / Banco</th>
                <th className="p-3">Cliente / Proveedor</th>
                <th className="p-3">Cuenta</th>
                <th className="p-3 text-right">Monto</th>
                <th className="p-3">Estado</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {checks.map((check) => {
                const badge = describeCheckStatus(check.status);
                // Endosado: prioriza a quién se le entregó (supplierId) por
                // sobre quién lo trajo originalmente (customerId) - ambos
                // quedan poblados en ese estado, ver CheckService.endorseCheck.
                const companyId =
                  check.status === 'ENDORSED'
                    ? (check.supplierId ?? check.customerId)
                    : (check.customerId ?? check.supplierId);
                const canDeposit = check.kind === 'THIRD_PARTY' && check.status === 'PORTFOLIO';
                const canClear =
                  (check.kind === 'THIRD_PARTY' && check.status === 'DEPOSITED') ||
                  (check.kind === 'OWN' && check.status === 'ISSUED');
                const canReject =
                  check.kind === 'THIRD_PARTY' &&
                  (check.status === 'PORTFOLIO' || check.status === 'DEPOSITED' || check.status === 'ENDORSED');

                return (
                  <tr key={check.id} className="border-b border-border/50 align-top">
                    <td className="p-3 text-muted-foreground">
                      {new Date(check.dueDate).toLocaleDateString('es-AR', { timeZone: 'UTC' })}
                    </td>
                    <td className="p-3 text-muted-foreground">{CHECK_KIND_LABELS[check.kind]}</td>
                    <td className="p-3">
                      <p>{check.number}</p>
                      <p className="text-xs text-muted-foreground">{check.bankName}</p>
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {companyId ? (companyNameById.get(companyId) ?? '—') : '—'}
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {check.financialAccountId ? (accountNameById.get(check.financialAccountId) ?? '—') : '—'}
                    </td>
                    <td className="p-3 text-right font-medium">${Number(check.amount).toFixed(2)}</td>
                    <td className="p-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.colorClass}`}>
                        {badge.label}
                      </span>
                      {check.status === 'REJECTED' && check.rejectionReason && (
                        <p className="mt-1 text-xs text-muted-foreground">{check.rejectionReason}</p>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        {canDeposit && (
                          <button
                            onClick={() => setDepositing(check)}
                            className="text-xs font-medium text-primary hover:text-primary/80"
                          >
                            Depositar
                          </button>
                        )}
                        {canClear &&
                          (clearingId === check.id ? (
                            <span className="flex items-center gap-2">
                              <button
                                onClick={() => clearMutation.mutate(check.id)}
                                disabled={clearMutation.isPending}
                                className="text-xs font-medium text-emerald-600 dark:text-emerald-400 disabled:opacity-50"
                              >
                                Confirmar
                              </button>
                              <button
                                onClick={() => setClearingId(null)}
                                className="text-xs text-muted-foreground hover:text-foreground"
                              >
                                Volver
                              </button>
                            </span>
                          ) : (
                            <button
                              onClick={() => setClearingId(check.id)}
                              className="text-xs font-medium text-emerald-600 dark:text-emerald-400 transition hover:text-emerald-700 dark:hover:text-emerald-300"
                            >
                              Acreditar
                            </button>
                          ))}
                        {canReject && (
                          <button
                            onClick={() => setRejecting(check)}
                            className="text-xs font-medium text-red-600 dark:text-red-400 transition hover:text-red-700 dark:hover:text-red-300"
                          >
                            Rechazar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {depositing && (
        <DepositCheckModal check={depositing} accounts={accounts} onClose={() => setDepositing(null)} />
      )}
      {rejecting && <RejectCheckModal check={rejecting} onClose={() => setRejecting(null)} />}
    </div>
  );
}
