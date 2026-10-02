'use client';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  arcaUnregisteredApi,
  type ArcaResolveReason,
  type ArcaUnregisteredVoucher,
} from '@/lib/invoicing';
import { tenantSettingsApi } from '@/lib/tenantSettings';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';

interface Props {
  onClose: () => void;
}

type View =
  | { kind: 'list' }
  | { kind: 'cancel'; voucher: ArcaUnregisteredVoucher }
  | { kind: 'cancelled'; voucher: ArcaUnregisteredVoucher; creditNoteNumber: string; cae: string | null }
  | { kind: 'resolve'; voucher: ArcaUnregisteredVoucher };

const REASONS: { value: ArcaResolveReason; title: string; detail: string }[] = [
  { value: 'OTHER_SYSTEM', title: 'La emitió otro sistema en este punto de venta', detail: 'Ya está en los libros de ese sistema.' },
  { value: 'TEST', title: 'Era una prueba', detail: 'Comprobante de homologación, sin efecto fiscal.' },
  { value: 'OTHER', title: 'Otro motivo', detail: 'Contalo en la nota.' },
];

const RESOLUTION_LABEL: Record<NonNullable<ArcaUnregisteredVoucher['resolution']>, string> = {
  CREDIT_NOTE: 'anulada con nota de crédito',
  OTHER_SYSTEM: 'la emitió otro sistema',
  TEST: 'era una prueba',
  OTHER: 'otro motivo',
};

export function voucherLabel(v: Pick<ArcaUnregisteredVoucher, 'kind' | 'documentLetter' | 'pointOfSale' | 'number'>): string {
  return `${v.kind === 'FACTURA' ? 'Factura' : 'Nota de crédito'} ${v.documentLetter} ${v.pointOfSale}-${v.number}`;
}

