'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { mercadoPagoApi, type PaymentIntent } from '@/lib/mercadopago';
import { getSocket } from '@/lib/socket';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useEffect, useState } from 'react';
import type { Invoice } from '@/lib/invoicing';

interface Props {
  invoice: Invoice;
  onClose: () => void;
}

interface InvoicePaidEvent {
  invoiceId: string;
}

function errorMessage(err: AxiosError<{ message?: string | string[] }>, fallback: string): string {
  const message = err.response?.data?.message ?? fallback;
  return Array.isArray(message) ? message.join(', ') : message;
}

/**
 * Genera el link/QR de cobro (o reusa el PENDING existente, ver
 * MercadoPagoPaymentService.createPaymentLink - a igual documento+monto,
 * el segundo click nunca crea una preferencia duplicada) y escucha
 * 'invoice.paid' (ver MercadoPagoWebhookService/DashboardGateway) para
 * pasar de "Esperando pago" a "Pagado" sin que nadie recargue nada - el
 * webhook llega del lado del servidor, no de una acción de este mismo
 * navegador, así que sin WebSocket nadie se entera hasta refrescar.
 */
export default function MercadoPagoPaymentModal({ invoice, onClose }: Props) {
  const queryClient = useQueryClient();
  const [intent, setIntent] = useState<PaymentIntent | null>(null);
  const [paidNow, setPaidNow] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const createMutation = useMutation({
    mutationFn: () => mercadoPagoApi.createPaymentLink('INVOICE', invoice.id),
    onSuccess: (result) => {
      setError('');
      setIntent(result);
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      setError(errorMessage(err, 'No se pudo generar el link de cobro con Mercado Pago'));
    },
  });

  // Se dispara solo al abrir el modal - un segundo click en "Cobrar con
  // Mercado Pago" para la misma factura reabre este modal y vuelve a
  // pedir el link, que el backend resuelve al MISMO intent si sigue
  // PENDING (no genera un cobro nuevo).
  useEffect(() => {
    createMutation.mutate();
    // createMutation is a fresh reference from useMutation every render -
    // deliberately excluded from deps, this must fire once per invoice.id
    // only, not on every re-render.
  }, [invoice.id]);

  useEffect(() => {
    const socket = getSocket();
    function onInvoicePaid(event: InvoicePaidEvent) {
      if (event.invoiceId === invoice.id) {
        setPaidNow(true);
        void queryClient.invalidateQueries({ queryKey: ['invoices'] });
      }
    }
    socket.on('invoice.paid', onInvoicePaid);
    return () => {
      socket.off('invoice.paid', onInvoicePaid);
    };
  }, [invoice.id, queryClient]);

  const cancelMutation = useMutation({
    mutationFn: () => (intent ? mercadoPagoApi.cancelPaymentLink(intent.id) : Promise.resolve(null)),
    onSuccess: () => onClose(),
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      setError(errorMessage(err, 'No se pudo cancelar el link de cobro'));
    },
  });

  const documentNumber = `${invoice.documentLetter}-${invoice.number}`;
  const message = intent?.initPoint
    ? `Hola! Te paso el link para pagar la factura ${documentNumber} ($${invoice.balanceDue}): ${intent.initPoint}`
    : '';

  function openWhatsapp() {
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
  }

  function openEmail() {
    const subject = `Link de pago - Factura ${documentNumber}`;
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
  }

  async function copyLink() {
    if (!intent?.initPoint) return;
    await navigator.clipboard.writeText(intent.initPoint);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 text-card-foreground shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Cobrar con Mercado Pago</h2>
          <button onClick={onClose} className="text-muted-foreground transition hover:text-foreground">
            ✕
          </button>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">
          {documentNumber} · saldo pendiente ${invoice.balanceDue}
        </p>

        {paidNow ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/40 text-2xl text-green-600 dark:text-green-400">
              ✓
            </span>
            <p className="text-sm font-medium text-green-700 dark:text-green-400">¡Pagado!</p>
            <Button onClick={onClose}>Cerrar</Button>
          </div>
        ) : createMutation.isPending ? (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
            Generando link de cobro...
          </div>
        ) : error ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-destructive">{error}</p>
            <Button
              size="sm"
              variant="outline"
              className="self-start"
              onClick={() => {
                setError('');
                createMutation.mutate();
              }}
            >
              Reintentar
            </Button>
          </div>
        ) : intent?.initPoint ? (
          <div className="flex flex-col items-center gap-4">
            <span className="rounded-full bg-amber-100 dark:bg-amber-900/40 px-3 py-1 text-xs font-medium text-amber-700 dark:text-amber-400">
              Esperando pago
            </span>

            {intent.qrCodeBase64 && (
              <img src={intent.qrCodeBase64} alt="QR de pago" className="h-44 w-44 rounded-lg bg-white p-2" />
            )}

            <div className="flex w-full items-center gap-2">
              <Input readOnly value={intent.initPoint} className="flex-1 truncate text-xs" />
              <Button size="sm" variant="outline" className="shrink-0" onClick={() => void copyLink()}>
                {copied ? 'Copiado' : 'Copiar'}
              </Button>
            </div>

            <div className="flex w-full gap-2">
              <Button
                onClick={openWhatsapp}
                className="flex-1 bg-green-600 text-white hover:bg-green-500"
              >
                Enviar por WhatsApp
              </Button>
              <Button size="default" variant="outline" className="flex-1" onClick={openEmail}>
                Enviar por email
              </Button>
            </div>

            <button
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending}
              className="mt-1 text-xs text-muted-foreground hover:text-destructive disabled:opacity-50"
            >
              {cancelMutation.isPending ? 'Cancelando...' : 'Cancelar este link de cobro'}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
