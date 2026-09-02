'use client';

import { bankReconciliationApi, type BankStatementImportResult } from '@/lib/bank-reconciliation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';

interface Props {
  financialAccountId: string;
  onClose: () => void;
}

export default function ImportBankStatementModal({ financialAccountId, onClose }: Props) {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [result, setResult] = useState<BankStatementImportResult | null>(null);

  const downloadMutation = useMutation({
    mutationFn: () => bankReconciliationApi.downloadTemplate(),
    onError: () => setError('No se pudo descargar la plantilla'),
  });

  const importMutation = useMutation({
    mutationFn: (f: File) => bankReconciliationApi.importStatement(financialAccountId, f),
    onSuccess: (data) => {
      setResult(data);
      setError('');
      if (data.errors.length === 0) {
        void queryClient.invalidateQueries({ queryKey: ['bank-statement-lines', financialAccountId] });
        void queryClient.invalidateQueries({ queryKey: ['financial-unreconciled', financialAccountId] });
        void queryClient.invalidateQueries({ queryKey: ['financial-reconciliation', financialAccountId] });
        void queryClient.invalidateQueries({ queryKey: ['financial-accounts'] });
      }
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo importar el archivo';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  function handleImport() {
    setError('');
    setResult(null);
    if (!file) {
      setError('Elegí un archivo .xlsx primero');
      return;
    }
    importMutation.mutate(file);
  }

  const success = result && result.errors.length === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Importar extracto bancario</h2>
          <button onClick={onClose} className="text-slate-500 transition hover:text-slate-700 dark:hover:text-slate-300">
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <p className="mb-2 text-sm text-slate-600 dark:text-slate-400">
              1. Descargá la plantilla y completá los movimientos del extracto de tu banco (Fecha,
              Descripción, Importe).
            </p>
            <button
              type="button"
              onClick={() => downloadMutation.mutate()}
              disabled={downloadMutation.isPending}
              className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 transition hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-50"
            >
              {downloadMutation.isPending ? 'Descargando...' : 'Descargar plantilla'}
            </button>
          </div>

          <div>
            <p className="mb-2 text-sm text-slate-600 dark:text-slate-400">
              2. Subí el archivo completo (hasta 500 filas por vez).
            </p>
            <input
              type="file"
              accept=".xlsx"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setResult(null);
                setError('');
              }}
              className="w-full text-sm text-slate-700 dark:text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-200 dark:file:bg-slate-800 file:px-3 file:py-2 file:text-sm file:text-slate-700 dark:file:text-slate-300"
            />
          </div>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          {result && result.errors.length > 0 && (
            <div className="max-h-48 overflow-y-auto rounded-lg border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-3">
              <p className="mb-2 text-sm font-semibold text-red-700 dark:text-red-400">
                {result.errors.length} error{result.errors.length !== 1 ? 'es' : ''} encontrado
                {result.errors.length !== 1 ? 's' : ''} - no se importó nada, corregí y volvé a
                subir el archivo:
              </p>
              <ul className="flex flex-col gap-1 text-xs text-red-700 dark:text-red-400">
                {result.errors.map((e, i) => (
                  <li key={i}>
                    {e.row > 0 ? `Fila ${e.row}: ` : ''}
                    {e.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {success && (
            <p className="text-sm text-green-700 dark:text-green-400">
              {result.totalLines} línea{result.totalLines !== 1 ? 's' : ''} importada
              {result.totalLines !== 1 ? 's' : ''} — {result.matchedCount} matcheada
              {result.matchedCount !== 1 ? 's' : ''} automáticamente, {result.pendingCount} pendiente
              {result.pendingCount !== 1 ? 's' : ''} de revisión.
            </p>
          )}

          <div className="mt-2 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm text-slate-600 dark:text-slate-400 transition hover:text-slate-800 dark:hover:text-slate-200"
            >
              {success ? 'Cerrar' : 'Cancelar'}
            </button>
            {!success && (
              <button
                type="button"
                onClick={handleImport}
                disabled={importMutation.isPending || !file}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
              >
                {importMutation.isPending ? 'Importando...' : 'Importar'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
