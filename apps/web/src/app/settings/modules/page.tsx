'use client';

import BusinessTemplatePicker from '@/components/business/BusinessTemplatePicker';
import TemplateUpdatesBanner from '@/components/business/TemplateUpdatesBanner';
import AssetTypeEditor from '@/components/customer-assets/AssetTypeEditor';
import WorkOrderStatusEditor from '@/components/work-orders/WorkOrderStatusEditor';
import ToggleSwitch from '@/components/ToggleSwitch';
import { Button } from '@/components/ui/button';
import {
  BUSINESS_MODULES,
  businessProfileApi,
  isModuleEnabled,
  type BusinessModuleDef,
  type BusinessProfile,
} from '@/lib/businessModules';
import { BusinessTemplateIcon } from '@/lib/businessTemplateIcons';
import { profileApi } from '@/lib/profile';
import { subscriptionsApi } from '@/lib/subscriptions';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import Link from 'next/link';
import { useState } from 'react';
import { isOwnerOrAdmin } from '@/lib/team';

const ALWAYS_ON = [
  { label: 'Artículos y stock', description: 'Productos, servicios, depósitos y movimientos.' },
  { label: 'Compras', description: 'Órdenes de compra, recepciones y facturas de proveedores.' },
  { label: 'Facturación', description: 'Facturas electrónicas, notas de crédito y cobros.' },
  { label: 'Clientes y proveedores', description: 'Fichas, contactos y cuentas.' },
];

function errorMessage(err: unknown, fallback: string): string {
  const message = (err as AxiosError<{ message?: string | string[] }> | undefined)?.response?.data?.message;
  if (!message) return fallback;
  return Array.isArray(message) ? message.join(', ') : message;
}

