'use client';

import { accountingApi, type AccountType } from '@/lib/accounting';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import NewAccountModal from './NewAccountModal';

const TYPE_LABELS: Record<AccountType, string> = {
  ASSET: 'Activo',
  LIABILITY: 'Pasivo',
  EQUITY: 'Patrimonio',
  INCOME: 'Ingreso',
  EXPENSE: 'Gasto',
};

// isMonetary sólo tiene efecto en el motor de Ajuste por Inflación
// (RT6/NC39) para ASSET/LIABILITY/EQUITY - en INCOME/EXPENSE el flag existe
// en el modelo pero queda inerte, mostrar el toggle ahí confundiría.
const MONETARY_CLASSIFICATION_TYPES: AccountType[] = ['ASSET', 'LIABILITY', 'EQUITY'];

export default function AccountsTab() {
  const queryClient = useQueryClient();
  const [newOpen, setNewOpen] = useState(false);
  const { data: accounts, isLoading, error } = useQuery({
    queryKey: ['accounting-accounts'],
    queryFn: accountingApi.listAccounts,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, isMonetary }: { id: string; isMonetary: boolean }) =>
      accountingApi.updateAccount(id, { isMonetary }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['accounting-accounts'] }),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">{accounts?.length ?? 0} cuentas</p>
        <button
          onClick={() => setNewOpen(true)}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
        >
          + Nueva cuenta
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-4">
        {isLoading ? (
          <div className="flex h-32 items-center justify-center text-slate-500">Cargando...</div>
        ) : error ? (
          <div className="flex h-32 items-center justify-center text-red-600 dark:text-red-400">
            Error al cargar el plan de cuentas
          </div>
        ) : accounts?.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-600">Sin cuentas creadas</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-xs text-slate-500">
                <th className="pb-2 pr-4">Código</th>
                <th className="pb-2 pr-4">Nombre</th>
                <th className="pb-2 pr-4">Tipo</th>
                <th className="pb-2">Tipo de partida</th>
              </tr>
            </thead>
            <tbody>
              {accounts?.map((acc) => (
                <tr key={acc.id} className="border-b border-slate-200/50 dark:border-slate-800/50 hover:bg-slate-200/40 dark:hover:bg-slate-800/40">
                  <td className="py-2 pr-4 font-mono text-xs text-slate-600 dark:text-slate-400">{acc.code}</td>
                  <td className="py-2 pr-4 text-slate-800 dark:text-slate-200">{acc.name}</td>
                  <td className="py-2 pr-4 text-slate-600 dark:text-slate-400">{TYPE_LABELS[acc.type]}</td>
                  <td className="py-2">
                    {MONETARY_CLASSIFICATION_TYPES.includes(acc.type) ? (
                      <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                        <input
                          type="checkbox"
                          checked={acc.isMonetary}
                          disabled={updateMutation.isPending}
                          onChange={(e) => updateMutation.mutate({ id: acc.id, isMonetary: e.target.checked })}
                          className="h-4 w-4 accent-indigo-600"
                        />
                        {acc.isMonetary ? 'Monetaria' : 'No monetaria'}
                      </label>
                    ) : (
                      <span className="text-xs text-slate-400 dark:text-slate-600">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {newOpen && <NewAccountModal onClose={() => setNewOpen(false)} />}
    </div>
  );
}
