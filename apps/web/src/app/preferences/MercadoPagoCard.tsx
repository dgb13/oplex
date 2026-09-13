'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { mercadoPagoApi, type MercadoPagoConnectorStatusResponse } from '@/lib/mercadopago';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

function errorMessage(err: AxiosError<{ message?: string | string[] }>, fallback: string): string {
  const message = err.response?.data?.message ?? fallback;
  return Array.isArray(message) ? message.join(', ') : message;
}

const STATUS_PILL: Record<MercadoPagoConnectorStatusResponse['status'], string> = {
  DISCONNECTED: 'bg-muted text-muted-foreground',
  PENDING: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400',
  CONNECTED: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400',
  EXPIRED: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400',
  REVOKED: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400',
  ERROR: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400',
};

const STATUS_LABEL: Record<MercadoPagoConnectorStatusResponse['status'], string> = {
  DISCONNECTED: 'No conectado',
  PENDING: 'Vinculación en curso',
  CONNECTED: 'Conectado',
  EXPIRED: 'Necesita reconexión (venció)',
  REVOKED: 'Necesita reconexión (desautorizado desde Mercado Pago)',
  ERROR: 'Necesita reconexión',
};

/**
 * Diseñada como grilla de conectores desde el día uno (aunque hoy sólo
 * exista Mercado Pago) - Tiendanube/Mercado Libre son cards nuevas acá
 * mismo el día que existan, sin rediseñar nada. Mismo patrón de card que
 * AfipCertificateCard (la otra integración externa de esta página): un
 * estado claro arriba, acciones abajo, nunca el error crudo del proveedor
 * (ver errorMessage).
 */
export default function MercadoPagoCard() {
  return (
    <Suspense fallback={<IntegrationsGridSkeleton />}>
      <MercadoPagoCardInner />
    </Suspense>
  );
}

function IntegrationsGridSkeleton() {
  return (
    <Card>
      <CardContent>
        <h2 className="mb-1 text-sm font-medium text-muted-foreground">Integraciones</h2>
        <p className="text-xs text-muted-foreground">Cargando...</p>
      </CardContent>
    </Card>
  );
}

function MercadoPagoCardInner() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const [error, setError] = useState('');

  const { data: status, isLoading } = useQuery({
    queryKey: ['mercadopago-status'],
    queryFn: mercadoPagoApi.getStatus,
  });

  // Vuelta del callback de OAuth (ver MercadoPagoController.callback en el
  // backend, que redirige acá con ?connector=mercadopago&status=...) - se
  // muestra una sola vez y se limpia la URL, así un refresh de página no
  // repite el mensaje.
  const connectorParam = searchParams.get('connector');
  const statusParam = searchParams.get('status');
  useEffect(() => {
    if (connectorParam !== 'mercadopago') return;
    void queryClient.invalidateQueries({ queryKey: ['mercadopago-status'] });
    router.replace('/preferences');
  }, [connectorParam, statusParam, queryClient, router]);

  const connectMutation = useMutation({
    mutationFn: mercadoPagoApi.authorize,
    onSuccess: ({ authorizationUrl }) => {
      window.location.href = authorizationUrl;
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      setError(errorMessage(err, 'No se pudo iniciar la vinculación con Mercado Pago'));
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: mercadoPagoApi.disconnect,
    onSuccess: () => {
      setConfirmingDisconnect(false);
      setError('');
      void queryClient.invalidateQueries({ queryKey: ['mercadopago-status'] });
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      setError(errorMessage(err, 'No se pudo desconectar Mercado Pago'));
    },
  });

  return (
    <Card>
      <CardContent>
        <h2 className="mb-1 text-sm font-medium text-muted-foreground">Integraciones</h2>
        <p className="mb-4 text-xs text-muted-foreground">
          Conectá servicios externos para cobrar facturas y cotizaciones directamente desde Oplex.
        </p>

        {connectorParam === 'mercadopago' && statusParam === 'denied' && (
          <p className="mb-4 text-xs text-amber-600 dark:text-amber-400">
            Cancelaste la vinculación con Mercado Pago - no se conectó ninguna cuenta.
          </p>
        )}
        {connectorParam === 'mercadopago' && statusParam === 'error' && (
          <p className="mb-4 text-xs text-destructive">
            No se pudo completar la vinculación con Mercado Pago. Probá de nuevo o revisá que hayas
            usado la cuenta correcta.
          </p>
        )}
        {connectorParam === 'mercadopago' && statusParam === 'connected' && (
          <p className="mb-4 text-xs text-green-600 dark:text-green-400">
            Cuenta de Mercado Pago vinculada correctamente.
          </p>
        )}

        <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-500/10 text-sm font-bold text-sky-600 dark:text-sky-400">
              MP
            </span>
            <div>
              <p className="text-sm font-medium">Mercado Pago</p>
              {isLoading ? (
                <p className="text-xs text-muted-foreground">Cargando...</p>
              ) : status ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_PILL[status.status]}`}>
                    {STATUS_LABEL[status.status]}
                  </span>
                  {status.status === 'CONNECTED' && status.nickname && (
                    <span className="text-xs text-muted-foreground">como {status.nickname}</span>
                  )}
                  {status.status === 'CONNECTED' && status.connectedAt && (
                    <span className="text-xs text-muted-foreground">
                      · desde el {new Date(status.connectedAt).toLocaleDateString('es-AR')}
                    </span>
                  )}
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {status?.status === 'CONNECTED' ? (
              confirmingDisconnect ? (
                <>
                  <button
                    onClick={() => disconnectMutation.mutate()}
                    disabled={disconnectMutation.isPending}
                    className="text-xs font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 disabled:opacity-50"
                  >
                    {disconnectMutation.isPending ? 'Desconectando...' : 'Confirmar'}
                  </button>
                  <button
                    onClick={() => setConfirmingDisconnect(false)}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Cancelar
                  </button>
                </>
              ) : (
                <Button type="button" variant="outline" size="sm" onClick={() => setConfirmingDisconnect(true)}>
                  Desconectar
                </Button>
              )
            ) : (
              <button
                onClick={() => {
                  setError('');
                  connectMutation.mutate();
                }}
                disabled={connectMutation.isPending}
                className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-500 disabled:opacity-50"
              >
                {connectMutation.isPending
                  ? 'Redirigiendo...'
                  : status?.status && ['EXPIRED', 'REVOKED', 'ERROR'].includes(status.status)
                    ? 'Reconectar Mercado Pago'
                    : 'Conectar Mercado Pago'}
              </button>
            )}
          </div>
        </div>

        {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
