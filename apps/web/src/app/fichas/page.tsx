'use client';

import AssetFormModal from '@/components/customer-assets/AssetFormModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { businessProfileApi, isModuleEnabled } from '@/lib/businessModules';
import { BusinessTemplateIcon } from '@/lib/businessTemplateIcons';
import { assetSummary, customerAssetsApi } from '@/lib/customerAssets';
import { profileApi } from '@/lib/profile';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

/** Fichas del cliente: vehículos de un taller, equipos de un service... Se
 * busca por el dato principal (patente, n° de serie) o por el dueño. */
export default function FichasPage() {
  const router = useRouter();
  const { data: profile } = useQuery({ queryKey: ['profile-me'], queryFn: profileApi.getMe });
  const { data: business } = useQuery({ queryKey: ['business-profile'], queryFn: businessProfileApi.get });
  const enabled = business ? isModuleEnabled(business, 'fichas') : undefined;
  const typesQuery = useQuery({
    queryKey: ['customer-asset-types'],
    queryFn: customerAssetsApi.listTypes,
    enabled: enabled === true,
  });
  const types = typesQuery.data ?? [];
  const [typeId, setTypeId] = useState('');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);

  // La búsqueda va al servidor con una pausa corta, no en cada tecla.
  useEffect(() => {
    const t = setTimeout(() => setSearch(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  const activeTypeId = typeId || types[0]?.id || '';
  const type = types.find((t) => t.id === activeTypeId);
  const assetsQuery = useQuery({
    queryKey: ['customer-assets', activeTypeId, search],
    queryFn: () => customerAssetsApi.list({ typeId: activeTypeId, q: search }),
    enabled: Boolean(activeTypeId),
  });
  const assets = assetsQuery.data ?? [];
  const canWrite = profile?.role === 'OWNER' || profile?.role === 'ADMIN' || profile?.role === 'SALES';
  const canConfigure = profile?.role === 'OWNER' || profile?.role === 'ADMIN';
  const identifierLabel = type?.fields.find((f) => f.isIdentifier)?.label ?? 'Dato principal';

  if (enabled === false) {
    return (
      <div className="flex max-w-xl flex-col gap-2">
        <h1 className="text-xl font-semibold">Fichas</h1>
        <p className="text-sm text-muted-foreground">
          El módulo Fichas está apagado. Se prende en tu menú de usuario → <Link href="/settings/modules" className="underline">Rubro y módulos</Link>.
        </p>
      </div>
    );
  }

  return (
    <div className="flex max-w-6xl flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-950/40">
            <BusinessTemplateIcon iconKey={business?.template?.iconKey ?? 'ClipboardList'} className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          </span>
          <div>
            <h1 className="text-xl font-semibold">{type?.pluralName ?? 'Fichas'}</h1>
            <p className="text-sm text-muted-foreground">
              {type ? `Cada ${type.name.toLowerCase()} de tus clientes, con su historial.` : 'Cargando…'}
            </p>
          </div>
        </div>
        {canWrite && type && <Button onClick={() => setCreating(true)}>+ Nuevo {type.name.toLowerCase()}</Button>}
      </div>

      {types.length > 1 && (
        <div role="tablist" className="flex flex-wrap gap-1.5">
          {types.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={t.id === activeTypeId}
              onClick={() => setTypeId(t.id)}
              className={`h-8 rounded-full border px-3 text-xs font-medium ${
                t.id === activeTypeId ? 'border-indigo-600 bg-indigo-600 text-white' : 'bg-card'
              }`}
            >
              {t.pluralName}
            </button>
          ))}
        </div>
      )}

      {typesQuery.isSuccess && types.length === 0 ? (
        <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
          Todavía no definiste qué fichas usás.{' '}
          {canConfigure ? (
            <Link href="/settings/modules" className="font-medium text-indigo-600 underline">
              Creala en Rubro y módulos
            </Link>
          ) : (
            'Pedíselo al dueño de la cuenta.'
          )}
        </div>
      ) : (
        <>
          <div className="max-w-md">
            <label htmlFor="fichas-q" className="sr-only">
              Buscar
            </label>
            <Input
              id="fichas-q"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Buscá por ${identifierLabel.toLowerCase()} o por cliente`}
              className="h-10"
            />
          </div>

          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-xs text-muted-foreground">
                  <th className="p-3">{identifierLabel}</th>
                  <th className="p-3">Datos</th>
                  <th className="p-3">Cliente</th>
                  <th className="p-3">Actualizado</th>
                </tr>
              </thead>
              <tbody>
                {assetsQuery.isLoading ? (
                  <tr>
                    <td colSpan={4} className="p-4 text-muted-foreground">
                      Cargando…
                    </td>
                  </tr>
                ) : assets.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-4 text-muted-foreground">
                      {search ? 'No hay resultados para esa búsqueda.' : `Todavía no cargaste ningún ${type?.name.toLowerCase() ?? 'registro'}.`}
                    </td>
                  </tr>
                ) : (
                  assets.map((a) => (
                    <tr
                      key={a.id}
                      onClick={() => router.push(`/fichas/${a.id}`)}
                      className="cursor-pointer border-b last:border-0 hover:bg-muted/40"
                    >
                      <td className="p-3">
                        <Link href={`/fichas/${a.id}`} className="font-mono font-semibold tracking-wider" onClick={(e) => e.stopPropagation()}>
                          {a.identifier}
                        </Link>
                      </td>
                      <td className="p-3 text-muted-foreground">{assetSummary(type, a) || '—'}</td>
                      <td className="p-3">{a.company.name}</td>
                      <td className="p-3 text-muted-foreground">{new Date(a.updatedAt).toLocaleDateString('es-AR')}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {creating && type && (
        <AssetFormModal
          types={types}
          onClose={() => setCreating(false)}
          onSaved={(saved) => router.push(`/fichas/${saved.id}`)}
        />
      )}
    </div>
  );
}
