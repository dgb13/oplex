import type { ReactNode } from 'react';

type BentoVariant = 'hero' | 'tall' | 'wide';

const VARIANT_CLASS: Record<BentoVariant, string> = {
  hero: 'md:col-span-2 md:row-span-2 min-h-[280px]',
  tall: 'md:row-span-2 min-h-[280px]',
  wide: 'md:col-span-2',
};

interface BentoCellProps {
  variant?: BentoVariant;
  className?: string;
  children: ReactNode;
}

/** Card base del layout tipo bento de "Resumen" - a diferencia de una
 * grilla de tarjetas uniformes, algunas ocupan más lugar (`hero`/`tall`)
 * según cuánto contenido necesitan, no todas el mismo tamaño. */
export function BentoCell({ variant, className, children }: BentoCellProps) {
  return (
    <div
      className={`relative flex flex-col overflow-hidden rounded-3xl border bg-card p-5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg ${
        variant ? VARIANT_CLASS[variant] : ''
      } ${className ?? ''}`}
    >
      {children}
    </div>
  );
}

export function BentoGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 md:grid-cols-4">{children}</div>;
}

export function BentoCellHeader({ title, meta }: { title: string; meta?: ReactNode }) {
  return (
    <div className="mb-1 flex items-start justify-between gap-2">
      <h3 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
      {meta}
    </div>
  );
}
