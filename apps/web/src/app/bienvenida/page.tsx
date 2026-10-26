'use client';

import BusinessTemplatePicker from '@/components/business/BusinessTemplatePicker';
import { PlexoLogo } from '@/components/ui/PlexoLogo';
import { businessProfileApi } from '@/lib/businessModules';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

/**
 * Paso "¿A qué se dedica tu negocio?" de un alta nueva (AppShell manda acá
 * mientras BusinessProfile.pending). Sin AppShell a propósito: es el primer
 * paso, todavía no hay menú que mostrar.
 */
export default function BienvenidaPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!localStorage.getItem('token')) router.replace('/login');
  }, [router]);

  const templatesQuery = useQuery({ queryKey: ['business-templates'], queryFn: businessProfileApi.listTemplates });
  const profileQuery = useQuery({ queryKey: ['business-profile'], queryFn: businessProfileApi.get });

  // Ya eligió (o entró acá desde un link viejo): al tablero.
  useEffect(() => {
    if (profileQuery.data && !profileQuery.data.pending) router.replace('/dashboard');
  }, [profileQuery.data, router]);

  function onDone() {
    void queryClient.invalidateQueries({ queryKey: ['business-profile'] });
    router.replace('/dashboard');
  }
  function onError(err: AxiosError<{ message?: string | string[] }>) {
    const message = err.response?.data?.message ?? 'No se pudo guardar. Probá de nuevo.';
    setError(Array.isArray(message) ? message.join(', ') : message);
  }
  const chooseMutation = useMutation({ mutationFn: businessProfileApi.choose, onSuccess: onDone, onError });
  const skipMutation = useMutation({ mutationFn: businessProfileApi.skip, onSuccess: onDone, onError });

  return (
    <div className="min-h-screen bg-background">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-card px-6 py-3.5">
        <PlexoLogo size={26} />
        <span className="text-sm text-muted-foreground">Último paso: tu negocio</span>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <h1 className="text-3xl font-bold leading-tight">¿A qué se dedica tu negocio?</h1>
        <p className="mb-6 mt-2 text-base text-muted-foreground">
          Con esto te dejamos el sistema listo para tu rubro. Lo podés cambiar cuando quieras.
        </p>
        {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
        {templatesQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando rubros…</p>
        ) : (
          <BusinessTemplatePicker
            templates={templatesQuery.data ?? []}
            selectedKey={selectedKey}
            onSelect={setSelectedKey}
            actionLabel="Continuar"
            confirming={chooseMutation.isPending}
            onConfirm={(t) => chooseMutation.mutate(t.key)}
          />
        )}
        <button
          type="button"
          onClick={() => skipMutation.mutate()}
          disabled={skipMutation.isPending}
          className="mt-6 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          Lo elijo después
        </button>
      </main>
    </div>
  );
}
