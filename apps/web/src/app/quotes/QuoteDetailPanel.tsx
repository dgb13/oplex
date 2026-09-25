'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Select from '@/components/ui/Select';
import {
  describeQuoteStatus,
  PDF_STYLES,
  quotePreferencesApi,
  quotesApi,
  type PdfStyle,
  type QuoteDetail,
} from '@/lib/quotes';
import { buildVariantLabel } from '@/lib/inventory';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useEffect, useState } from 'react';
import ConvertQuoteToInvoiceModal from './ConvertQuoteToInvoiceModal';
import QuoteFollowUpModal from './QuoteFollowUpModal';

interface Props {
  quoteId: string;
  onClose: () => void;
  onEdit: (detail: QuoteDetail) => void;
}

export default function QuoteDetailPanel({ quoteId, onClose, onEdit }: Props) {
  const queryClient = useQueryClient();
  const [visible, setVisible] = useState(false);
  const [pdfStyle, setPdfStyle] = useState<PdfStyle>('MODERNO');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [converting, setConverting] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const { data: preferences } = useQuery({
    queryKey: ['quote-preferences'],
    queryFn: quotePreferencesApi.get,
  });
  const [styleTouched, setStyleTouched] = useState(false);
  useEffect(() => {
    if (!styleTouched && preferences) setPdfStyle(preferences.quotePdfStyle);
  }, [preferences, styleTouched]);

  const { data, isLoading } = useQuery({
    queryKey: ['quote-detail', quoteId],
    queryFn: () => quotesApi.get(quoteId),
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['quotes'] });
    void queryClient.invalidateQueries({ queryKey: ['quote-detail', quoteId] });
  }

  function onMutationError(fallback: string) {
    return (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? fallback;
      setError(Array.isArray(message) ? message.join(', ') : message);
    };
  }

  const cancelMutation = useMutation({
    mutationFn: () => quotesApi.cancel(quoteId),
    onSuccess: invalidate,
    onError: onMutationError('No se pudo cancelar la cotización'),
  });
  const acceptMutation = useMutation({
    mutationFn: () => quotesApi.accept(quoteId),
    onSuccess: invalidate,
    onError: onMutationError('No se pudo marcar como aceptada'),
  });
  const rejectMutation = useMutation({
    mutationFn: () => quotesApi.reject(quoteId),
    onSuccess: invalidate,
    onError: onMutationError('No se pudo marcar como rechazada'),
  });
  const sendEmailMutation = useMutation({
    mutationFn: () => quotesApi.sendEmail(quoteId),
    onSuccess: invalidate,
    onError: onMutationError('No se pudo enviar por email'),
  });

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60">
      <div
        className={`flex h-full w-full max-w-lg flex-col overflow-y-auto border-l bg-card p-6 shadow-2xl transition-transform duration-200 ${
          visible ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">{data?.number ?? '...'}</h2>
            {data && <p className="text-xs text-muted-foreground">{data.customer.name}</p>}
          </div>
          <button onClick={onClose} className="text-muted-foreground transition hover:text-foreground">
            ✕
          </button>
        </div>

        {isLoading || !data ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">Cargando...</div>
        ) : (
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Info label="Estado">
                <Badge className={describeQuoteStatus(data).colorClass}>{describeQuoteStatus(data).label}</Badge>
              </Info>
              <Info label="Fecha">{new Date(data.createdAt).toLocaleDateString('es-AR')}</Info>
              {data.validUntil && (
                <Info label="Válida hasta">
                  {/* Fecha "de día" guardada a medianoche UTC - en hora local (UTC-3) se veía un día antes. */}
                  {new Date(data.validUntil).toLocaleDateString('es-AR', { timeZone: 'UTC' })}
                </Info>
              )}
              {data.sentAt && (
                <Info label="Enviada">
                  {new Date(data.sentAt).toLocaleDateString('es-AR')} ({data.sentVia === 'EMAIL' ? 'Email' : 'WhatsApp'})
                </Info>
              )}
            </div>

            <section>
              <h3 className="mb-2 text-sm font-medium text-muted-foreground">Líneas</h3>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/50 text-left text-muted-foreground">
                      <th className="p-2">Artículo</th>
                      <th className="p-2 text-right">Cant.</th>
                      <th className="p-2 text-right">Precio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.lines.map((line) => (
                      <tr key={line.id} className="border-b border-border/50">
                        <td className="p-2">
                          <p className="">
                            {line.articleVariant.article.name}
                            {buildVariantLabel(line.articleVariant) && (
                              <span className="text-muted-foreground"> · {buildVariantLabel(line.articleVariant)}</span>
                            )}
                          </p>
                          <p className="font-mono text-[10px] text-muted-foreground">{line.articleVariant.sku}</p>
                        </td>
                        <td className="p-2 text-right">{line.quantity}</td>
                        <td className="p-2 text-right">
                          ${Number(line.unitPrice).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-right text-sm font-semibold">
                Total: ${Number(data.total).toFixed(2)} {data.currency.code}
              </p>
            </section>

            {data.notes && (
              <section>
                <h3 className="mb-1 text-sm font-medium text-muted-foreground">Notas</h3>
                <p className="text-sm">{data.notes}</p>
              </section>
            )}

            <section className="flex flex-col gap-2 border-t pt-4">
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  value={pdfStyle}
                  onChange={(s) => {
                    setPdfStyle(s as PdfStyle);
                    setStyleTouched(true);
                  }}
                  options={PDF_STYLES}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void quotesApi.openPdf(quoteId, pdfStyle)}
                >
                  Descargar PDF
                </Button>
              </div>

              <div className="flex flex-wrap gap-2">
                {data.status === 'DRAFT' && (
                  <>
                    <Button type="button" size="sm" variant="outline" onClick={() => onEdit(data)}>
                      Editar
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setSending(true)}
                      className="border-primary/30 text-primary hover:bg-primary/10"
                    >
                      Enviar...
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => sendEmailMutation.mutate()}
                      disabled={sendEmailMutation.isPending || !data.customer.email}
                      title={!data.customer.email ? 'El cliente no tiene email cargado' : undefined}
                    >
                      {sendEmailMutation.isPending ? 'Enviando...' : 'Enviar por email'}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => cancelMutation.mutate()}
                      disabled={cancelMutation.isPending}
                      className="border-destructive/30 text-destructive hover:bg-destructive/10"
                    >
                      Cancelar
                    </Button>
                  </>
                )}
                {data.status === 'SENT' && (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => acceptMutation.mutate()}
                      disabled={acceptMutation.isPending}
                      className="bg-green-600 text-white hover:bg-green-500"
                    >
                      Marcar aceptada
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => rejectMutation.mutate()}
                      disabled={rejectMutation.isPending}
                      className="border-destructive/30 text-destructive hover:bg-destructive/10"
                    >
                      Marcar rechazada
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => cancelMutation.mutate()}
                      disabled={cancelMutation.isPending}
                    >
                      Cancelar
                    </Button>
                  </>
                )}
                {data.status === 'ACCEPTED' &&
                  (data.invoices.length > 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Ya facturada — <span className="font-medium text-foreground">{data.invoices[0].number}</span>
                    </p>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => setConverting(true)}
                      className="bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                      Convertir a factura
                    </Button>
                  ))}
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </section>
          </div>
        )}
      </div>

      {sending && data && <QuoteFollowUpModal quote={data} onClose={() => setSending(false)} />}
      {converting && data && (
        <ConvertQuoteToInvoiceModal
          quote={data}
          onClose={() => setConverting(false)}
          onConverted={() => setConverting(false)}
        />
      )}
    </div>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="">{children}</p>
    </div>
  );
}
