'use client';

import { FileText, Paperclip, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

// Adjuntos de Soporte: se usan en la pantalla del usuario (tema de la app) y
// en la bandeja del admin (siempre oscura) - `tone` elige los colores.
type Tone = 'app' | 'admin';

const MAX_FILES = 5;
const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf'];

export interface AttachmentInfo {
  id: string;
  fileName: string;
  mimeType: string;
}

/** Miniaturas de adjuntos ya guardados. Piden sesión, así que se bajan como
 * blob con `load` y se muestran con un object URL. */
export function AttachmentList({
  attachments,
  load,
  tone,
}: {
  attachments: AttachmentInfo[];
  load: (id: string) => Promise<Blob>;
  tone: Tone;
}) {
  if (!attachments.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {attachments.map((a) => (
        <AttachmentThumb key={a.id} attachment={a} load={load} tone={tone} />
      ))}
    </div>
  );
}

function AttachmentThumb({ attachment, load, tone }: { attachment: AttachmentInfo; load: (id: string) => Promise<Blob>; tone: Tone }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const isImage = attachment.mimeType.startsWith('image/');

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    load(attachment.id)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachment.id, load]);

  const frame = tone === 'admin' ? 'border-slate-700 bg-slate-800 text-slate-400' : 'border-border bg-muted text-muted-foreground';
  return (
    <a
      href={url ?? undefined}
      target="_blank"
      rel="noreferrer"
      title={attachment.fileName}
      className={`flex w-28 flex-col gap-1 text-[11px] ${tone === 'admin' ? 'text-slate-400' : 'text-muted-foreground'}`}
    >
      <span className={`grid h-[70px] w-28 place-items-center overflow-hidden rounded-md border ${frame}`}>
        {failed ? (
          'No se pudo abrir'
        ) : isImage && url ? (
          <img src={url} alt={attachment.fileName} className="h-full w-full object-cover" />
        ) : isImage ? (
          '…'
        ) : (
          <FileText className="h-6 w-6" aria-hidden />
        )}
      </span>
      <span className="truncate">{attachment.fileName}</span>
    </a>
  );
}

/**
 * Selector de capturas: botón, arrastrar y soltar, y pegar con Ctrl+V
 * (escucha el pegado en toda la página mientras está montado). Valida tipo,
 * peso y cantidad acá también, para avisar antes de mandar.
 */
export function FilePicker({
  files,
  onChange,
  tone,
  compact,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  tone: Tone;
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const filesRef = useRef(files);
  filesRef.current = files;

  const add = (incoming: File[]) => {
    const current = filesRef.current;
    const next = [...current];
    for (const raw of incoming) {
      if (!ACCEPT.includes(raw.type)) {
        setError(`"${raw.name || 'archivo'}" no es una imagen ni un PDF.`);
        continue;
      }
      if (raw.size > MAX_BYTES) {
        setError(`"${raw.name || 'archivo'}" pesa más de 5 MB.`);
        continue;
      }
      if (next.length >= MAX_FILES) {
        setError(`Podés adjuntar hasta ${MAX_FILES} archivos.`);
        break;
      }
      // Lo pegado del portapapeles llega como "image.png": le ponemos fecha.
      const file =
        raw.name && raw.name !== 'image.png'
          ? raw
          : new File([raw], `captura-${new Date().toISOString().slice(11, 19).replace(/:/g, '')}.png`, { type: raw.type });
      next.push(file);
    }
    if (next.length !== current.length) onChange(next);
  };

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const pasted = Array.from(e.clipboardData?.files ?? []);
      if (pasted.length) {
        e.preventDefault();
        setError(null);
        add(pasted);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
    // add usa filesRef: se suscribe una sola vez.
  }, []);

  const muted = tone === 'admin' ? 'text-slate-500' : 'text-muted-foreground';
  const border =
    tone === 'admin'
      ? over
        ? 'border-indigo-500 bg-indigo-500/10'
        : 'border-slate-700'
      : over
        ? 'border-primary bg-primary/5'
        : 'border-border';

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT.join(',')}
        multiple
        hidden
        onChange={(e) => {
          setError(null);
          add(Array.from(e.target.files ?? []));
          e.target.value = '';
        }}
      />
      {compact ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className={`flex items-center gap-1.5 self-start rounded-lg border px-2.5 py-1.5 text-xs ${
            tone === 'admin' ? 'border-slate-700 text-slate-300 hover:bg-slate-800' : 'border-border hover:bg-muted'
          }`}
        >
          <Paperclip className="h-3.5 w-3.5" aria-hidden />
          Adjuntar
        </button>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            setError(null);
            add(Array.from(e.dataTransfer.files));
          }}
          className={`rounded-xl border-[1.5px] border-dashed px-4 py-4 text-center text-sm transition ${border} ${muted}`}
        >
          Arrastrá capturas acá, pegalas con Ctrl+V o <u>elegí archivos</u>
          <span className="block text-xs">Imágenes o PDF, hasta {MAX_FILES} archivos de 5 MB</span>
        </button>
      )}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((f, i) => (
            <LocalThumb
              key={`${f.name}-${i}`}
              file={f}
              tone={tone}
              onRemove={() => onChange(files.filter((_, j) => j !== i))}
            />
          ))}
        </div>
      )}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

function LocalThumb({ file, tone, onRemove }: { file: File; tone: Tone; onRemove: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file.type.startsWith('image/')) return;
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  const frame = tone === 'admin' ? 'border-slate-700 bg-slate-800 text-slate-400' : 'border-border bg-muted text-muted-foreground';
  return (
    <figure className={`relative m-0 w-24 text-[11px] ${tone === 'admin' ? 'text-slate-400' : 'text-muted-foreground'}`}>
      <span className={`grid h-16 w-24 place-items-center overflow-hidden rounded-md border ${frame}`}>
        {url ? (
          <img src={url} alt="" className="h-full w-full object-cover" />
        ) : (
          <FileText className="h-5 w-5" aria-hidden />
        )}
      </span>
      <figcaption className="truncate">{file.name}</figcaption>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Quitar ${file.name}`}
        className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-slate-900 text-white shadow"
      >
        <X className="h-3 w-3" aria-hidden />
      </button>
    </figure>
  );
}
