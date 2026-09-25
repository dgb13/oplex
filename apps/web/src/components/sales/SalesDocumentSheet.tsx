'use client';

import { X } from 'lucide-react';
import { useRef } from 'react';

/**
 * Hoja de pantalla casi completa para cargar un comprobante de venta
 * (Nueva cotización / Nueva factura): a la izquierda cliente y artículos, a
 * la derecha un panel fijo con datos del comprobante, totales y el botón
 * principal. Reemplaza a los modales angostos donde las líneas quedaban
 * apretadas.
 *
 * Teclado: Enter en un input NO envía el formulario (en una tabla de
 * líneas es demasiado fácil emitir sin querer) - cada input decide qué
 * hace con Enter; Ctrl/⌘+Enter envía desde cualquier lado.
 */
export default function SalesDocumentSheet({
  title,
  badge,
  onClose,
  onSubmit,
  main,
  side,
}: {
  title: string;
  badge?: React.ReactNode;
  onClose: () => void;
  onSubmit: () => void;
  main: React.ReactNode;
  side: React.ReactNode;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2 sm:p-4">
      <form
        ref={formRef}
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return;
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            formRef.current?.requestSubmit();
            return;
          }
          const target = e.target as HTMLElement;
          if (target.tagName === 'INPUT') e.preventDefault();
        }}
        className="flex h-[min(94vh,960px)] w-full max-w-[1440px] flex-col overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-2xl"
      >
        <div className="flex items-center justify-between gap-3 border-b px-5 py-3.5">
          <h2 className="flex flex-wrap items-center gap-2.5 text-lg font-semibold">
            {title}
            {badge}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:overflow-hidden">
          <div className="flex min-w-0 flex-col gap-6 p-5 lg:overflow-y-auto">{main}</div>
          <aside className="flex flex-col gap-5 border-t bg-muted/30 p-5 lg:overflow-y-auto lg:border-t-0 lg:border-l">
            {side}
          </aside>
        </div>
      </form>
    </div>
  );
}

/** Rótulo de sección (CLIENTE, ARTÍCULOS, MONEDA...) con una acción
 * opcional a la derecha ("+ Nuevo cliente"). */
export function SectionLabel({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <span className="text-[11.5px] font-semibold tracking-wide text-muted-foreground uppercase">{children}</span>
      {action}
    </div>
  );
}

export function LinkButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="text-xs font-medium text-primary hover:text-primary/80">
      {children}
    </button>
  );
}

/** Selector segmentado (ARS / USD, Factura A/B/C/M). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  disabled,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  disabled?: boolean;
}) {
  return (
    <div className="flex rounded-lg border bg-card p-0.5" role="group">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          disabled={disabled}
          aria-pressed={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={`flex-1 rounded-md px-2 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed ${
            value === opt.value
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:text-foreground disabled:hover:text-muted-foreground'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
