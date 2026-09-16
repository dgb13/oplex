'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

export interface SegmentedNavItem {
  key: string;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  title?: string;
}

interface SegmentedNavProps {
  items: SegmentedNavItem[];
  active: string;
  onChange: (key: string) => void;
}

/** Control segmentado con píldora deslizante para cambiar de categoría
 * dentro de "Resumen" - mide el botón activo con getBoundingClientRect y
 * anima la píldora hasta ahí, en vez de N botones "activos" sueltos. */
export default function SegmentedNav({ items, active, onChange }: SegmentedNavProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);

  useEffect(() => {
    function measure() {
      const container = containerRef.current;
      const btn = btnRefs.current[active];
      if (!container || !btn) return;
      const containerRect = container.getBoundingClientRect();
      const btnRect = btn.getBoundingClientRect();
      setPill({ left: btnRect.left - containerRect.left, width: btnRect.width });
    }
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [active, items]);

  return (
    <div
      ref={containerRef}
      className="relative inline-flex flex-wrap gap-0.5 rounded-2xl border bg-card p-1 shadow-sm"
    >
      {pill && (
        <div
          className="absolute top-1 bottom-1 rounded-xl bg-primary transition-[transform,width] duration-[450ms] ease-out"
          style={{ transform: `translateX(${pill.left}px)`, width: pill.width }}
        />
      )}
      {items.map((item) => (
        <button
          key={item.key}
          ref={(el) => {
            btnRefs.current[item.key] = el;
          }}
          type="button"
          title={item.title}
          disabled={item.disabled}
          onClick={() => onChange(item.key)}
          className={`relative z-10 flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors ${
            item.disabled
              ? 'cursor-default text-muted-foreground/50'
              : active === item.key
                ? 'text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </div>
  );
}
