'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { quotesApi, type QuoteDetail } from '@/lib/quotes';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

interface Props {
  quote: QuoteDetail;
  onClose: () => void;
}

/** "Enviar por WhatsApp" - same "no delivery receipt" pattern as
 * PurchaseOrderFollowUpModal's WhatsApp button: opens a wa.me link with a
 * pre-filled message (built server-side, see QuoteService.buildWhatsappLink)
 * and the user attaches the PDF by hand inside WhatsApp; "enviado" here just
 * means the user confirmed they went through with it. */
export default function QuoteFollowUpModal({ quote, onClose }: Props) {
  const queryClient = useQueryClient();
  const [phone, setPhone] = useState('');
  const [opened, setOpened] = useState(false);

  const markSentMutation = useMutation({
    mutationFn: () => quotesApi.markSentWhatsapp(quote.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['quotes'] });
      void queryClient.invalidateQueries({ queryKey: ['quote-detail', quote.id] });
      onClose();
    },
  });

  async function openWhatsapp() {
    const digits = phone.replace(/\D/g, '');
    if (!digits) return;
    const { url } = await quotesApi.whatsappLink(quote.id, phone);
    window.open(url, '_blank');
    setOpened(true);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Enviar por WhatsApp</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            ✕
          </button>
        </div>

        <label className="mb-1 block text-sm text-muted-foreground">Número de WhatsApp</label>
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+54 9 11..." />
        <p className="mt-2 text-xs text-muted-foreground">
          Se abre WhatsApp con el mensaje precargado. Adjuntá el PDF a mano y confirmá acá abajo que lo mandaste.
        </p>

        <div className="mt-4 flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          {!opened ? (
            <Button onClick={() => void openWhatsapp()} disabled={!phone}>
              Abrir WhatsApp
            </Button>
          ) : (
            <Button
              onClick={() => markSentMutation.mutate()}
              disabled={markSentMutation.isPending}
              className="bg-green-600 text-white hover:bg-green-500"
            >
              {markSentMutation.isPending ? 'Confirmando...' : 'Confirmar enviado'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
