'use client';

import CompanyFormModal from '@/components/CompanyFormModal';
import CustomerPicker from '@/components/sales/CustomerPicker';
import { LinkButton } from '@/components/sales/SalesDocumentSheet';
import { useCompanyPermissions } from '@/components/useCompanyPermissions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Select from '@/components/ui/Select';
import { companiesApi } from '@/lib/companies';
import {
  customerAssetsApi,
  type AssetFieldDef,
  type AssetValues,
  type CustomerAsset,
  type CustomerAssetType,
} from '@/lib/customerAssets';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';

interface Props {
  types: CustomerAssetType[];
  /** Editar una ficha existente; sin esto, alta. */
  asset?: CustomerAsset;
  /** Alta desde la ficha de un cliente: el dueño viene fijo. */
  companyId?: string;
  onClose: () => void;
  onSaved?: (asset: CustomerAsset) => void;
}

type Draft = Record<string, string | boolean>;

function toDraft(type: CustomerAssetType | undefined, values: AssetValues = {}): Draft {
  const draft: Draft = {};
  for (const field of type?.fields ?? []) {
    const v = values[field.key];
    draft[field.key] = field.type === 'BOOLEAN' ? v === true : v === undefined ? '' : String(v);
  }
  return draft;
}

function errorMessage(err: unknown, fallback: string): string {
  const message = (err as AxiosError<{ message?: string | string[] }> | undefined)?.response?.data?.message;
  if (!message) return fallback;
  return Array.isArray(message) ? message.join(', ') : message;
}

/** Alta y edición de una ficha (vehículo, equipo, mascota...). Avisa si ya
 * hay otra con el mismo dato principal, pero deja guardar igual. */
