'use client';

import { Button } from '@/components/ui/button';
import type { TenantTaxCondition } from '@/lib/tenantSettings';
import { useEffect } from 'react';

// Ayuda "¿Dónde encuentro mi punto de venta?" del campo "Punto de venta
// (ARCA)" de la sucursal (mockup aprobado el 2026-10-14). Mismo estilo de
// pantallas de ejemplo con numeritos que el asistente "Conexión con ARCA".

const SYSTEM_NAMES = {
  MONOTRIBUTO: {
    webServices: 'Factura Electrónica - Monotributo - Web Services',
    online: 'Factura en Línea - Monotributo',
  },
  // Responsable Inscripto y Exento facturan por RECE.
  RECE: {
    webServices: 'RECE para aplicativo y web services',
    online: 'Comprobantes en línea',
  },
} as const;

export function PointOfSaleHelpModal({
  taxCondition,
  onClose,
}: {
  taxCondition: TenantTaxCondition | null | undefined;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const names =
    taxCondition === 'MONOTRIBUTO' || !taxCondition
      ? SYSTEM_NAMES.MONOTRIBUTO
      : SYSTEM_NAMES.RECE;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-labelledby="pos-help-title"
        className="my-4 w-full max-w-[860px] rounded-xl border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b px-5 pt-[18px] pb-3">
          <div>
            <h3 id="pos-help-title" className="text-lg font-semibold">
              ¿Dónde encuentro mi punto de venta?
            </h3>
            <p className="mt-1 max-w-[62ch] text-sm text-muted-foreground">
              Es el número que diste de alta en ARCA para facturar desde un
              sistema como Oplex. Tiene que ser uno de{' '}
              <b className="text-foreground">Web Services</b>: el que usás en
              &quot;Comprobantes en línea&quot; no sirve.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="text-muted-foreground transition hover:text-foreground"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-[18px] px-5 py-4">
          <Step
            n={1}
            title="Entrá a ARCA"
            aside={
              <Shot title="ARCA · Mis servicios">
                <strong className="text-[12.5px]">Buscar servicio</strong>
                <Option>puntos de venta</Option>
                <Option pin={1}>
                  Administración de puntos de venta y domicilios
                </Option>
              </Shot>
            }
          >
            <p>
              Ingresá con tu CUIT y clave fiscal. En el buscador de servicios
              escribí <b className="text-foreground">puntos de venta</b> y abrí{' '}
              <b className="text-foreground">
                Administración de puntos de venta y domicilios
              </b>
              .
            </p>
          </Step>

          <Step
            n={2}
            title="Abrí la lista"
            aside={
              <Shot title="Administración de puntos de venta y domicilios">
                <Option pin={2}>A/B/M de Puntos de Venta</Option>
                <Option dim>Domicilio punto de venta vincular</Option>
              </Shot>
            }
          >
            <p>
              Tocá <b className="text-foreground">A/B/M de Puntos de Venta</b>{' '}
              y, si te lo pide, elegí tu empresa. La otra opción,
              &quot;Domicilio punto de venta vincular&quot;, es para cambiar el
              domicilio y no hace falta.
            </p>
          </Step>

          <Step
            n={3}
            title='Buscá el que diga "Web Services"'
            aside={
              <Shot title="A/B/M de Puntos de Venta">
                <div className="relative overflow-x-auto">
                  <table className="w-full border-collapse rounded-md border bg-card tabular-nums">
                    <thead>
                      <tr className="border-b text-left text-[10.5px] tracking-wide text-muted-foreground uppercase">
                        <th className="px-2 py-1.5">Nro.</th>
                        <th className="px-2 py-1.5">Sistema</th>
                        <th className="px-2 py-1.5" />
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b">
                        <td className="px-2 py-1.5 align-top font-mono font-medium">
                          1
                        </td>
                        <td className="px-2 py-1.5 align-top">
                          {names.online}
                        </td>
                        <td className="px-2 py-1.5 align-top">
                          <span className="rounded-full bg-red-100 px-[7px] py-px text-[10.5px] font-bold whitespace-nowrap text-red-700 dark:bg-red-950 dark:text-red-400">
                            No sirve
                          </span>
                        </td>
                      </tr>
                      <tr className="bg-amber-400/20">
                        <td className="px-2 py-1.5 align-top font-mono font-medium">
                          8
                        </td>
                        <td className="px-2 py-1.5 align-top">
                          {names.webServices}
                        </td>
                        <td className="px-2 py-1.5 align-top">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="rounded-full bg-green-100 px-[7px] py-px text-[10.5px] font-bold whitespace-nowrap text-green-700 dark:bg-green-950 dark:text-green-400">
                              Este
                            </span>
                            <Pin n={3} className="flex-none" />
                          </span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </Shot>
            }
          >
            <p>
              En la columna <b className="text-foreground">Sistema</b> tiene que
              decir:
            </p>
            <p className="mt-1.5">
              <Code>{names.webServices}</Code>
            </p>
            <p className="mt-1.5">
              Ese número es el que va en Oplex. Los de &quot;Factura en
              línea&quot; o &quot;Comprobantes en línea&quot; no sirven: ARCA
              rechazaría la factura.
            </p>
          </Step>

          <Step
            n={4}
            title="Escribilo en Oplex"
            aside={
              <div className="flex flex-wrap items-center gap-2.5 text-[13px] text-muted-foreground">
                <Code>8</Code>
                <span>o</span>
                <Code>00008</Code>
                <span>→ se guarda</span>
                <Code>00008</Code>
                <span>→ factura</span>
                <Code>00008-00000001</Code>
              </div>
            }
          >
            <p>
              Podés poner sólo el número. Oplex lo guarda con 5 dígitos, que es
              como sale impreso en la factura.
            </p>
          </Step>

          <div className="rounded-lg border border-l-[3px] border-l-orange-500 bg-muted px-3 py-2.5 text-[13px] text-muted-foreground">
            <b className="text-foreground">
              ¿No tenés ninguno de Web Services?
            </b>{' '}
            En el paso 2, dentro de &quot;A/B/M de Puntos de Venta&quot;, tocá{' '}
            <b className="text-foreground">Agregar</b>: elegí un número libre,
            el sistema que termina en{' '}
            <b className="text-foreground">Web Services</b> y tu domicilio.
            Después volvé acá y cargá ese número. Un punto de venta no se puede
            compartir con &quot;Comprobantes en línea&quot;.
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t px-5 pt-3 pb-4">
          <small className="text-muted-foreground">
            Los nombres de los menús pueden cambiar si ARCA actualiza su sitio.
          </small>
          <Button type="button" onClick={onClose}>
            Entendido
          </Button>
        </div>
      </div>
    </div>
  );
}

