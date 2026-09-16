'use client';

import { useEffect, useRef } from 'react';

interface RingStatProps {
  /** 0-100 */
  pct: number;
  /** Clase Tailwind de color de texto (usa currentColor para el stroke) */
  colorClassName?: string;
  size?: number;
  strokeWidth?: number;
}

/** Anillo de progreso SVG animado (0 -> pct al montar), usado para KPIs
 * porcentuales (margen bruto, cobrado/facturado, % recibido a tiempo,
 * etc.) - reemplaza el número pelado por algo que se lee de un vistazo. */
export default function RingStat({ pct, colorClassName = 'text-primary', size = 64, strokeWidth = 7 }: RingStatProps) {
  const circleRef = useRef<SVGCircleElement>(null);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, pct));

  useEffect(() => {
    const el = circleRef.current;
    if (!el) return;
    el.style.strokeDasharray = `${circumference}`;
    el.style.strokeDashoffset = `${circumference}`;
    // Fuerza un reflow para que la transición de abajo anime desde este
    // estado inicial en vez de saltar directo al valor final.
    el.getBoundingClientRect();
    el.style.transition = 'stroke-dashoffset 1.1s cubic-bezier(0.22,1,0.36,1)';
    const frame = requestAnimationFrame(() => {
      el.style.strokeDashoffset = `${circumference * (1 - clamped / 100)}`;
    });
    return () => cancelAnimationFrame(frame);
  }, [clamped, circumference]);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={colorClassName}>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="text-muted-foreground opacity-20"
      />
      <circle
        ref={circleRef}
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}
