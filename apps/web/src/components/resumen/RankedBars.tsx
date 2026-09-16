'use client';

import { useEffect, useRef } from 'react';

export interface RankedBarItem {
  id: string;
  name: string;
  /** Valor crudo, para calcular el ancho relativo */
  value: number;
  /** Ya formateado para mostrar, ej. "$4,26M" */
  valueLabel: string;
}

/** Lista de barras horizontales rankeadas por valor (top productos, top
 * proveedores, etc.) - la más alta define el 100% del ancho, el resto se
 * escala en proporción. */
export default function RankedBars({ items }: { items: RankedBarItem[] }) {
  if (items.length === 0) {
    return <p className="py-2 text-sm text-muted-foreground">Sin datos en el período.</p>;
  }
  const max = Math.max(...items.map((i) => i.value)) || 1;

  return (
    <div className="flex flex-col gap-2.5">
      {items.map((item, i) => (
        <RankedBarRow key={item.id} item={item} pct={(item.value / max) * 100} delay={i * 90} />
      ))}
    </div>
  );
}

function RankedBarRow({ item, pct, delay }: { item: RankedBarItem; pct: number; delay: number }) {
  const fillRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = fillRef.current;
    if (!el) return;
    const timer = setTimeout(() => {
      el.style.width = `${pct}%`;
    }, delay + 80);
    return () => clearTimeout(timer);
  }, [pct, delay]);

  return (
    <div className="grid grid-cols-[1fr_56px] items-center gap-2">
      <div>
        <div className="mb-1 truncate text-xs text-muted-foreground">{item.name}</div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            ref={fillRef}
            className="h-full w-0 rounded-full bg-gradient-to-r from-chart-1 to-primary transition-[width] duration-1000 ease-out"
          />
        </div>
      </div>
      <span className="text-right font-mono text-xs font-bold tabular-nums">{item.valueLabel}</span>
    </div>
  );
}
