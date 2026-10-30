'use client';

import CompanyDetailModal from '@/components/CompanyDetailModal';
import CompanyFormModal from '@/components/CompanyFormModal';
import AssetFormModal from '@/components/customer-assets/AssetFormModal';
import CustomerPicker from '@/components/sales/CustomerPicker';
import AssetWorkOrderHistory from '@/components/work-orders/AssetWorkOrderHistory';
import { Button } from '@/components/ui/button';
import { businessProfileApi } from '@/lib/businessModules';
import { BusinessTemplateIcon } from '@/lib/businessTemplateIcons';
import { companiesApi } from '@/lib/companies';
import { assetSummary, customerAssetsApi, formatAssetValue } from '@/lib/customerAssets';
import { profileApi } from '@/lib/profile';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { hasAnyRole } from '@/lib/team';

/** Ficha de un vehículo / equipo / mascota (maqueta aprobada, pantalla 4),
 * con su historial de órdenes de trabajo. */
export default function FichaPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { data: profile } = useQuery({ queryKey: ['profile-me'], queryFn: profileApi.getMe });
  const { data: business } = useQuery({ queryKey: ['business-profile'], queryFn: businessProfileApi.get });
  const assetQuery = useQuery({ queryKey: ['customer-asset', id], queryFn: () => customerAssetsApi.get(id) });
  const typesQuery = useQuery({ queryKey: ['customer-asset-types'], queryFn: customerAssetsApi.listTypes });
  const asset = assetQuery.data;
  const type = typesQuery.data?.find((t) => t.id === asset?.typeId);
  const [editing, setEditing] = useState(false);
  const [changingOwner, setChangingOwner] = useState(false);
  const [newOwnerId, setNewOwnerId] = useState('');
  const [showOwner, setShowOwner] = useState(false);
  const [editingOwner, setEditingOwner] = useState(false);
  const [error, setError] = useState('');
  const canWrite = hasAnyRole(profile?.roles, ['OWNER', 'ADMIN', 'SALES']);

  const customersQuery = useQuery({
    queryKey: ['companies', 'CUSTOMER'],
    queryFn: () => companiesApi.list('CUSTOMER'),
    enabled: changingOwner,
  });
  const ownerQuery = useQuery({
    queryKey: ['company', asset?.company.id],
    queryFn: () => companiesApi.get(asset?.company.id ?? ''),
    enabled: showOwner && Boolean(asset),
  });

  const updateMutation = useMutation({
    mutationFn: (input: { companyId?: string; active?: boolean }) => customerAssetsApi.update(id, input),
    onSuccess: (saved) => {
      queryClient.setQueryData(['customer-asset', id], saved);
      void queryClient.invalidateQueries({ queryKey: ['customer-assets'] });
      setChangingOwner(false);
      setNewOwnerId('');
      setError('');
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo guardar';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  if (assetQuery.isError) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">No se encontró esta ficha.</p>
        <Link href="/fichas" className="text-sm text-indigo-600 underline">
          Volver
        </Link>
      </div>
    );
  }
  if (!asset) return <p className="text-sm text-muted-foreground">Cargando…</p>;

  const fields = (type?.fields ?? []).filter((f) => !f.isIdentifier && !f.hidden);
  const summary = assetSummary(type, asset, 4);

  return (
    <div className="flex max-w-5xl flex-col gap-4">
      <Link href="/fichas" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {type?.pluralName ?? 'Fichas'}
      </Link>

      <section className="flex flex-wrap items-center gap-4 rounded-xl border bg-card p-5">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 dark:bg-indigo-950/40">
          <BusinessTemplateIcon iconKey={business?.template?.iconKey ?? 'Store'} className="h-8 w-8 text-indigo-600 dark:text-indigo-400" />
        </span>
        <div className="min-w-0 flex-[1_1_260px]">
          <span className="inline-block rounded-md border-2 border-foreground px-2.5 py-0.5 font-mono text-xl font-semibold tracking-widest">
            {asset.identifier}
          </span>
          {!asset.active && (
            <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">Inactivo</span>
          )}
          {summary && <p className="mt-1.5 text-base font-semibold">{summary}</p>}
          <p className="mt-0.5 text-sm text-muted-foreground">
            Dueño:{' '}
            <button type="button" onClick={() => setShowOwner(true)} className="font-medium text-indigo-600 underline-offset-2 hover:underline">
              {asset.company.name}
            </button>
            {asset.company.phone ? ` · ${asset.company.phone}` : ''}
          </p>
        </div>
        {canWrite && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setEditing(true)}>
              Editar datos
            </Button>
            <Button variant="outline" onClick={() => setChangingOwner((v) => !v)}>
              Cambiar dueño
            </Button>
          </div>
        )}

        {changingOwner && (
          <div className="w-full border-t pt-4">
            <p className="mb-2 text-sm font-medium">Nuevo dueño</p>
            <p className="mb-2 text-xs text-muted-foreground">
              Para cuando se vende: la ficha y su historial pasan al cliente nuevo.
            </p>
            <CustomerPicker customers={(customersQuery.data ?? []).filter((c) => c.id !== asset.company.id)} value={newOwnerId} onChange={setNewOwnerId} />
            <div className="mt-3 flex gap-2">
              <Button disabled={!newOwnerId || updateMutation.isPending} onClick={() => updateMutation.mutate({ companyId: newOwnerId })}>
                Pasar a este cliente
              </Button>
              <Button variant="ghost" onClick={() => setChangingOwner(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        )}

        {fields.length > 0 && (
          <dl className="grid w-full grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3 border-t pt-4">
            {fields.map((f) => (
              <div key={f.key}>
                <dt className="text-xs text-muted-foreground">{f.label}</dt>
                <dd className="mt-0.5 text-sm font-semibold">{formatAssetValue(f, asset.values[f.key]) || '—'}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <AssetWorkOrderHistory assetId={asset.id} customerId={asset.company.id} type={type} />

      {canWrite && (
        <div>
          <Button
            variant="ghost"
            className="text-muted-foreground"
            disabled={updateMutation.isPending}
            onClick={() => updateMutation.mutate({ active: !asset.active })}
          >
            {asset.active ? 'Dar de baja esta ficha' : 'Volver a activar'}
          </Button>
        </div>
      )}

      {editing && type && (
        <AssetFormModal types={[type]} asset={asset} onClose={() => setEditing(false)} onSaved={(saved) => queryClient.setQueryData(['customer-asset', id], saved)} />
      )}
      {showOwner && ownerQuery.data && (
        <CompanyDetailModal
          company={ownerQuery.data}
          onClose={() => setShowOwner(false)}
          onEdit={() => {
            setShowOwner(false);
            setEditingOwner(true);
          }}
        />
      )}
      {editingOwner && ownerQuery.data && (
        <CompanyFormModal
          company={ownerQuery.data}
          lockedRole="CUSTOMER"
          onClose={() => setEditingOwner(false)}
          onSaved={() => {
            void queryClient.invalidateQueries({ queryKey: ['customer-asset', id] });
            void queryClient.invalidateQueries({ queryKey: ['company', asset.company.id] });
          }}
        />
      )}
    </div>
  );
}
