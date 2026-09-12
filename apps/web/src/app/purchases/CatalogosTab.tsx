'use client';

import ToggleSwitch from '@/components/ToggleSwitch';
import { catalogsApi, type CatalogItem, type CatalogRouteType } from '@/lib/purchases';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

const inputClass =
  'h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

export default function CatalogosTab() {
  return (
    <div className="grid gap-6 md:grid-cols-3">
      <CatalogCard type="transport-modes" title="Modos de transporte" />
      <CatalogCard type="payment-terms" title="Formas de pago" />
      <CatalogCard type="delivery-times" title="Plazos de entrega" />
    </div>
  );
}

function CatalogCard({ type, title }: { type: CatalogRouteType; title: string }) {
  const queryClient = useQueryClient();
  const [includeInactive, setIncludeInactive] = useState(false);
  const [newName, setNewName] = useState('');

  const { data: items, isLoading } = useQuery({
    queryKey: ['purchase-catalog', type, includeInactive],
    queryFn: () => catalogsApi.list(type, includeInactive),
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['purchase-catalog', type] });
  }

  const createMutation = useMutation({
    mutationFn: (name: string) => catalogsApi.create(type, name),
    onSuccess: () => {
      setNewName('');
      invalidate();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: { name?: string; active?: boolean } }) =>
      catalogsApi.update(type, id, dto),
    onSuccess: invalidate,
  });

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    createMutation.mutate(name);
  }

  return (
    <div className="rounded-xl border bg-card p-5">
      <h2 className="mb-3 text-sm font-medium text-muted-foreground">{title}</h2>

      <form onSubmit={handleAdd} className="mb-3 flex gap-2">
        <input
          className={`${inputClass} flex-1`}
          placeholder="Agregar..."
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button
          type="submit"
          disabled={createMutation.isPending || !newName.trim()}
          className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
        >
          +
        </button>
      </form>

      <label className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={includeInactive}
          onChange={(e) => setIncludeInactive(e.target.checked)}
        />
        Mostrar inactivos
      </label>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando...</p>
      ) : items && items.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {items.map((item) => (
            <CatalogRow
              key={item.id}
              item={item}
              onRename={(name) => updateMutation.mutate({ id: item.id, dto: { name } })}
              onToggleActive={(active) => updateMutation.mutate({ id: item.id, dto: { active } })}
            />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Todavía no hay nada cargado</p>
      )}
    </div>
  );
}

function CatalogRow({
  item,
  onRename,
  onToggleActive,
}: {
  item: CatalogItem;
  onRename: (name: string) => void;
  onToggleActive: (active: boolean) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.name);

  function commit() {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== item.name) {
      onRename(trimmed);
    } else {
      setDraft(item.name);
    }
  }

  return (
    <li
      className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 ${
        item.active ? '' : 'opacity-50'
      }`}
    >
      {editing ? (
        <input
          autoFocus
          className={`${inputClass} flex-1 py-1`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') {
              setDraft(item.name);
              setEditing(false);
            }
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="flex-1 truncate text-left text-sm hover:text-primary"
        >
          {item.name}
        </button>
      )}
      <ToggleSwitch
        checked={item.active}
        onChange={onToggleActive}
        label={item.active ? 'Desactivar' : 'Activar'}
      />
    </li>
  );
}
