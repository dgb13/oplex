'use client';

import InvoiceDetailPanel from '@/components/InvoiceDetailPanel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { invoicingApi, type Invoice } from '@/lib/invoicing';
import { mercadoPagoApi } from '@/lib/mercadopago';
import { getSocket } from '@/lib/socket';
import { useDensity } from '@/providers/DensityProvider';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import CreditNoteModal from './CreditNoteModal';
import MercadoPagoPaymentModal from './MercadoPagoPaymentModal';
import NewInvoiceModal from './NewInvoiceModal';
import ReceiptModal from './ReceiptModal';

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Borrador',
  ISSUED: 'Emitida',
  PARTIALLY_PAID: 'Pago parcial',
  PAID: 'Pagada',
  OVERDUE: 'Vencida',
  CANCELLED: 'Cancelada',
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-slate-300 dark:bg-slate-700 text-slate-700 dark:text-slate-300',
  ISSUED: 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300',
  PARTIALLY_PAID: 'bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300',
  PAID: 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300',
  OVERDUE: 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300',
  CANCELLED: 'bg-slate-200 dark:bg-slate-800 text-slate-500',
};

export default function GestionTab() {
  const queryClient = useQueryClient();
  const { density } = useDensity();
  const cellY = density === 'compact' ? 'py-1' : 'py-2';
  const headY = density === 'compact' ? 'pb-1' : 'pb-2';
  const [search, setSearch] = useState('');
  const [newInvoiceOpen, setNewInvoiceOpen] = useState(false);
  const [receiptFor, setReceiptFor] = useState<Invoice | null>(null);
  const [creditNoteFor, setCreditNoteFor] = useState<Invoice | null>(null);
  const [detailFor, setDetailFor] = useState<Invoice | null>(null);
  const [mercadoPagoFor, setMercadoPagoFor] = useState<Invoice | null>(null);

  const invoicesQuery = useQuery({
    queryKey: ['invoices'],
    queryFn: invoicingApi.listInvoices,
  });

  // Mismo query key que la card de Preferencias - React Query lo cachea
  // una sola vez entre ambas pantallas, no duplica el pedido. Sólo importa
  // si está CONNECTED: el botón de cobro no tiene sentido mostrarlo si la
  // empresa nunca vinculó una cuenta.
  const { data: mercadoPagoStatus } = useQuery({
    queryKey: ['mercadopago-status'],
    queryFn: mercadoPagoApi.getStatus,
  });
  const mercadoPagoConnected = mercadoPagoStatus?.status === 'CONNECTED';

  useEffect(() => {
    const socket = getSocket();
    socket.on('invoice.created', () => {
      void queryClient.invalidateQueries({ queryKey: ['invoices'] });
    });
    // Cobro reconciliado por el webhook de Mercado Pago (ver
    // MercadoPagoWebhookService) - nadie en este navegador disparó la
    // acción, así que sin esto la fila se queda con el saldo viejo hasta
    // un refresh manual.
    socket.on('invoice.paid', () => {
      void queryClient.invalidateQueries({ queryKey: ['invoices'] });
    });
    return () => {
      socket.off('invoice.created');
      socket.off('invoice.paid');
    };
  }, [queryClient]);

  const invoices = invoicesQuery.data ?? [];
  const normalizedSearch = search.trim().toLowerCase();
  const rows =
    normalizedSearch === ''
      ? invoices
      : invoices.filter(
          (inv) =>
            inv.customerName.toLowerCase().includes(normalizedSearch) ||
            inv.number.includes(normalizedSearch),
        );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {rows.length} factura{rows.length !== 1 ? 's' : ''}
        </p>
        <Button onClick={() => setNewInvoiceOpen(true)}>+ Nueva factura</Button>
      </div>

      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar por cliente o número..."
        className="w-full sm:max-w-sm"
      />

      <Card>
        <CardContent>
        {invoicesQuery.isLoading ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            Cargando facturas...
          </div>
        ) : invoicesQuery.error ? (
          <div className="flex h-40 items-center justify-center text-destructive">
            Error al cargar las facturas
          </div>
        ) : rows.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            Sin facturas que coincidan
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className={`${headY} pr-4`}>Número</th>
                  <th className={`${headY} pr-4`}>Cliente</th>
                  <th className={`${headY} pr-4`}>Fecha</th>
                  <th className={`${headY} pr-4 text-right`}>Total</th>
                  <th className={`${headY} pr-4 text-right`}>Saldo</th>
                  <th className={`${headY} pr-4`}>Estado</th>
                  <th className={headY}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((inv) => (
                  <tr key={inv.id} className="border-b border-border/50 hover:bg-muted/40">
                    <td className={`${cellY} pr-4 font-mono text-xs text-muted-foreground`}>
                      {inv.documentLetter}-{inv.number}
                    </td>
                    <td className={`${cellY} pr-4`}>{inv.customerName}</td>
                    <td className={`${cellY} pr-4 text-muted-foreground`}>
                      {new Date(inv.issueDate).toLocaleDateString('es-AR')}
                    </td>
                    <td className={`${cellY} pr-4 text-right`}>${Number(inv.total).toFixed(2)}</td>
                    <td className={`${cellY} pr-4 text-right text-muted-foreground`}>
                      ${Number(inv.balanceDue).toFixed(2)}
                    </td>
                    <td className={`${cellY} pr-4`}>
                      <Badge className={STATUS_COLORS[inv.status] ?? 'bg-slate-300 dark:bg-slate-700 text-slate-700 dark:text-slate-300'}>
                        {STATUS_LABELS[inv.status] ?? inv.status}
                      </Badge>
                    </td>
                    <td className={cellY}>
                      <div className="flex gap-3">
                        <button onClick={() => setDetailFor(inv)} className="text-xs text-muted-foreground hover:text-foreground">
                          Ver detalle
                        </button>
                        {Number(inv.balanceDue) > 0 && inv.status !== 'CANCELLED' && (
                          <button onClick={() => setReceiptFor(inv)} className="text-xs text-primary hover:underline">
                            Cobrar
                          </button>
                        )}
                        {mercadoPagoConnected && Number(inv.balanceDue) > 0 && inv.status !== 'CANCELLED' && (
                          <button
                            onClick={() => setMercadoPagoFor(inv)}
                            className="text-xs text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300"
                          >
                            Cobrar con Mercado Pago
                          </button>
                        )}
                        {inv.afipCae && inv.status !== 'CANCELLED' && (
                          <button onClick={() => setCreditNoteFor(inv)} className="text-xs text-destructive hover:underline">
                            Nota de crédito
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        </CardContent>
      </Card>

      {newInvoiceOpen && <NewInvoiceModal onClose={() => setNewInvoiceOpen(false)} />}
      {receiptFor && <ReceiptModal invoice={receiptFor} onClose={() => setReceiptFor(null)} />}
      {mercadoPagoFor && (
        <MercadoPagoPaymentModal invoice={mercadoPagoFor} onClose={() => setMercadoPagoFor(null)} />
      )}
      {creditNoteFor && (
        <CreditNoteModal invoice={creditNoteFor} onClose={() => setCreditNoteFor(null)} />
      )}
      {detailFor && <InvoiceDetailPanel invoice={detailFor} onClose={() => setDetailFor(null)} />}
    </div>
  );
}