function formatAmount(value: string | null): string {
  if (value === null) return '—';
  return `$${Number(value).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(iso: string | null, withTime = false): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return withTime
    ? date.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
    : date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
}

function apiMessage(err: unknown, fallback: string): string {
  const message = (err as AxiosError<{ message?: string | string[] }> | undefined)?.response?.data?.message;
  if (!message) return fallback;
  return Array.isArray(message) ? message.join(', ') : message;
}

/**
 * "Comprobantes de ARCA sin registrar" (mockup aprobado 2026-10-02): los que
 * ARCA autorizó y Oplex no tiene. Se anulan con una nota de crédito espejo o
 * se marcan como resueltos con un motivo. Sin "registrar en Oplex" a
 * propósito - habría que inventar los artículos de la venta.
 */
export default function ArcaUnregisteredModal({ onClose }: Props) {
  const queryClient = useQueryClient();
  const [view, setView] = useState<View>({ kind: 'list' });
  const [reason, setReason] = useState<ArcaResolveReason>('TEST');
  const [note, setNote] = useState('');

  const listQuery = useQuery({ queryKey: ['arca-unregistered'], queryFn: arcaUnregisteredApi.list });
  const settingsQuery = useQuery({ queryKey: ['tenant-settings'], queryFn: tenantSettingsApi.get });
  const production = settingsQuery.data?.afipEnv === 'PRODUCCION';

  const pending = (listQuery.data ?? []).filter((v) => !v.resolvedAt);
  const resolved = (listQuery.data ?? []).filter((v) => v.resolvedAt);

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ['arca-unregistered'] });
  }

  const cancel = useMutation({
    mutationFn: (voucher: ArcaUnregisteredVoucher) => arcaUnregisteredApi.cancel(voucher.id),
    onSuccess: (result, voucher) => {
      refresh();
      setView({ kind: 'cancelled', voucher, creditNoteNumber: result.creditNoteNumber, cae: result.cae });
    },
  });

  const resolve = useMutation({
    mutationFn: (voucher: ArcaUnregisteredVoucher) =>
      arcaUnregisteredApi.resolve(voucher.id, reason, note.trim() || undefined),
    onSuccess: () => {
      refresh();
      setView({ kind: 'list' });
    },
  });

  function openResolve(voucher: ArcaUnregisteredVoucher) {
    setReason('TEST');
    setNote('');
    resolve.reset();
    setView({ kind: 'resolve', voucher });
  }

  let body: React.ReactNode;
  if (view.kind === 'cancel') {
    const v = view.voucher;
    body = (
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Anular con nota de crédito</h2>
        <p className="text-sm">
          Se emite en ARCA una <b>nota de crédito {v.documentLetter}</b> por <b>{formatAmount(v.total)}</b>, asociada a la{' '}
          <b>{voucherLabel(v)}</b>, con los mismos importes y el mismo cliente que ARCA tiene registrados.
        </p>
        <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
          En ARCA la factura y la nota de crédito se compensan. En los libros de Oplex no cambia nada: esa venta nunca se
          registró.
        </p>
        {production ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-300">
            <b>Es un comprobante fiscal real</b> y no se puede deshacer. Hacelo sólo si la venta no se hizo o ya se volvió a
            facturar con otro número.
          </p>
        ) : (
          <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
            Estás en homologación: la nota de crédito no tiene efecto fiscal.
          </p>
        )}
        {cancel.isError && (
          <div className="flex flex-col gap-1">
            <p className="text-sm text-destructive">{apiMessage(cancel.error, 'ARCA no autorizó la nota de crédito')}</p>
            <p className="text-xs text-muted-foreground">No se emitió nada y la factura sigue pendiente.</p>
          </div>
        )}
        <div className="flex justify-end gap-3">
          <Button
            variant="ghost"
            disabled={cancel.isPending}
            onClick={() => {
              cancel.reset();
              setView({ kind: 'list' });
            }}
          >
            Volver
          </Button>
          <Button disabled={cancel.isPending} onClick={() => cancel.mutate(v)}>
            {cancel.isPending ? 'Emitiendo...' : cancel.isError ? 'Reintentar' : 'Emitir nota de crédito'}
          </Button>
        </div>
      </div>
    );
  } else if (view.kind === 'cancelled') {
    body = (
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-2xl font-bold text-green-700 dark:bg-green-950 dark:text-green-400">
          ✓
        </div>
        <h2 className="text-lg font-semibold">Factura anulada en ARCA</h2>
        <p className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-800 dark:bg-green-950 dark:text-green-300">
          Nota de crédito {view.voucher.documentLetter} {view.voucher.pointOfSale}-{view.creditNoteNumber}
          {view.cae ? ` · CAE ${view.cae}` : ''}
        </p>
        <p className="text-sm text-muted-foreground">{voucherLabel(view.voucher)} queda compensada.</p>
        <Button onClick={() => setView({ kind: 'list' })}>Listo</Button>
      </div>
    );
  } else if (view.kind === 'resolve') {
    const v = view.voucher;
    const needsNote = reason === 'OTHER' && !note.trim();
    body = (
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Marcar como resuelto</h2>
        <p className="text-sm text-muted-foreground">
          {voucherLabel(v)} · {formatAmount(v.total)}. No se emite nada en ARCA: sólo queda anotado el motivo.
        </p>
        <div role="radiogroup" aria-label="Motivo" className="flex flex-col gap-2">
          {REASONS.map((option) => (
            <label
              key={option.value}
              className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
                reason === option.value ? 'border-primary bg-primary/5' : ''
              }`}
            >
              <input
                type="radio"
                name="arca-reason"
                className="mt-1 accent-[var(--primary)]"
                checked={reason === option.value}
                onChange={() => setReason(option.value)}
              />
              <span>
                <span className="font-medium">{option.title}</span>
                <span className="block text-xs text-muted-foreground">{option.detail}</span>
              </span>
            </label>
          ))}
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="arca-note" className="text-sm text-muted-foreground">
            Nota {reason === 'OTHER' ? '(obligatoria)' : '(opcional)'}
          </label>
          <Textarea
            id="arca-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ej.: la facturó el sistema anterior antes de migrar"
          />
        </div>
        {resolve.isError && <p className="text-sm text-destructive">{apiMessage(resolve.error, 'No se pudo guardar')}</p>}
        <div className="flex justify-end gap-3">
          <Button variant="ghost" disabled={resolve.isPending} onClick={() => setView({ kind: 'list' })}>
            Volver
          </Button>
          <Button disabled={resolve.isPending || needsNote} onClick={() => resolve.mutate(v)}>
            {resolve.isPending ? 'Guardando...' : 'Marcar como resuelto'}
          </Button>
        </div>
      </div>
    );
  } else {
    body = (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Comprobantes de ARCA sin registrar</h2>
          <button onClick={onClose} className="text-muted-foreground transition hover:text-foreground" aria-label="Cerrar">
            ✕
          </button>
        </div>
        <p className="text-sm text-muted-foreground">
          ARCA los tiene autorizados y en Oplex no figuran. Cada uno es un comprobante fiscal válido: hay que anularlo o
          dejar anotado por qué no hace falta.
        </p>
        {listQuery.isLoading && <p className="text-sm text-muted-foreground">Cargando...</p>}
        {listQuery.isError && <p className="text-sm text-destructive">{apiMessage(listQuery.error, 'No se pudo cargar la lista')}</p>}
        {!listQuery.isLoading && pending.length === 0 && (
          <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">No hay comprobantes pendientes.</p>
        )}
        <div className="flex max-h-[50vh] flex-col gap-3 overflow-y-auto">
          {pending.map((v) => (
            <div key={v.id} className="flex flex-col gap-2 rounded-lg border p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-semibold">{voucherLabel(v)}</span>
                <span className="text-lg font-semibold tabular-nums">{formatAmount(v.total)}</span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
                <div>
                  <span className="block text-xs text-muted-foreground">Fecha</span>
                  {formatDate(v.issueDate)}
                </div>
                <div>
                  <span className="block text-xs text-muted-foreground">Cliente</span>
                  {!v.customerDocNumber || v.customerDocNumber === '0' ? 'Consumidor final' : `CUIT ${v.customerDocNumber}`}
                </div>
                <div>
                  <span className="block text-xs text-muted-foreground">CAE</span>
                  <span className="font-mono text-xs">{v.cae ?? '—'}</span>
                </div>
                <div>
                  <span className="block text-xs text-muted-foreground">Detectado</span>
                  {formatDate(v.detectedAt, true)}
                </div>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => openResolve(v)}>
                  Marcar como resuelto
                </Button>
                {v.kind === 'FACTURA' && (
                  <Button
                    size="sm"
                    onClick={() => {
                      cancel.reset();
                      setView({ kind: 'cancel', voucher: v });
                    }}
                  >
                    Anular con nota de crédito
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
        {resolved.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer font-medium text-muted-foreground">Resueltos ({resolved.length})</summary>
            <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-muted-foreground">
              {resolved.map((v) => (
                <li key={v.id}>
                  {voucherLabel(v)} ·{' '}
                  {v.resolution === 'CREDIT_NOTE'
                    ? `anulada con Nota de crédito ${v.documentLetter} ${v.pointOfSale}-${v.cancelledByNumber}${v.cancelledByCae ? ` (CAE ${v.cancelledByCae})` : ''}`
                    : `resuelta: ${v.resolution ? RESOLUTION_LABEL[v.resolution] : ''}`}
                  {v.resolutionNote && v.resolution !== 'CREDIT_NOTE' ? ` («${v.resolutionNote}»)` : ''}
                  {v.resolvedByName ? ` · ${v.resolvedByName}` : ''} · {formatDate(v.resolvedAt, true)}
                </li>
              ))}
            </ul>
          </details>
        )}
        <div className="flex justify-end">
          <Button variant="ghost" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div role="dialog" aria-modal="true" className="w-full max-w-xl rounded-xl border bg-card p-6 text-card-foreground shadow-2xl">
        {body}
      </div>
    </div>
  );
}
