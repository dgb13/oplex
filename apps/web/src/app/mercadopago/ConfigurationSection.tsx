'use client';

import RegisterQrModal from '@/app/settings/pos/RegisterQrModal';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { mercadoPagoApi, type MercadoPagoConnectorStatusResponse } from '@/lib/mercadopago';
import { posApi, type CashRegister } from '@/lib/pos';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import Link from 'next/link';
import { useState } from 'react';

function errorMessage(err: AxiosError<{ message?: string | string[] }>, fallback: string): string {
  const message = err.response?.data?.message ?? fallback;
  return Array.isArray(message) ? message.join(', ') : message;
}

/** Configuración de la sección (etapa 1): la cuenta conectada y el QR de
 * cada caja. Los interruptores de links de pago y la cuenta de dinero
 * llegan en la etapa 4. */
export default function ConfigurationSection({ status }: { status: MercadoPagoConnectorStatusResponse }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(340px,1fr))] items-start gap-4">
      <RegistersQrCard canActivate={status.status === 'CONNECTED'} />
      <ConnectedAccountCard status={status} />
    </div>
  );
}

function RegistersQrCard({ canActivate }: { canActivate: boolean }) {
  const { data: registers, isLoading } = useQuery({
    queryKey: ['pos-registers', 'active'],
    queryFn: () => posApi.listRegisters(),
  });
  const [qrFor, setQrFor] = useState<CashRegister | null>(null);

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div>
          <h2 className="text-base font-semibold">QR por caja</h2>
          <p className="text-sm text-muted-foreground">El cliente escanea el QR de la caja al pagar.</p>
        </div>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando cajas...</p>
        ) : !registers || registers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Todavía no hay cajas. Creá una en{' '}
            <Link href="/settings/pos" className="text-primary hover:underline">
              Cajas (POS)
            </Link>
            .
          </p>
        ) : (
          <ul className="flex flex-col">
            {registers.map((register) => (
              <li
                key={register.id}
                className="flex items-center justify-between gap-3 border-t border-border/70 py-2.5 text-sm"
              >
                <span>
                  {register.name}
                  <span className="text-muted-foreground"> · {register.branch.name}</span>
                </span>
                {register.mpPosId ? (
                  <button
                    type="button"
                    onClick={() => setQrFor(register)}
                    className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-800 transition hover:bg-green-200 dark:bg-green-900/40 dark:text-green-300"
                  >
                    QR activo
                  </button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!canActivate}
                    onClick={() => setQrFor(register)}
                    title={canActivate ? undefined : 'Reconectá Mercado Pago para crear el QR'}
                  >
                    Crear QR
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      {qrFor && <RegisterQrModal register={qrFor} onClose={() => setQrFor(null)} />}
    </Card>
  );
}

function ConnectedAccountCard({ status }: { status: MercadoPagoConnectorStatusResponse }) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');

  const disconnectMutation = useMutation({
    mutationFn: mercadoPagoApi.disconnect,
    onSuccess: () => {
      setConfirming(false);
      setError('');
      void queryClient.invalidateQueries({ queryKey: ['mercadopago-status'] });
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      setError(errorMessage(err, 'No se pudo desconectar Mercado Pago'));
    },
  });

  const connectedOn = status.connectedAt ? new Date(status.connectedAt).toLocaleDateString('es-AR') : null;

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Cuenta conectada</h2>
        <p className="text-sm text-muted-foreground">
          {status.nickname ?? 'Cuenta de Mercado Pago'}
          {status.connectedByName && ` · conectada por ${status.connectedByName}`}
          {connectedOn && ` el ${connectedOn}`}.
        </p>
        {confirming ? (
          <div className="flex flex-col gap-2 rounded-lg border border-red-200 p-3 dark:border-red-900">
            <p className="text-sm">
              ¿Desconectar Mercado Pago? Se dejan de crear links y de cobrar con QR hasta que se vuelva a conectar.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="destructive"
                onClick={() => disconnectMutation.mutate()}
                disabled={disconnectMutation.isPending}
              >
                {disconnectMutation.isPending ? 'Desconectando...' : 'Sí, desconectar'}
              </Button>
              <Button type="button" variant="outline" onClick={() => setConfirming(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirming(true)}
              className="border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40"
            >
              Desconectar Mercado Pago
            </Button>
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
