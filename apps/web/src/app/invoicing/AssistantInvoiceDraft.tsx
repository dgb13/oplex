'use client';

import { newLineKey, type SalesLine } from '@/components/sales/salesDocument';
import { assistantActionsApi } from '@/lib/assistant';
import { inventoryApi } from '@/lib/inventory';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import NewInvoiceModal from './NewInvoiceModal';

/** Abre Nueva factura con lo que dejó preparado el asistente ("Preparar
 * factura", docs/planesdemodulos/plan-asistente-fase2-gestion-acciones.md).
 * El asistente nunca emite: la persona revisa todo acá y la emite como
 * cualquier otra factura. La alícuota de cada línea sale del artículo, igual
 * que cuando se agrega a mano. */
export default function AssistantInvoiceDraft({ actionId, onClose }: { actionId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const draftQuery = useQuery({
    queryKey: ['assistant-invoice-draft', actionId],
    queryFn: () => assistantActionsApi.invoiceDraft(actionId),
    retry: false,
  });
  const articlesQuery = useQuery({
    queryKey: ['inventory-articles'],
    queryFn: () => inventoryApi.listArticles({ includeInactive: true }),
  });

  if (draftQuery.isError) {
    const message = (draftQuery.error as AxiosError<{ message?: string }>).response?.data?.message;
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
        <div className="max-w-sm rounded-xl bg-background p-5 text-sm shadow-xl">
          <p className="font-medium">No se pudo abrir la factura preparada</p>
          <p className="mt-1 text-muted-foreground">{typeof message === 'string' ? message : 'Probá de nuevo en un rato.'}</p>
          <button type="button" onClick={onClose} className="mt-4 rounded-lg border px-3 py-1.5 hover:bg-muted">
            Cerrar
          </button>
        </div>
      </div>
    );
  }

  if (!draftQuery.data || !articlesQuery.data) {
    return <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 text-sm text-white">Armando la factura...</div>;
  }

  const articleByVariant = new Map(articlesQuery.data.flatMap((a) => a.variants.map((v) => [v.id, a] as const)));
  const lines: SalesLine[] = draftQuery.data.lines.map((line) => {
    const article = articleByVariant.get(line.articleVariantId);
    return {
      key: newLineKey(),
      articleVariantId: line.articleVariantId,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      taxKind: article?.taxKind ?? 'GRAVADO',
      taxRate: article?.taxRate ?? 0,
    };
  });

  return (
    <NewInvoiceModal
      initialLines={lines}
      initialCustomerId={draftQuery.data.customerId}
      initialNotes={draftQuery.data.notes ?? undefined}
      onCreated={() => void queryClient.invalidateQueries({ queryKey: ['assistant-history'] })}
      onClose={onClose}
    />
  );
}
