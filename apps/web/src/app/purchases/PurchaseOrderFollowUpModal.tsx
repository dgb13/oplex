'use client';

import type { PurchaseOrderSummary } from '@/lib/purchases';
import { purchaseOrdersApi } from '@/lib/purchases';
import { useMutation } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';

interface Props {
  order: PurchaseOrderSummary;
  onClose: () => void;
}

const inputClass =
  'h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

function buildTemplates(contact: string, orderNumber: string, dateLabel: string): string[] {
  return [
    `Hola ${contact}, ¿nos confirmás si ya despachaste el pedido de la OC ${orderNumber} (del ${dateLabel})?`,
    `Hola ${contact}, tenemos apuro con la recepción de la OC ${orderNumber} - ¿nos das una fecha estimada?`,
    `Hola ${contact}, ¿cómo va la OC ${orderNumber}? Necesitamos coordinar la recepción de la mercadería.`,
    `Hola ${contact}, te escribimos para saber si hay alguna demora con la OC ${orderNumber} del ${dateLabel}.`,
    `Hola ${contact}, ¿nos podés confirmar el estado de la OC ${orderNumber}? Gracias.`,
  ];
}

/** Abierto al clickear el badge/avatar de "Enviada vía" en OrdenesTab - un
 * mensaje corto de seguimiento a la MISMA persona/canal por el que se mandó
 * la orden (snapshot sentToPhone/sentToEmail), no un reenvío del documento
 * (eso es SendPurchaseOrderDialog). WhatsApp sigue sin envío real acá tampoco
 * - arma el link wa.me con el texto elegido y lo abre, igual que el resto de
 * la app; Email sí manda de verdad (POST .../follow-up-email). */
export default function PurchaseOrderFollowUpModal({ order, onClose }: Props) {
  const contact = order.sentToContactName ?? order.supplier.name;
  const dateLabel = new Date(order.createdAt).toLocaleDateString('es-AR');
  const templates = buildTemplates(contact, order.number, dateLabel);

  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState('');

  const emailTarget = order.sentToEmail ?? order.supplier.email;
  const whatsappTarget = order.sentToPhone;

  const emailMutation = useMutation({
    mutationFn: () =>
      purchaseOrdersApi.sendFollowUpEmail(order.id, {
        to: emailTarget as string,
        text: message,
      }),
    onSuccess: () => {
      setError('');
      setSent('Mensaje enviado por correo');
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const msg = err.response?.data?.message ?? 'No se pudo enviar el correo';
      setError(Array.isArray(msg) ? msg.join(', ') : msg);
    },
  });

  function sendWhatsapp() {
    if (!whatsappTarget) return;
    const digits = whatsappTarget.replace(/\D/g, '');
    window.open(`https://wa.me/${digits}?text=${encodeURIComponent(message)}`, '_blank');
    setSent('Abrimos WhatsApp con el mensaje listo para enviar');
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-xl border bg-card p-6 shadow-2xl">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Mensaje rápido</h2>
          <button onClick={onClose} className="text-muted-foreground transition hover:text-foreground">
            ✕
          </button>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">
          Para {contact} · OC {order.number}
        </p>

        <div className="mb-3 flex flex-col gap-1.5">
          {templates.map((template, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setMessage(template)}
              className="rounded-lg border px-3 py-2 text-left text-xs transition hover:bg-muted"
            >
              {template}
            </button>
          ))}
        </div>

        <textarea
          className={`${inputClass} h-24 w-full resize-none`}
          value={message}
          onChange={(e) => {
            setMessage(e.target.value);
            setSent('');
          }}
          placeholder="Elegí una de las opciones de arriba, o escribí tu propio mensaje..."
        />

        {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
        {sent && <p className="mt-2 text-xs text-green-600 dark:text-green-400">{sent}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-muted-foreground transition hover:text-foreground"
          >
            Cerrar
          </button>
          <button
            type="button"
            onClick={sendWhatsapp}
            disabled={!whatsappTarget || !message.trim()}
            title={!whatsappTarget ? 'Esta orden no tiene un teléfono de WhatsApp registrado' : undefined}
            className="rounded-lg border border-green-500 px-4 py-2 text-sm font-medium text-green-600 dark:text-green-400 transition hover:bg-green-50 dark:hover:bg-green-950 disabled:opacity-40"
          >
            Enviar por WhatsApp
          </button>
          <button
            type="button"
            onClick={() => {
              setError('');
              setSent('');
              emailMutation.mutate();
            }}
            disabled={!emailTarget || !message.trim() || emailMutation.isPending}
            title={!emailTarget ? 'Esta orden no tiene un email registrado' : undefined}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-40"
          >
            {emailMutation.isPending ? 'Enviando...' : 'Enviar por correo'}
          </button>
        </div>
      </div>
    </div>
  );
}
