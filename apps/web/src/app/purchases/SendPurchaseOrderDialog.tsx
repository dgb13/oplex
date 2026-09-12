'use client';

import { companiesApi } from '@/lib/companies';
import { resolveUploadUrl } from '@/lib/inventory';
import { purchaseOrdersApi } from '@/lib/purchases';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';

interface Props {
  purchaseOrder: { id: string; number: string; supplierId: string; supplierName: string; supplierEmail: string | null };
  onClose: () => void;
}

/** Shown right after "Emitir Orden de Compra" (or manually from the OC
 * detail panel for a still-unsent DRAFT) - the warning the user asked for:
 * send now (email or WhatsApp) or just leave it saved. */
export default function SendPurchaseOrderDialog({ purchaseOrder, onClose }: Props) {
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [selectedPhone, setSelectedPhone] = useState('');

  const { data: supplier } = useQuery({
    queryKey: ['company-detail', purchaseOrder.supplierId],
    queryFn: () => companiesApi.get(purchaseOrder.supplierId),
  });
  const whatsappContacts = (supplier?.people ?? []).filter((p) => p.whatsapp);
  const phone = selectedPhone || whatsappContacts[0]?.whatsapp || '';
  const selectedContact = whatsappContacts.find((c) => c.whatsapp === phone);
  const contactName = selectedContact ? `${selectedContact.firstName} ${selectedContact.lastName ?? ''}`.trim() : undefined;
  // Absolute URL, not the relative /uploads/people/... path the API
  // returns - this gets snapshotted as-is onto the order and rendered
  // directly as an <img src>, potentially from a different session/host.
  const contactAvatarUrl = selectedContact ? (resolveUploadUrl(selectedContact.avatarUrl) ?? undefined) : undefined;

  function invalidateAndReport(message: string) {
    void queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
    void queryClient.invalidateQueries({ queryKey: ['quote-requests'] });
    setError('');
    setDone(message);
  }

  const emailMutation = useMutation({
    mutationFn: () => purchaseOrdersApi.sendEmail(purchaseOrder.id),
    onSuccess: () => invalidateAndReport('Enviado por email'),
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo enviar el email';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  const whatsappMutation = useMutation({
    mutationFn: async () => {
      const { url } = await purchaseOrdersApi.whatsappLink(purchaseOrder.id, phone);
      window.open(url, '_blank');
      return purchaseOrdersApi.markSentWhatsapp(purchaseOrder.id, phone, contactName, contactAvatarUrl);
    },
    onSuccess: () => invalidateAndReport('Abrimos WhatsApp con el mensaje listo'),
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo armar el link de WhatsApp';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-2xl">
        <h2 className="mb-1 text-lg font-semibold">
          Orden de Compra {purchaseOrder.number} creada
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          ¿Se la enviamos a {purchaseOrder.supplierName} ahora, o preferís sólo guardarla?
        </p>

        <div className="flex flex-col gap-3">
          <button
            type="button"
            disabled={!purchaseOrder.supplierEmail || emailMutation.isPending}
            onClick={() => emailMutation.mutate()}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
            title={purchaseOrder.supplierEmail ?? 'El proveedor no tiene email cargado'}
          >
            {emailMutation.isPending ? 'Enviando...' : 'Enviar por Email'}
          </button>

          {whatsappContacts.length > 1 && (
            <select
              className="rounded-lg border bg-muted px-3 py-2 text-sm"
              value={phone}
              onChange={(e) => setSelectedPhone(e.target.value)}
            >
              {whatsappContacts.map((c) => (
                <option key={c.id} value={c.whatsapp ?? ''}>
                  {c.firstName} {c.lastName ?? ''} — {c.whatsapp}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            disabled={!phone || whatsappMutation.isPending}
            onClick={() => whatsappMutation.mutate()}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-green-500 disabled:opacity-50"
            title={phone || 'El proveedor no tiene ningún contacto con WhatsApp cargado'}
          >
            {whatsappMutation.isPending ? 'Abriendo...' : 'Enviar por WhatsApp'}
          </button>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border px-4 py-2 text-sm transition hover:bg-muted"
          >
            Sólo guardar (no enviar ahora)
          </button>
        </div>

        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        {done && (
          <div className="mt-3 flex flex-col gap-2">
            <p className="text-sm text-green-600 dark:text-green-400">{done}</p>
            <button
              type="button"
              onClick={onClose}
              className="self-start rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
            >
              Cerrar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
