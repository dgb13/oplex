'use client';

import { Button } from '@/components/ui/button';
import CompanyFormModal from '@/components/CompanyFormModal';
import { companiesApi } from '@/lib/companies';
import { inventoryApi } from '@/lib/inventory';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';

interface Props {
  article: { id: string; name: string; preferredSupplierId: string | null };
  onClose: () => void;
}

const inputClass =
  'h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

/** One preferred supplier per article (decision with the user,
 * 2026-07-27) - "quién nos vende esto habitualmente", used to pre-fill
 * the supplier when armando un Pedido de Cotización/Orden de Compra for
 * this article. Same lightweight-modal pattern as ArticleImageModal,
 * not the full article create/edit form that still doesn't exist. */
export default function ArticleSupplierModal({ article, onClose }: Props) {
  const queryClient = useQueryClient();
  const [supplierId, setSupplierId] = useState(article.preferredSupplierId ?? '');
  const [creatingSupplier, setCreatingSupplier] = useState(false);
  const [error, setError] = useState('');

  const suppliersQuery = useQuery({
    queryKey: ['companies', 'SUPPLIER'],
    queryFn: () => companiesApi.list('SUPPLIER'),
  });
  const suppliers = suppliersQuery.data ?? [];

  const mutation = useMutation({
    mutationFn: () => inventoryApi.updateArticle(article.id, { preferredSupplierId: supplierId || null }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['inventory-articles'] });
      onClose();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo guardar el proveedor';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 text-card-foreground shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Proveedor de {article.name}</h2>
          <button onClick={onClose} className="text-muted-foreground transition hover:text-foreground">
            ✕
          </button>
        </div>

        <div className="mb-1 flex items-center justify-between">
          <label className="text-sm text-muted-foreground">Proveedor preferido</label>
          <button type="button" onClick={() => setCreatingSupplier(true)} className="text-xs text-primary hover:underline">
            + nuevo proveedor
          </button>
        </div>
        <select className={`${inputClass} mb-4 w-full`} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
          <option value="">— Ninguno —</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? 'Guardando...' : 'Guardar'}
          </Button>
        </div>
      </div>

      {creatingSupplier && (
        <CompanyFormModal
          lockedRole="SUPPLIER"
          onClose={() => setCreatingSupplier(false)}
          onSaved={(c) => setSupplierId(c.id)}
        />
      )}
    </div>
  );
}