export default function ModulesPage() {
  const queryClient = useQueryClient();
  const { data: profile } = useQuery({ queryKey: ['profile-me'], queryFn: profileApi.getMe });
  const { data: business } = useQuery({ queryKey: ['business-profile'], queryFn: businessProfileApi.get });
  const { data: subscription } = useQuery({ queryKey: ['subscription-me'], queryFn: subscriptionsApi.getCurrent });
  const [picking, setPicking] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const templatesQuery = useQuery({
    queryKey: ['business-templates'],
    queryFn: businessProfileApi.listTemplates,
    enabled: picking,
  });

  const canManage = isOwnerOrAdmin(profile?.roles);

  function onSaved(next: BusinessProfile) {
    queryClient.setQueryData(['business-profile'], next);
  }
  const chooseMutation = useMutation({
    mutationFn: businessProfileApi.choose,
    onSuccess: (result) => {
      onSaved(result);
      setPicking(false);
      setError('');
      setNotice(
        result.createdCategories.length > 0
          ? `Listo: tu rubro ahora es ${result.template?.name}. Se sumaron las categorías ${result.createdCategories.join(', ')}.`
          : `Listo: tu rubro ahora es ${result.template?.name}.`,
      );
    },
    onError: (err) => setError(errorMessage(err, 'No se pudo cambiar el rubro')),
  });
  const modulesMutation = useMutation({
    mutationFn: businessProfileApi.updateModules,
    onSuccess: (result) => {
      onSaved(result);
      setError('');
    },
    onError: (err) => setError(errorMessage(err, 'No se pudo guardar el cambio')),
  });

  if (profile && !canManage) {
    return (
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold">Rubro y módulos</h1>
        <p className="text-sm text-muted-foreground">Sólo el dueño o un administrador pueden cambiar esto.</p>
      </div>
    );
  }

  function planAllows(module: BusinessModuleDef): boolean {
    if (module.plan === 'production') return Boolean(subscription?.plan.productionModuleEnabled);
    if (module.plan === 'storefront') return Boolean(subscription?.plan.storefrontEnabled);
    return true;
  }

  function toggle(key: string, on: boolean) {
    const current = BUSINESS_MODULES.filter((m) => m.status === 'available' && isModuleEnabled(business, m.key)).map(
      (m) => m.key,
    );
    const next = on ? [...new Set([...current, key])] : current.filter((k) => k !== key);
    modulesMutation.mutate(next);
  }

  const template = business?.template ?? null;
  const fromRubro = new Set(template?.modules ?? []);

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Rubro y módulos</h1>
        <p className="text-sm text-muted-foreground">
          Prendé sólo lo que usás. Apagar un módulo lo saca del menú, pero no borra datos: si lo volvés a prender, está
          todo como lo dejaste.
        </p>
      </div>

      <section className="flex flex-wrap items-center gap-4 rounded-xl border bg-card p-5">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-950/40">
          <BusinessTemplateIcon iconKey={template?.iconKey ?? 'Store'} className="h-7 w-7 text-indigo-600 dark:text-indigo-400" />
        </span>
        <div className="min-w-0 flex-[1_1_240px]">
          <p className="text-xs font-medium text-muted-foreground">Tu rubro</p>
          <p className="text-lg font-bold">{template?.name ?? 'Todavía no elegiste un rubro'}</p>
          {!template && (
            <p className="text-sm text-muted-foreground">
              Elegirlo suma lo que necesita tu rubro. No se apaga nada de lo que ya usás.
            </p>
          )}
        </div>
        <Button type="button" variant={template ? 'outline' : 'default'} onClick={() => setPicking((v) => !v)}>
          {picking ? 'Cancelar' : template ? 'Cambiar rubro' : 'Elegir rubro'}
        </Button>
        {template?.notice && <p className="w-full rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">{template.notice}</p>}
      </section>

      {/* Lo nuevo que Oplex sumó a la plantilla del rubro (etapa 6). */}
      {template && <TemplateUpdatesBanner />}

      {notice && (
        <p role="status" className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300">
          {notice}
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {picking && (
        <section className="rounded-xl border bg-muted/30 p-5">
          {templatesQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Cargando rubros…</p>
          ) : (
            <BusinessTemplatePicker
              templates={templatesQuery.data ?? []}
              selectedKey={selectedKey ?? template?.key ?? null}
              onSelect={setSelectedKey}
              actionLabel={template ? 'Cambiar a este rubro' : 'Elegir este rubro'}
              confirming={chooseMutation.isPending}
              onConfirm={(t) => chooseMutation.mutate(t.key)}
              footnote="Cambiar de rubro sólo agrega: no se apaga ningún módulo que ya tengas prendido."
            />
          )}
        </section>
      )}

      <section className="rounded-xl border bg-card p-5">
        <h2 className="text-base font-semibold">Siempre incluidos</h2>
        <p className="mb-3 text-sm text-muted-foreground">Los usa cualquier negocio, por eso no se apagan.</p>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {ALWAYS_ON.map((m) => (
            <div key={m.label} className="rounded-lg border px-3 py-2.5">
              <p className="text-sm font-medium">{m.label}</p>
              <p className="text-xs text-muted-foreground">{m.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border bg-card p-5">
        <h2 className="mb-3 text-base font-semibold">Módulos</h2>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {BUSINESS_MODULES.filter((m) => m.status === 'available').map((m) => {
            const allowed = planAllows(m);
            const on = allowed && isModuleEnabled(business, m.key);
            return (
              <div key={m.key} className="flex items-start gap-3 rounded-lg border px-3 py-2.5">
                {allowed ? (
                  <div className="pt-0.5">
                    <ToggleSwitch
                      checked={on}
                      label={`${m.label}: ${on ? 'prendido' : 'apagado'}`}
                      onChange={(checked) => toggle(m.key, checked)}
                    />
                  </div>
                ) : null}
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                    {m.label}
                    {fromRubro.has(m.key) && (
                      <span className="rounded-full bg-indigo-50 px-1.5 py-0.5 text-[11px] font-semibold text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">
                        de tu rubro
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">{m.description}</p>
                  {!allowed && (
                    <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                      No está en tu plan.{' '}
                      <Link href="/settings/billing" className="font-medium underline">
                        Ver planes
                      </Link>
                    </p>
                  )}
                  {allowed && !on && business?.modulesConfigured && (
                    <p className="mt-1 text-xs text-muted-foreground">Apagado: no aparece en el menú. Los datos quedan guardados.</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Campos de la ficha (Vehículo, Equipo...) - sólo con Fichas prendido. */}
      {business && isModuleEnabled(business, 'fichas') && <AssetTypeEditor />}
      {/* Estados de las órdenes de trabajo - sólo con el módulo prendido. */}
      {business && isModuleEnabled(business, 'ordenes-trabajo') && <WorkOrderStatusEditor />}

      <section className="rounded-xl border bg-card p-5">
        <h2 className="text-base font-semibold">Próximamente</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          Los que trae tu rubro quedan incluidos y se activan cuando salgan.
        </p>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {BUSINESS_MODULES.filter((m) => m.status !== 'available').map((m) => {
            const included = Boolean(business?.modulesConfigured && business.enabledModules.includes(m.key));
            return (
              <div key={m.key} className="rounded-lg border border-dashed px-3 py-2.5">
                <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                  {m.label}
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
                    {m.status === 'upcoming' ? 'Próximamente' : 'Más adelante'}
                  </span>
                  {included && (
                    <span className="rounded-full bg-indigo-50 px-1.5 py-0.5 text-[11px] font-semibold text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">
                      incluido en tu rubro
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">{m.description}</p>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
