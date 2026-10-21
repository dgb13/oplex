'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { mercadoPagoApi, type PaymentLinkRow } from '@/lib/mercadopago';
import { formatMoney } from '@/lib/vatCost';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';

const STATUS: Record<PaymentLinkRow['status'], { label: string; pill: string }> = {
  PENDING: { label: 'Esperando pago', pill: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' },
  PAID: { label: 'Pagado', pill: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' },
  CANCELLED: { label: 'Cancelado', pill: 'bg-muted text-muted-foreground' },
  EXPIRED: { label: 'Vencido', pill: 'bg-muted text-muted-foreground' },
  REFUNDED: { label: 'Devuelto', pill: 'bg-muted text-muted-foreground' },
  ERROR: { label: 'Con error', pill: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' },
};

function errorMessage(err: AxiosError<{ message?: string | string[] }>, fallback: string): string {
  const message = err.response?.data?.message ?? fallback;
  return Array.isArray(message) ? message.join(', ') : message;
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
}

/**
 * Links de pago (etapa 4 de plan-seccion-mercadopago.md): los links de
 * facturas y cotizaciones, desde Facturación o el asistente. linksEnabled =
 * Configuración › "Links de pago": apagado, no se generan nuevos.
 */
export default function LinksTab({ connected, linksEnabled }: { connected: boolean; linksEnabled: boolean }) {
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<{ text: string; isError: boolean } | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);
  const { data: links, isLoading } = useQuery({
    queryKey: ['mercadopago-links'],
    queryFn: mercadoPagoApi.listPaymentLinks,
  });

  // Un documento con un link esperando el pago no necesita otro.
  const withPendingLink = new Set((links ?? []).filter((l) => l.status === 'PENDING').map((l) => l.documentId));

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ['mercadopago-links'] });
  }
  function fail(fallback: string) {
    return (err: AxiosError<{ message?: string | string[] }>) => setNotice({ text: errorMessage(err, fallback), isError: true });
  }

  const emailMutation = useMutation({
    mutationFn: (link: PaymentLinkRow) => mercadoPagoApi.emailPaymentLink(link.id),
    onSuccess: ({ to }, link) => setNotice({ text: `Se mandó el link de la ${link.documentLabel} a ${to}.`, isError: false }),
    onError: fail('No se pudo mandar el correo'),
  });
  const cancelMutation = useMutation({
    mutationFn: (link: PaymentLinkRow) => mercadoPagoApi.cancelPaymentLink(link.id),
    onSuccess: (_, link) => {
      setConfirmCancel(null);
      setNotice({ text: `Se canceló el link de la ${link.documentLabel}.`, isError: false });
      refresh();
    },
    onError: fail('No se pudo cancelar el link'),
  });
  const regenerateMutation = useMutation({
    mutationFn: (link: PaymentLinkRow) => mercadoPagoApi.createPaymentLink(link.documentType, link.documentId),
    onSuccess: (_, link) => {
      setNotice({ text: `Se generó un link nuevo para la ${link.documentLabel}.`, isError: false });
      refresh();
    },
    onError: fail('No se pudo generar el link'),
  });

  async function copy(link: PaymentLinkRow) {
    if (!link.initPoint) return;
    try {
      await navigator.clipboard.writeText(link.initPoint);
      setNotice({ text: `Link de la ${link.documentLabel} copiado.`, isError: false });
    } catch {
      setNotice({ text: 'No se pudo copiar: el navegador no dejó usar el portapapeles.', isError: true });
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Links de pago que mandaste desde facturas, cotizaciones o el asistente. Cuando el cliente paga una factura, el
        cobro se registra solo.
      </p>
      {!linksEnabled && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          Los links de pago están apagados en Configuración: no se pueden generar nuevos. Los que ya mandaste siguen
          funcionando hasta que los canceles.
        </p>
      )}
      {notice && (
        <p className={`text-sm ${notice.isError ? 'text-destructive' : 'text-green-700 dark:text-green-400'}`}>{notice.text}</p>
      )}

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3.5 py-3 font-semibold">Documento</th>
                <th className="px-3.5 py-3 font-semibold">Cliente</th>
                <th className="px-3.5 py-3 text-right font-semibold">Monto</th>
                <th className="px-3.5 py-3 font-semibold">Creado</th>
                <th className="px-3.5 py-3 font-semibold">Estado</th>
                <th className="px-3.5 py-3 font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-3.5 py-6 text-muted-foreground">
                    Cargando...
                  </td>
                </tr>
              ) : !links || links.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3.5 py-6 text-muted-foreground">
                    Todavía no se mandó ningún link de pago. Se generan desde Facturación con &quot;Cobrar con Mercado
                    Pago&quot;.
                  </td>
                </tr>
              ) : (
                links.map((link) => (
                  <tr key={link.id} className="border-b border-border/70 last:border-0">
                    <td className="px-3.5 py-3 font-semibold">{link.documentLabel}</td>
                    <td className="px-3.5 py-3">{link.customerName ?? '—'}</td>
                    <td className="whitespace-nowrap px-3.5 py-3 text-right">
                      {link.currency === 'ARS' ? formatMoney(Number(link.amount)) : `${link.currency} ${Number(link.amount).toLocaleString('es-AR')}`}
                    </td>
                    <td className="px-3.5 py-3 text-muted-foreground">{shortDate(link.createdAt)}</td>
                    <td className="px-3.5 py-3">
                      <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS[link.status].pill}`}>
                        {link.status === 'PAID' && link.paidAt ? `Pagado ${shortDate(link.paidAt)}` : STATUS[link.status].label}
                      </span>
                    </td>
                    <td className="px-3.5 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {link.status === 'PENDING' && confirmCancel !== link.id && (
                          <>
                            <Button type="button" variant="outline" size="sm" onClick={() => void copy(link)}>
                              Copiar link
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={!link.customerEmail || emailMutation.isPending}
                              title={link.customerEmail ? `Se manda a ${link.customerEmail}` : 'El cliente no tiene correo cargado'}
                              onClick={() => emailMutation.mutate(link)}
                            >
                              Reenviar por correo
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40"
                              onClick={() => setConfirmCancel(link.id)}
                            >
                              Cancelar
                            </Button>
                          </>
                        )}
                        {link.status === 'PENDING' && confirmCancel === link.id && (
                          <>
                            <span className="text-xs">¿Cancelar? El link deja de aceptar pagos.</span>
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              disabled={cancelMutation.isPending}
                              onClick={() => cancelMutation.mutate(link)}
                            >
                              Sí, cancelar
                            </Button>
                            <Button type="button" variant="outline" size="sm" onClick={() => setConfirmCancel(null)}>
                              No
                            </Button>
                          </>
                        )}
                        {(link.status === 'CANCELLED' || link.status === 'ERROR' || link.status === 'EXPIRED') &&
                          link.payable &&
                          !withPendingLink.has(link.documentId) && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={!connected || !linksEnabled || regenerateMutation.isPending}
                              onClick={() => regenerateMutation.mutate(link)}
                            >
                              Generar uno nuevo
                            </Button>
                          )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  );
}
