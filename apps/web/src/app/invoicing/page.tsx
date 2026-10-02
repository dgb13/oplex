'use client';

import { arcaUnregisteredApi } from '@/lib/invoicing';
import { profileApi } from '@/lib/profile';
import { useQuery } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import ArcaUnregisteredModal, { voucherLabel } from './ArcaUnregisteredModal';
import GestionTab from './GestionTab';
import ResumenTab from './ResumenTab';

const TABS = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'gestion', label: 'Gestión' },
] as const;

type TabId = (typeof TABS)[number]['id'];

// Mismos roles que la API de comprobantes de ARCA sin registrar.
const ARCA_ROLES = ['OWNER', 'ADMIN', 'ACCOUNTANT'];

function InvoicingScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<TabId>('resumen');

  const { data: profile } = useQuery({ queryKey: ['profile-me'], queryFn: profileApi.getMe });
  const canSeeArca = !!profile && ARCA_ROLES.includes(profile.role);
  const arcaQuery = useQuery({
    queryKey: ['arca-unregistered'],
    queryFn: arcaUnregisteredApi.list,
    enabled: canSeeArca,
  });
  const arcaPending = (arcaQuery.data ?? []).filter((v) => !v.resolvedAt);
  // El aviso de la campana llega con ?arca=pendientes.
  const arcaOpen = canSeeArca && searchParams.get('arca') === 'pendientes';

  function setArcaOpen(open: boolean) {
    router.replace(open ? '/invoicing?arca=pendientes' : '/invoicing', { scroll: false });
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Facturación</h1>

      <div className="flex gap-2 border-b">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-sm font-medium transition ${
              tab === t.id ? 'border-b-2 border-primary text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {arcaPending.length > 0 && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-amber-50 px-4 py-2.5 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300"
        >
          <span>
            <span className="font-semibold">
              {arcaPending.length === 1
                ? 'ARCA tiene 1 comprobante autorizado que no está en Oplex'
                : `ARCA tiene ${arcaPending.length} comprobantes autorizados que no están en Oplex`}
            </span>
            {arcaPending.length === 1 &&
              ` · ${voucherLabel(arcaPending[0])}${arcaPending[0].total ? ` · $${Number(arcaPending[0].total).toFixed(2)}` : ''}`}
          </span>
          <button
            onClick={() => setArcaOpen(true)}
            className="rounded-lg border border-current px-3 py-1 text-sm font-semibold transition hover:bg-amber-100 dark:hover:bg-amber-900"
          >
            Revisar
          </button>
        </div>
      )}

      {tab === 'resumen' && <ResumenTab />}
      {tab === 'gestion' && <GestionTab />}

      {arcaOpen && <ArcaUnregisteredModal onClose={() => setArcaOpen(false)} />}
    </div>
  );
}

export default function InvoicingPage() {
  return (
    <Suspense fallback={null}>
      <InvoicingScreen />
    </Suspense>
  );
}
