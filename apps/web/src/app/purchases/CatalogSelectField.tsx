'use client';

import Select from '@/components/ui/Select';
import { catalogsApi, type CatalogRouteType } from '@/lib/purchases';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

const inputClass =
  'h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

/** Shared by QuoteRequestFormModal and PurchaseOrderFormModal - a catalog
 * dropdown (transporte/forma de pago/plazo de entrega) with a "+ agregar"
 * that adds a new option without leaving the form, same spirit as
 * NewInvoiceModal's inline "+ nuevo cliente". Optional on purpose (these 3
 * fields are all nullable FKs), so the first option is always "— Ninguno —". */
export default function CatalogSelectField({
  type,
  label,
  value,
  onChange,
}: {
  type: CatalogRouteType;
  label: string;
  value: string;
  onChange: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const { data: items } = useQuery({
    queryKey: ['purchase-catalog', type, false],
    queryFn: () => catalogsApi.list(type, false),
  });
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');

  const createMutation = useMutation({
    mutationFn: (name: string) => catalogsApi.create(type, name),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ['purchase-catalog', type] });
      onChange(created.id);
      setAdding(false);
      setNewName('');
    },
  });

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <label className="text-sm text-muted-foreground">{label}</label>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="text-xs text-primary hover:text-primary"
        >
          + agregar
        </button>
      </div>
      {adding ? (
        <div className="flex gap-2">
          <input
            autoFocus
            className={`${inputClass} flex-1`}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nombre..."
          />
          <button
            type="button"
            disabled={!newName.trim() || createMutation.isPending}
            onClick={() => createMutation.mutate(newName.trim())}
            className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
          >
            Agregar
          </button>
        </div>
      ) : (
        <Select
          value={value}
          onChange={onChange}
          options={[{ value: '', label: '— Ninguno —' }, ...(items ?? []).map((item) => ({ value: item.id, label: item.name }))]}
        />
      )}
    </div>
  );
}