function Step({
  n,
  title,
  aside,
  children,
}: {
  n: number;
  title: string;
  aside: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="text-[13px] leading-normal text-muted-foreground">
        <h4 className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-foreground">
          <span className="inline-flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full bg-primary/10 text-xs font-extrabold text-primary">
            {n}
          </span>
          {title}
        </h4>
        {children}
      </div>
      {aside}
    </div>
  );
}

function Shot({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <figure className="m-0 overflow-hidden rounded-lg border bg-muted/30 text-[11.5px]">
      <div className="flex items-center gap-1.5 bg-muted px-2.5 py-1.5 text-[11px] text-muted-foreground">
        <span className="h-2 w-2 rounded-full bg-border" />
        <span className="h-2 w-2 rounded-full bg-border" />
        <span className="h-2 w-2 rounded-full bg-border" />
        <span className="ml-1">{title}</span>
      </div>
      <div className="flex flex-col gap-2 p-3">{children}</div>
      <figcaption className="border-t px-2.5 py-1.5 text-[11px] text-muted-foreground">
        Pantalla de ejemplo simplificada. Puede verse distinta en ARCA.
      </figcaption>
    </figure>
  );
}

function Option({
  pin,
  dim,
  children,
}: {
  pin?: number;
  dim?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`relative rounded-md border bg-card px-[9px] py-[7px] ${pin ? 'border-amber-400 ring-2 ring-amber-400' : ''} ${dim ? 'opacity-55' : ''}`}
    >
      {children}
      {pin && <Pin n={pin} className="absolute -top-2.5 -right-2.5" />}
    </div>
  );
}

function Pin({ n, className }: { n: number; className: string }) {
  return (
    <span
      className={`flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-[11px] font-extrabold text-amber-950 ${className}`}
    >
      {n}
    </span>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded-[5px] border bg-muted px-[5px] py-px font-mono text-xs text-foreground">
      {children}
    </code>
  );
}
