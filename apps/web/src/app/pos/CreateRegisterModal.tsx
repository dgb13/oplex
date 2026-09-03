'use client';

import { companiesApi } from '@/lib/companies';
import { inventoryApi } from '@/lib/inventory';
import { posApi } from '@/lib/pos';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';

interface Props {
  onClose: () => void;
}

const inputClass =
  'rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500';

// Alta simple (Fase 1) - reusado tal cual desde /settings/pos (Fase 2, ver
// el plan) para no duplicar el formulario de creación.
export default function CreateRegisterModal({ onClose }: Props) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [branchId, setBranchId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [error, setError] = useState('');

  const branchesQuery = useQuery({
    queryKey: ['companies', 'BRANCH'],
    queryFn: () => companiesApi.list('BRANCH'),
  });
  const warehousesQuery = useQuery({ queryKey: ['warehouses'], queryFn: inventoryApi.listWarehouses });

  const mutation = useMutation({
    mutationFn: () => posApi.createRegister({ name, branchId, warehouseId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['pos-registers'] });
      onClose();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo crear la caja';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!name.trim() || !branchId || !warehouseId) {
      setError('Completá nombre, sucursal y depósito');
      return;
    }
    mutation.mutate();
  }

  const branches = branchesQuery.data ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-2xl">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Nueva caja</h2>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm text-slate-600">Nombre</label>
            <input
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Caja 1 - Mostrador"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm text-slate-600">Sucursal</label>
            {!branchesQuery.isLoading && branches.length === 0 ? (
              <p className="text-xs text-amber-600">
                No hay ninguna empresa con rol Sucursal todavía - creá una en Empresas primero.
              </p>
            ) : (
              <select className={inputClass} value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                <option value="">Elegir...</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm text-slate-600">Depósito</label>
            <select className={inputClass} value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
              <option value="">Elegir...</option>
              {(warehousesQuery.data ?? []).map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="mt-2 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm text-slate-600 transition hover:text-slate-800"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
            >
              {mutation.isPending ? 'Creando...' : 'Crear caja'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