export default function AssetFormModal({ types, asset, companyId, onClose, onSaved }: Props) {
  const queryClient = useQueryClient();
  const [typeId, setTypeId] = useState(asset?.typeId ?? types[0]?.id ?? '');
  const type = types.find((t) => t.id === typeId);
  const [ownerId, setOwnerId] = useState(asset?.company.id ?? companyId ?? '');
  const [draft, setDraft] = useState<Draft>(() => toDraft(type, asset?.values));
  const [duplicates, setDuplicates] = useState<CustomerAsset[] | null>(null);
  const [error, setError] = useState('');
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const perms = useCompanyPermissions();

  const customersQuery = useQuery({
    queryKey: ['companies', 'CUSTOMER'],
    queryFn: () => companiesApi.list('CUSTOMER'),
    enabled: !companyId && !asset,
  });

  const visibleFields = (type?.fields ?? []).filter((f) => !f.hidden);
  const identifier = visibleFields.find((f) => f.isIdentifier);

  function payload(): AssetValues {
    const values: AssetValues = {};
    for (const field of visibleFields) {
      const v = draft[field.key];
      if (field.type === 'BOOLEAN') values[field.key] = v === true;
      else if (typeof v === 'string' && v.trim() !== '') values[field.key] = v.trim();
    }
    return values;
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      asset
        ? customerAssetsApi.update(asset.id, { values: payload() })
        : customerAssetsApi.create({ typeId, companyId: ownerId, values: payload() }),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ['customer-assets'] });
      void queryClient.invalidateQueries({ queryKey: ['customer-asset', saved.id] });
      onSaved?.(saved);
      onClose();
    },
    onError: (err) => {
      setDuplicates(null);
      setError(errorMessage(err, 'No se pudo guardar'));
    },
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!type) return setError('Elegí qué ficha cargar');
    if (!asset && !ownerId) return setError('Elegí el cliente dueño');
    const missing = visibleFields.find((f) => f.required && f.type !== 'BOOLEAN' && !String(draft[f.key] ?? '').trim());
    if (missing) return setError(`Falta "${missing.label}"`);
    // Repetido: se avisa una vez; si confirma, se guarda igual.
    if (identifier && duplicates === null) {
      try {
        const found = await customerAssetsApi.checkIdentifier(type.id, String(draft[identifier.key]), asset?.id);
        if (found.length > 0) {
          setDuplicates(found);
          return;
        }
      } catch {
        // Si el chequeo falla, no se frena la carga.
      }
    }
    saveMutation.mutate();
  }

  function setField(field: AssetFieldDef, value: string | boolean) {
    setDraft((d) => ({ ...d, [field.key]: value }));
    if (field.isIdentifier) setDuplicates(null);
  }

  const title = asset ? `Editar ${asset.typeName.toLowerCase()}` : `Cargar ${type?.name.toLowerCase() ?? 'ficha'}`;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
      <form
        onSubmit={submit}
        className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-y-auto rounded-xl border bg-card p-6 shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="text-muted-foreground hover:text-foreground">
            ✕
          </button>
        </div>

        {!asset && types.length > 1 && (
          <div className="mb-4 flex flex-col gap-1">
            <label className="text-sm text-muted-foreground">Tipo</label>
            <Select
              value={typeId}
              onChange={(id) => {
                setTypeId(id);
                setDraft(toDraft(types.find((t) => t.id === id)));
                setDuplicates(null);
              }}
              options={types.map((t) => ({ value: t.id, label: t.name }))}
            />
          </div>
        )}

        {!asset && !companyId && (
          <div className="mb-4 flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground">Cliente dueño</span>
              {perms.can('CUSTOMER') && (
                <LinkButton onClick={() => setCreatingCustomer(true)}>+ Nuevo cliente</LinkButton>
              )}
            </div>
            <CustomerPicker customers={customersQuery.data ?? []} value={ownerId} onChange={setOwnerId} />
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {visibleFields.map((field) => {
            const id = `asset-${field.key}`;
            const label = `${field.label}${field.required ? ' *' : ''}`;
            if (field.type === 'BOOLEAN') {
              return (
                <label key={field.key} className="flex items-center gap-2 self-end pb-2 text-sm">
                  <input
                    type="checkbox"
                    checked={draft[field.key] === true}
                    onChange={(e) => setField(field, e.target.checked)}
                    className="h-4 w-4 accent-indigo-600"
                  />
                  {field.label}
                </label>
              );
            }
            return (
              <div key={field.key} className={`flex flex-col gap-1 ${field.isIdentifier ? 'sm:col-span-2' : ''}`}>
                <label htmlFor={id} className="text-sm text-muted-foreground">
                  {label}
                </label>
                {field.type === 'SELECT' ? (
                  <Select
                    value={String(draft[field.key] ?? '')}
                    onChange={(v) => setField(field, v)}
                    options={[{ value: '', label: 'Sin elegir' }, ...(field.options ?? []).map((o) => ({ value: o, label: o }))]}
                  />
                ) : (
                  <Input
                    id={id}
                    type={field.type === 'NUMBER' ? 'number' : field.type === 'DATE' ? 'date' : 'text'}
                    inputMode={field.type === 'NUMBER' ? 'decimal' : undefined}
                    step={field.type === 'NUMBER' ? 'any' : undefined}
                    value={String(draft[field.key] ?? '')}
                    onChange={(e) => setField(field, e.target.value)}
                    className={field.isIdentifier ? 'font-mono text-base tracking-wider' : undefined}
                    autoFocus={field.isIdentifier && !asset}
                  />
                )}
              </div>
            );
          })}
        </div>

        {type?.notice && <p className="mt-4 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">{type.notice}</p>}

        {duplicates && duplicates.length > 0 && (
          <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            <p className="font-medium">
              Ya hay {duplicates.length === 1 ? 'otro' : 'otros'} con {identifier?.label.toLowerCase() ?? 'ese dato'}{' '}
              {String(draft[identifier?.key ?? ''] ?? '')}:
            </p>
            <ul className="mt-1 list-disc pl-5">
              {duplicates.map((d) => (
                <li key={d.id}>de {d.company.name}</li>
              ))}
            </ul>
            <p className="mt-1 text-xs">
              Si es el mismo y cambió de dueño, conviene abrir esa ficha y usar &quot;Cambiar dueño&quot;. Si no, podés
              guardar igual.
            </p>
          </div>
        )}

        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? 'Guardando…' : duplicates && duplicates.length > 0 ? 'Guardar igual' : 'Guardar'}
          </Button>
        </div>
      </form>
      {creatingCustomer && (
        <CompanyFormModal
          lockedRole="CUSTOMER"
          onClose={() => setCreatingCustomer(false)}
          onSaved={(c) => setOwnerId(c.id)}
        />
      )}
    </div>
  );
}
