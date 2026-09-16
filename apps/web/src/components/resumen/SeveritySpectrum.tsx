'use client';

import { useEffect, useRef } from 'react';

export interface SeverityBucket {
  label: string;
  /** 0-100, todos los buckets deberían sumar ~100 */
  pct: number;
  /** Ya formateado para mostrar, ej. "$ 7.332.500" */
  valueLabel: string;
  /** Clase Tailwind de fondo (bg-*) */
  colorClassName: string;
}

/** Barra de "espectro de severidad" para antigüedad de cartera (AR/AP) -
 * un solo segmento por bucket (corriente/1-30/31-60/61-90/+90), coloreado
 * de menos a más grave, con una leyenda debajo. */
export default function SeveritySpectrum({ buckets }: { buckets: SeverityBucket[] }) {
  return (
    <div>
      <div className="mb-3 flex h-3.5 overflow-hidden rounded-full bg-muted">
        {buckets.map((bucket, i) => (
          <SpectrumSegment key={bucket.label} bucket={bucket} delay={i * 80} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        {buckets.map((bucket) => (
          <span key={bucket.label} className="inline-flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-sm ${bucket.colorClassName}`} />
            {bucket.label} — {bucket.valueLabel}
          </span>
        ))}
      </div>
    </div>
  );
}

function SpectrumSegment({ bucket, delay }: { bucket: SeverityBucket; delay: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const timer = setTimeout(() => {
      el.style.transform = 'scaleX(1)';
    }, delay + 60);
    return () => clearTimeout(timer);
  }, [delay]);

  if (bucket.pct <= 0) {
    return null;
  }

  return (
    <div
      ref={ref}
      style={{ width: `${bucket.pct}%` }}
      className={`h-full origin-left scale-x-0 transition-transform duration-700 ease-out ${bucket.colorClassName}`}
    />
  );
}
