'use client';

import { resolveUploadUrl } from '@/lib/inventory';
import type { Package } from 'lucide-react';
import { useState } from 'react';
import { createPortal } from 'react-dom';

const PREVIEW_SIZE = 176;
const GAP = 8;

/** Foto de un insumo (Recetas, Nueva orden y detalle de Orden de producción) - miniatura
 * con borde y, al pasar el mouse, una vista ampliada al costado con el
 * nombre. La ampliada va en un portal con posición fija: dentro de la
 * fila quedaba cortada por el `overflow-hidden` de Card en la última fila
 * de la tarjeta. Se acomoda para no salirse de la ventana. Sin foto
 * cargada muestra `icon` (paquete, o regla para lo que se mide por largo). */
export default function InsumoThumb({
  imageUrl,
  name,
  icon: Icon,
  size = 'md',
}: {
  imageUrl?: string | null;
  name?: string;
  icon: typeof Package;
  size?: 'sm' | 'md' | 'lg';
}) {
  const [preview, setPreview] = useState<{ left: number; top: number } | null>(null);
  const src = imageUrl ? resolveUploadUrl(imageUrl) : null;
  const box = size === 'lg' ? 'h-12 w-12' : size === 'sm' ? 'h-8 w-8' : 'h-11 w-11';

  if (!src) {
    return (
      <div
        className={`flex ${box} shrink-0 items-center justify-center rounded-lg border border-dashed border-primary/30 bg-primary/5 text-primary/70`}
      >
        <Icon className={size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'} />
      </div>
    );
  }

  function show(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const height = PREVIEW_SIZE + (name ? 30 : 0);
    const fitsRight = rect.right + GAP + PREVIEW_SIZE <= window.innerWidth;
    setPreview({
      left: fitsRight ? rect.right + GAP : rect.left - GAP - PREVIEW_SIZE,
      top: Math.max(GAP, Math.min(rect.top, window.innerHeight - height - GAP)),
    });
  }

  return (
    <>
      <div
        className={`${box} shrink-0 overflow-hidden rounded-lg border bg-background shadow-sm ring-primary/40 transition hover:ring-2`}
        onMouseEnter={show}
        onMouseLeave={() => setPreview(null)}
      >
        <img src={src} alt={name ?? ''} className="h-full w-full object-cover" />
      </div>
      {preview &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[90] overflow-hidden rounded-xl border bg-popover shadow-xl"
            style={{ left: preview.left, top: preview.top, width: PREVIEW_SIZE }}
          >
            <img src={src} alt="" className="bg-background object-contain" style={{ width: PREVIEW_SIZE, height: PREVIEW_SIZE }} />
            {name && <p className="truncate border-t px-2 py-1.5 text-xs text-popover-foreground">{name}</p>}
          </div>,
          document.body,
        )}
    </>
  );
}
