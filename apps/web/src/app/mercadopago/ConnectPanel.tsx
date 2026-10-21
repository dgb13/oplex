'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

const STEPS = [
  { title: 'Tocás "Conectar Mercado Pago"', detail: 'Te llevamos a la página de Mercado Pago.' },
  { title: 'Entrás con tu cuenta y tocás "Autorizar"', detail: 'Oplex nunca ve tu contraseña.' },
  { title: 'Volvés acá solo, ya conectado', detail: 'Si algo sale mal, te decimos qué pasó y cómo seguir.' },
];

const BENEFITS = [
  { title: 'QR en la caja', detail: 'El cliente escanea y el cobro queda en la venta, sin tipear montos.' },
  { title: 'Links con las facturas', detail: 'Mandás el link por correo y cuando pagan se registra solo el cobro.' },
  { title: 'Todo en un lugar', detail: 'La conexión, el QR de cada caja y la configuración, en esta sección.' },
];

/** Pantalla "sin conectar" (mockup, pantalla 2): el botón grande que antes
 * quedaba escondido en una tarjeta de Preferencias. */
export default function ConnectPanel({
  onConnect,
  pending,
  error,
  oauthResult,
}: {
  onConnect: () => void;
  pending: boolean;
  error: string;
  oauthResult: 'connected' | 'denied' | 'error' | null;
}) {
  return (
    <>
      <Card>
        <CardContent className="flex flex-wrap items-center gap-8 p-6 sm:p-8">
          <div className="flex min-w-0 flex-[1_1_380px] flex-col gap-3.5">
            <span className="self-start rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
              No conectado
            </span>
            <h2 className="text-2xl font-semibold leading-tight">
              Conectá tu cuenta de Mercado Pago para cobrar desde Oplex
            </h2>
            <p className="text-[15px] leading-relaxed text-muted-foreground">
              Una sola vez. Después cobrás con QR en la caja y mandás links de pago con las facturas, y el cobro se
              registra solo.
            </p>
            <div>
              <Button type="button" size="lg" onClick={onConnect} disabled={pending} className="h-12 px-6 text-base">
                {pending ? 'Redirigiendo...' : 'Conectar Mercado Pago'}
              </Button>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <p className="text-sm text-muted-foreground">
              Entrá con la cuenta de Mercado Pago <b className="text-foreground">donde querés recibir la plata</b> (la
              del negocio, no una personal).
            </p>
          </div>

          <ol className="flex min-w-0 flex-[1_1_320px] flex-col gap-3.5">
            {STEPS.map((step, i) => (
              <li key={step.title} className="flex items-start gap-3.5">
                <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-primary/10 font-bold text-primary">
                  {i + 1}
                </span>
                <div className="flex flex-col gap-0.5">
                  <b className="text-[15px]">{step.title}</b>
                  <span className="text-sm text-muted-foreground">{step.detail}</span>
                </div>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      {(oauthResult === 'denied' || oauthResult === 'error') && (
        <div
          role="alert"
          className="flex flex-col gap-1 rounded-xl border border-amber-300 bg-amber-50 px-5 py-4 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
        >
          {oauthResult === 'denied' ? (
            <>
              <b className="text-[15px]">Volviste sin conectar</b>
              <span className="text-sm">
                Cancelaste en Mercado Pago o no tocaste &quot;Autorizar&quot;. No se conectó ninguna cuenta: podés
                intentarlo de nuevo cuando quieras.
              </span>
            </>
          ) : (
            <>
              <b className="text-[15px]">No se pudo terminar la conexión</b>
              <span className="text-sm">
                Mercado Pago no confirmó la autorización. Probá de nuevo y fijate de entrar con la cuenta del negocio.
              </span>
            </>
          )}
        </div>
      )}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-4">
        {BENEFITS.map((b) => (
          <Card key={b.title}>
            <CardContent className="flex flex-col gap-1.5">
              <b className="text-[15px]">{b.title}</b>
              <span className="text-sm leading-relaxed text-muted-foreground">{b.detail}</span>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
