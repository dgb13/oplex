'use client';

import RegisterQrModal from '@/app/settings/pos/RegisterQrModal';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import ToggleSwitch from '@/components/ToggleSwitch';
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

/** Configuración de la sección: dónde se cobra con Mercado Pago, el QR de
 * cada caja, en qué cuenta de dinero entra la plata y la cuenta conectada
 * (etapas 1 y 4 de plan-seccion-mercadopago.md). */
export default function ConfigurationSection({ status }: { status: MercadoPagoConnectorStatusResponse }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(340px,1fr))] items-start gap-4">
      <ChannelsCard />
      <div className="flex flex-col gap-4">
        <RegistersQrCard canActivate={status.status === 'CONNECTED'} />
        <ReceiptAccountCard />
        <ConnectedAccountCard status={status} />
      </div>
    </div>
  );
}

function useMercadoPagoSettings() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['mercadopago-settings'], queryFn: mercadoPagoApi.getSettings });
  const [error, setError] = useState('');
  const mutation = useMutation({
    mutationFn: mercadoPagoApi.updateSettings,
    onSuccess: (settings) => {
      setError('');
      queryClient.setQueryData(['mercadopago-settings'], settings);
      // El estado lleva linksEnabled (botón de Facturación).
      void queryClient.invalidateQueries({ queryKey: ['mercadopago-status'] });
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) =>
      setError(errorMessage(err, 'No se pudo guardar el cambio')),
  });
  return { settings: query.data, update: mutation.mutate, pending: mutation.isPending, error };
}

function ChannelsCard() {
  const { settings, update, pending, error } = useMercadoPagoSettings();
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Dónde cobrás con Mercado Pago</h2>
        <Channel
          title="Links de pago en facturas y cotizaciones"
          detail='Botón "Cobrar con Mercado Pago" en Facturación y links del asistente.'
        >
          {settings ? (
            <ToggleSwitch
              checked={settings.linksEnabled}
              onChange={(checked) => !pending && update({ linksEnabled: checked })}
              label={settings.linksEnabled ? 'Links de pago: prendidos' : 'Links de pago: apagados'}
            />
          ) : null}
        </Channel>
        <Channel title="QR en las cajas" detail="Se prende y apaga en cada caja, en QR por caja.">
          <span className="text-xs text-muted-foreground">Por caja</span>
        </Channel>
        <Channel title="Asistente" detail="Puede mandar el link de pago de una factura por correo, si los links están prendidos.">
          <Link href="/preferences/assistant" className="whitespace-nowrap text-sm text-primary hover:underline">
            Configurar
          </Link>
        </Channel>
        <Channel title="Tienda online" detail="El cobro con Mercado Pago en la tienda todavía no está disponible.">
          <span className="whitespace-nowrap rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
            Próximamente
          </span>
        </Channel>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}

function Channel({ title, detail, children }: { title: string; detail: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border/70 pt-3">
      <div className="flex flex-col gap-0.5">
        <b className="text-sm">{title}</b>
        <span className="text-sm text-muted-foreground">{detail}</span>
      </div>
      {children}
    </div>
  );
}

function ReceiptAccountCard() {
  const { settings, update, pending, error } = useMercadoPagoSettings();
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Dónde se registra la plata en Oplex</h2>
        {!settings ? (
          <p className="text-sm text-muted-foreground">Cargando...</p>
        ) : (
          <label className="flex flex-col gap-1.5 text-sm text-muted-foreground">
            Cuenta de dinero para los cobros de Mercado Pago (links y QR)
            <select
              value={settings.financialAccountId}
              disabled={pending}
              onChange={(e) => update({ financialAccountId: e.target.value })}
              className="h-10 rounded-lg border bg-card px-2.5 text-sm text-foreground"
            >
              {settings.financialAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <p className="text-sm text-muted-foreground">
          Sólo cuentas de Mercado Pago en pesos. Para tener otra (por ejemplo, una por sucursal), creala en{' '}
          <Link href="/reports" className="text-primary hover:underline">
            Contabilidad › Reportes › Financiero
          </Link>
          .
        </p>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
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
