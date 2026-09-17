'use client';

import { Minus, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface ImageCropperProps {
  file: File;
  /** ancho/alto del recorte final - default 4:3, foto de producto rectangular
   * (a pedido del usuario, no circular como un avatar). */
  aspectRatio?: number;
  onCancel: () => void;
  onApply: (result: File) => void;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.2;
const OUTPUT_WIDTH = 1000;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Recorte con arrastre + zoom, estilo "foto de perfil" pero rectangular.
 * Validado primero como prototipo aislado (artifact) antes de escribir esto -
 * dos bugs reales aparecieron ahí y quedan documentados acá porque son fáciles
 * de reintroducir si se toca este componente:
 *
 * 1. Tailwind Preflight define `img { max-width: 100%; height: auto }`. Con
 *    la imagen dentro de un stage angosto, esa regla gana la cascada para
 *    `max-width` aunque el ancho se fije inline (max-width sigue limitando a
 *    width, venga de donde venga) - el zoom quedaba invisible en horizontal y
 *    sólo se notaba un estiramiento vertical. Por eso `max-w-none` explícito
 *    más abajo.
 * 2. El zoom NO debe re-clampear tx/ty tal cual estaban al cambiar la escala:
 *    eso hace que la imagen salte hacia una esquina en cada paso de zoom, y
 *    reubicarla se siente imposible. `setZoom` ancla el centro del stage
 *    antes/después del cambio de escala en vez de sólo clampear.
 */
export default function ImageCropper({ file, aspectRatio = 4 / 3, onCancel, onApply }: ImageCropperProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef({ dragging: false, startX: 0, startY: 0, startPos: { x: 0, y: 0 } });

  const [src, setSrc] = useState<string | null>(null);
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [stageSize, setStageSize] = useState({ w: 0, h: 0 });
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    function measure() {
      const el = stageRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setStageSize({ w: r.width, h: r.height });
    }
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const cover = natural.w && stageSize.w ? Math.max(stageSize.w / natural.w, stageSize.h / natural.h) : 0;
  const baseW = natural.w * cover;
  const baseH = natural.h * cover;

  // Nueva imagen o stage recién medido: centrar a zoom 1x. Sin esto, un
  // segundo archivo elegido heredaría la posición/zoom del anterior.
  useEffect(() => {
    if (!baseW || !stageSize.w) return;
    setScale(1);
    setPos({ x: (stageSize.w - baseW) / 2, y: (stageSize.h - baseH) / 2 });
  }, [src, baseW, baseH, stageSize.w, stageSize.h]);

  function clampPos(p: { x: number; y: number }, s: number) {
    const dw = baseW * s;
    const dh = baseH * s;
    const minX = Math.min(0, stageSize.w - dw);
    const minY = Math.min(0, stageSize.h - dh);
    return { x: clamp(p.x, minX, 0), y: clamp(p.y, minY, 0) };
  }

  function setZoom(next: number) {
    const newScale = clamp(next, MIN_ZOOM, MAX_ZOOM);
    if (newScale === scale) return;
    const cx = (stageSize.w / 2 - pos.x) / scale;
    const cy = (stageSize.h / 2 - pos.y) / scale;
    const anchored = { x: stageSize.w / 2 - cx * newScale, y: stageSize.h / 2 - cy * newScale };
    setScale(newScale);
    setPos(clampPos(anchored, newScale));
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    dragRef.current = { dragging: true, startX: e.clientX, startY: e.clientY, startPos: pos };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current.dragging) return;
    const next = {
      x: dragRef.current.startPos.x + (e.clientX - dragRef.current.startX),
      y: dragRef.current.startPos.y + (e.clientY - dragRef.current.startY),
    };
    setPos(clampPos(next, scale));
  }
  function endDrag() {
    dragRef.current.dragging = false;
  }
  function onWheel(e: React.WheelEvent<HTMLDivElement>) {
    e.preventDefault();
    setZoom(scale - e.deltaY * 0.0015);
  }

  function handleApply() {
    const img = imgRef.current;
    if (!img || !stageSize.w) return;
    const outW = OUTPUT_WIDTH;
    const outH = Math.round(outW / aspectRatio);
    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const k = outW / stageSize.w;
    ctx.drawImage(img, 0, 0, natural.w, natural.h, pos.x * k, pos.y * k, baseW * scale * k, baseH * scale * k);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const baseName = file.name.replace(/\.[^./\\]+$/, '');
        onApply(new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' }));
      },
      'image/jpeg',
      0.9,
    );
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4">
      <div className="flex w-full max-w-md flex-col gap-4 rounded-xl border bg-card p-5 text-card-foreground shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Ajustar imagen</h3>
          <button type="button" onClick={onCancel} className="text-muted-foreground transition hover:text-foreground" aria-label="Cerrar">
            ✕
          </button>
        </div>

        <div
          ref={stageRef}
          className="relative aspect-[4/3] w-full cursor-grab touch-none overflow-hidden rounded-lg bg-black active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onPointerLeave={endDrag}
          onWheel={onWheel}
        >
          {src && (
            <img
              ref={imgRef}
              src={src}
              alt=""
              draggable={false}
              onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
              className="pointer-events-none absolute top-0 left-0 max-w-none select-none"
              style={{ width: baseW * scale, height: baseH * scale, transform: `translate(${pos.x}px, ${pos.y}px)` }}
            />
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setZoom(scale - ZOOM_STEP)}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-input text-muted-foreground transition hover:bg-muted"
            aria-label="Alejar"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <input
            type="range"
            min={MIN_ZOOM * 100}
            max={MAX_ZOOM * 100}
            value={Math.round(scale * 100)}
            onChange={(e) => setZoom(Number(e.target.value) / 100)}
            className="flex-1 accent-primary"
            aria-label="Zoom"
          />
          <button
            type="button"
            onClick={() => setZoom(scale + ZOOM_STEP)}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-input text-muted-foreground transition hover:bg-muted"
            aria-label="Acercar"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-4 py-2 text-sm text-muted-foreground transition hover:bg-muted"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary/90"
          >
            Aplicar recorte
          </button>
        </div>
      </div>
    </div>
  );
}
