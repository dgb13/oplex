'use client';

import { Button } from '@/components/ui/button';
import {
  MERCADOPAGO_NEEDS_RECONNECT,
  mercadoPagoApi,
  type MercadoPagoConnectorStatusResponse,
} from '@/lib/mercadopago';
import { profileApi } from '@/lib/profile';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import ConfigurationSection from './ConfigurationSection';
import ConnectPanel from './ConnectPanel';
import MovementsTab from './MovementsTab';
import SummaryTab from './SummaryTab';
import type { MovementOriginFilter } from '@/lib/mercadopago';

type Tab = 'summary' | 'movements' | 'config';

function errorMessage(err: AxiosError<{ message?: string | string[] }>, fallback: string): string {
  const message = err.response?.data?.message ?? fallback;
  return Array.isArray(message) ? message.join(', ') : message;
}

type OAuthResult = 'connected' | 'denied' | 'error';

/**
 * Sección Mercado Pago (docs/planesdemodulos/plan-seccion-mercadopago.md):
 * reemplaza la tarjeta que vivía en Preferencias. Etapas 1-3: conexión,
 * Resumen, Movimientos y Configuración; Links de pago llega en la etapa 4.
 * Dueño/Admin ven todo; el Contador, Resumen y Movimientos.
 * useSearchParams necesita el Suspense (mismo motivo que la tarjeta vieja:
 * si no, rompe el prerender de la ruta).
 */
export default function MercadoPagoPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Cargando...</p>}>
      <MercadoPagoPageInner />
    </Suspense>
  );
}

function MercadoPagoPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: profile } = useQuery({ queryKey: ['profile-me'], queryFn: profileApi.getMe });
  const { data: status, isLoading, refetch } = useQuery({
    queryKey: ['mercadopago-status'],
    queryFn: mercadoPagoApi.getStatus,
  });

  // Vuelta del OAuth (MercadoPagoController.callback redirige acá con
  // ?connector=mercadopago&status=...): el resultado se guarda en estado y
  // se limpia la URL, así un refresh no repite el mensaje.
  const [oauthResult, setOauthResult] = useState<OAuthResult | null>(null);
  useEffect(() => {
    if (searchParams.get('connector') !== 'mercadopago') return;
    const result = searchParams.get('status');
    if (result === 'connected' || result === 'denied' || result === 'error') setOauthResult(result);
    void refetch();
    router.replace('/mercadopago');
  }, [searchParams, refetch, router]);

  const [connectError, setConnectError] = useState('');
  const connectMutation = useMutation({
    mutationFn: mercadoPagoApi.authorize,
    onSuccess: ({ authorizationUrl }) => {
      window.location.href = authorizationUrl;
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      setConnectError(errorMessage(err, 'No se pudo iniciar la conexión con Mercado Pago'));
    },
  });
  function connect() {
    setConnectError('');
    connectMutation.mutate();
  }

  const [tab, setTab] = useState<Tab>('summary');
  // "Ver y asignar" del Resumen abre Movimientos ya filtrado.
  const [movementsOrigin, setMovementsOrigin] = useState<MovementOriginFilter>('all');

  const canManage = profile?.role === 'OWNER' || profile?.role === 'ADMIN';
  const canRead = canManage || profile?.role === 'ACCOUNTANT';
  if (profile && !canRead) {
    return (
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold">Mercado Pago</h1>
        <p className="text-sm text-muted-foreground">
          No tenés permiso para ver esta sección. La conexión con Mercado Pago la maneja el dueño o un administrador.
        </p>
      </div>
    );
  }

  if (isLoading || !status || !profile) {
    return <p className="text-sm text-muted-foreground">Cargando...</p>;
  }

  const linked = status.status === 'CONNECTED' || MERCADOPAGO_NEEDS_RECONNECT.includes(status.status);

  // El Contador no conecta: si no hay cuenta, sólo se lo dice.
  if (!canManage && !linked) {
    return (
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold">Mercado Pago</h1>
        <p className="text-sm text-muted-foreground">
          La empresa todavía no conectó una cuenta de Mercado Pago. La conecta el dueño o un administrador.
        </p>
      </div>
    );
  }

  const tabs: { value: Tab; label: string }[] = [
    { value: 'summary', label: 'Resumen' },
    { value: 'movements', label: 'Movimientos' },
    ...(canManage ? [{ value: 'config' as const, label: 'Configuración' }] : []),
  ];

  return (
    <div className="flex max-w-6xl flex-col gap-6">
      {linked ? <Header status={status} /> : <h1 className="text-xl font-semibold">Mercado Pago</h1>}

      {oauthResult === 'connected' && status.status === 'CONNECTED' && (
        <p className="rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-800 dark:bg-green-950/40 dark:text-green-300">
          Listo: la cuenta de Mercado Pago quedó conectada.
        </p>
      )}

      {linked ? (
        <>
          {status.status !== 'CONNECTED' && canManage && (
            <ReconnectBanner onReconnect={connect} pending={connectMutation.isPending} error={connectError} />
          )}
          <div role="tablist" aria-label="Secciones de Mercado Pago" className="flex flex-wrap gap-1 border-b">
            {tabs.map((t) => (
              <button
                key={t.value}
                type="button"
                role="tab"
                aria-selected={tab === t.value}
                onClick={() => {
                  setTab(t.value);
                  setMovementsOrigin('all');
                }}
                className={`-mb-px h-11 border-b-2 px-4 text-sm transition ${
                  tab === t.value
                    ? 'border-primary font-semibold text-primary'
                    : 'border-transparent font-medium text-muted-foreground hover:text-foreground'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          {tab === 'summary' && (
            <SummaryTab
              onShowUnassigned={() => {
                setMovementsOrigin('unassigned');
                setTab('movements');
              }}
            />
          )}
          {tab === 'movements' && (
            <MovementsTab
              key={movementsOrigin}
              canAssign={canManage}
              connected={status.status === 'CONNECTED'}
              initialOrigin={movementsOrigin}
            />
          )}
          {tab === 'config' && canManage && <ConfigurationSection status={status} />}
        </>
      ) : (
        <ConnectPanel
          onConnect={connect}
          pending={connectMutation.isPending}
          error={connectError}
          oauthResult={oauthResult}
        />
      )}
    </div>
  );
}

function Header({ status }: { status: MercadoPagoConnectorStatusResponse }) {
  const connected = status.status === 'CONNECTED';
  return (
    <div className="flex flex-col gap-1">
      <h1 className="text-xl font-semibold">Mercado Pago</h1>
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            connected
              ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
              : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
          }`}
        >
          {connected ? 'Conectado' : 'Necesita reconexión'}
        </span>
        {status.nickname && (
          <span>
            Cuenta <b className="text-foreground">{status.nickname}</b>
            {status.connectedAt && ` · desde ${new Date(status.connectedAt).toLocaleDateString('es-AR')}`}
          </span>
        )}
      </div>
    </div>
  );
}

function ReconnectBanner({ onReconnect, pending, error }: { onReconnect: () => void; pending: boolean; error: string }) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/40"
    >
      <div className="flex flex-col gap-0.5 text-amber-900 dark:text-amber-200">
        <b className="text-sm">La conexión con Mercado Pago venció</b>
        <span className="text-sm">
          Mientras no reconectes no se pueden crear links ni cobrar con QR. Los cobros anteriores no se pierden.
        </span>
        {error && <span className="text-sm text-destructive">{error}</span>}
      </div>
      <Button type="button" onClick={onReconnect} disabled={pending} className="bg-amber-700 text-white hover:bg-amber-800">
        {pending ? 'Redirigiendo...' : 'Reconectar Mercado Pago'}
      </Button>
    </div>
  );
}
