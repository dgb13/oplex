'use client';

import { businessProfileApi, isModuleEnabled } from '@/lib/businessModules';
import { assetSummary, customerAssetsApi } from '@/lib/customerAssets';
import { profileApi } from '@/lib/profile';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import AssetFormModal from './AssetFormModal';

/** Vehículos / equipos / mascotas de un cliente, dentro de su ficha. Sólo
 * si el negocio usa el módulo Fichas. */
export default function CustomerAssetsSection({ companyId, readOnly }: { companyId: string; readOnly?: boolean }) {
  const { data: profile } = useQuery({ queryKey: ['profile-me'], queryFn: profileApi.getMe });
  const { data: business } = useQuery({ queryKey: ['business-profile'], queryFn: businessProfileApi.get });
  const enabled = isModuleEnabled(business, 'fichas') && Boolean(business);
  const typesQuery = useQuery({ queryKey: ['customer-asset-types'], queryFn: customerAssetsApi.listTypes, enabled });
  const assetsQuery = useQuery({
    queryKey: ['customer-assets', 'company', companyId],
    queryFn: () => customerAssetsApi.list({ companyId }),
    enabled: enabled && (typesQuery.data?.length ?? 0) > 0,
  });
  const [creating, setCreating] = useState(false);

  const types = typesQuery.data ?? [];
  if (!enabled || types.length === 0) return null;
  const canWrite = !readOnly && (profile?.role === 'OWNER' || profile?.role === 'ADMIN' || profile?.role === 'SALES');
  const title = types.length === 1 ? types[0].pluralName : 'Fichas';
  const assets = assetsQuery.data ?? [];

  return (
    <div className="mt-6 border-t pt-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
        {canWrite && (
          <button type="button" onClick={() => setCreating(true)} className="text-xs font-medium text-indigo-600 hover:underline">
            + Agregar {types.length === 1 ? types[0].name.toLowerCase() : 'ficha'}
          </button>
        )}
      </div>
      {assets.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin {title.toLowerCase()} cargados.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {assets.map((a) => (
            <li key={a.id}>
              <Link
                href={`/fichas/${a.id}`}
                className="flex flex-wrap items-baseline gap-x-2 rounded-lg bg-muted/50 px-3 py-2 text-sm hover:bg-muted"
              >
                <span className="font-mono font-semibold tracking-wider">{a.identifier}</span>
                <span className="text-muted-foreground">{assetSummary(types.find((t) => t.id === a.typeId), a)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {creating && <AssetFormModal types={types} companyId={companyId} onClose={() => setCreating(false)} />}
    </div>
  );
}
