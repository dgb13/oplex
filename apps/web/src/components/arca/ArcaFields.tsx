'use client';

import { Input } from '@/components/ui/input';
import type { AxiosError } from 'axios';
import { useRef } from 'react';

// Piezas comunes de los formularios que se autocompletan con el padrón de
// ARCA (Contabilidad → Conexión con ARCA → Datos de la empresa, alta de cliente/proveedor).

/** De dónde salió cada dato - es lo que muestran los badges. */
export type Source = 'arca' | 'edited' | 'constancia' | 'arcaMonth' | null;

export function lookupError(err: unknown): string {
  const response = (err as AxiosError<{ message?: string }>)?.response;
  if (response?.status === 404) {
    // En homologación la API explica que ese padrón no tiene CUITs reales.
    return /homologación/i.test(response.data?.message ?? '')
      ? (response.data?.message as string)
      : 'ARCA no encontró ese CUIT. Revisalo o cargá los datos a mano.';
  }
  if (response?.status === 400 && /configurada/i.test(response.data?.message ?? '')) {
    return 'La consulta automática a ARCA todavía no está disponible. Cargá los datos a mano.';
  }
  if (response?.status === 400) return response.data?.message ?? 'CUIT inválido.';
  return 'ARCA no responde ahora. Probá en unos minutos o cargá los datos a mano.';
}

export type BadgeTone = 'arca' | 'ai' | 'ok' | 'warn' | 'hand' | 'bad';

const BADGE_CLASSES: Record<BadgeTone, string> = {
  arca: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300',
  ai: 'bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
  ok: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400',
  warn: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400',
  bad: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400',
  hand: 'bg-muted text-muted-foreground',
};

export function Badge({ tone, children }: { tone: BadgeTone; children: React.ReactNode }) {
  return (
    <span className={`rounded-full px-[7px] py-px text-[10.5px] font-bold not-italic tracking-[.03em] ${BADGE_CLASSES[tone]}`}>
      {children}
    </span>
  );
}

export function SourceBadge({ source }: { source: Source | undefined }) {
  if (source === 'arca') return <Badge tone="arca">✓ de ARCA</Badge>;
  if (source === 'edited') return <Badge tone="hand">editado</Badge>;
  if (source === 'constancia') return <Badge tone="ai">✓ constancia</Badge>;
  if (source === 'arcaMonth') return <Badge tone="warn">mes de ARCA</Badge>;
  return null;
}

/** Dato traído de ARCA: se muestra de sólo lectura con "✎ corregir"; al
 * corregirlo (o si no hubo ARCA) pasa a ser un input normal. */
export function ValueBox({
  value,
  editing,
  readOnly,
  onEdit,
  onChange,
  placeholder,
  emptyText = 'Se completa con el CUIT',
}: {
  value: string;
  editing?: boolean;
  readOnly?: boolean;
  onEdit?: () => void;
  onChange?: (value: string) => void;
  placeholder?: string;
  emptyText?: string;
}) {
  // Sólo se enfoca al tocar "corregir", no cuando todos los campos pasan a
  // modo manual juntos (ARCA no respondió).
  const focusNext = useRef(false);
  if (editing && onChange) {
    const autoFocus = focusNext.current;
    focusNext.current = false;
    return <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoFocus={autoFocus} />;
  }
  const empty = !value;
  return (
    <div
      className={`flex min-h-10 items-center gap-2 rounded-[10px] border bg-muted/50 px-[11px] py-[9px] text-sm ${
        empty ? 'italic text-muted-foreground' : ''
      }`}
    >
      <span className="min-w-0 flex-1">{empty ? emptyText : value}</span>
      {!empty && !readOnly && onEdit && (
        <button
          type="button"
          onClick={() => {
            focusNext.current = true;
            onEdit();
          }}
          title="Corregir a mano"
          className="shrink-0 text-xs text-muted-foreground not-italic hover:text-primary"
        >
          ✎ corregir
        </button>
      )}
    </div>
  );
}

