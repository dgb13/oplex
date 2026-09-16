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

  // Ancho animado con JS (igual que RankedBars/Leaderboard), no `scale-x` -
  // un `transform` en un hijo de un contenedor `overflow-hidden` +
  // `rounded-full` dispara un bug de Chromium que lo clipea por completo
  // (el radio, casi la mitad de la altura en una barra tan fina, hace que
  // la máscara de recorte del layer compositado del hijo transformado
  // quede mal calculada) - visto en vivo: `getBoundingClientRect` reportaba
  // ancho 0 pese a que `offsetWidth`/el layout eran correctos.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const timer = setTimeout(() => {
      el.style.width = `${bucket.pct}%`;
    }, delay + 60);
    return () => clearTimeout(timer);
  }, [bucket.pct, delay]);

  if (bucket.pct <= 0) {
    return null;
  }

  return (
    <div
      ref={ref}
      className={`h-full w-0 shrink-0 transition-[width] duration-700 ease-out ${bucket.colorClassName}`}
    />
  );
}
