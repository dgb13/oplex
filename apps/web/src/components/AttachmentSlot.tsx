'use client';

import type { LucideIcon } from 'lucide-react';
import { X } from 'lucide-react';
import { useRef } from 'react';

interface AttachmentSlotProps {
  label: string;
  hint: string;
  icon: LucideIcon;
  accept: string;
  file: File | null;
  /** Sólo la imagen principal manda esto (miniatura ya recortada) - PDF/ZIP
   * quedan representados por su ícono, no tiene sentido "previsualizarlos". */
  previewUrl?: string | null;
  onPick: (file: File) => void;
  onRemove: () => void;
}

export default function AttachmentSlot({
  label,
  hint,
  icon: Icon,
  accept,
  file,
  previewUrl,
  onPick,
  onRemove,
}: AttachmentSlotProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    if (picked) onPick(picked);
    // Sin esto, elegir de nuevo el mismo archivo después de "Quitar" no
    // dispara onChange (el input recuerda el último valor).
    e.target.value = '';
  }

  return (
    <div className={`flex flex-col overflow-hidden rounded-xl border ${file ? 'border-input' : 'border-dashed border-input'}`}>
      <input ref={inputRef} type="file" accept={accept} onChange={handleChange} className="hidden" />

      {file ? (
        <div className="group relative aspect-[4/3] bg-muted">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex h-full w-full items-center justify-center"
          >
            {previewUrl ? (
              <img src={previewUrl} alt={label} className="h-full w-full object-cover" />
            ) : (
              <Icon className="h-9 w-9 text-primary" strokeWidth={1.6} />
            )}
          </button>
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 text-xs font-medium text-transparent transition group-hover:bg-black/40 group-hover:text-white">
            Cambiar {previewUrl ? 'imagen' : 'archivo'}
          </div>
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Quitar ${label.toLowerCase()}`}
            className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white transition hover:bg-black/75"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex aspect-[4/3] flex-col items-center justify-center gap-2 px-3 text-center transition hover:bg-muted"
        >
          <Icon className="h-7 w-7 text-muted-foreground" strokeWidth={1.6} />
          <span className="text-sm font-medium">{label}</span>
          <span className="text-xs text-muted-foreground">{hint}</span>
        </button>
      )}

      {file && (
        <div className="flex items-center justify-between gap-2 border-t px-3 py-2">
          <span className="truncate text-xs font-medium">{file.name}</span>
          <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{formatFileSize(file.size)}</span>
        </div>
      )}
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
