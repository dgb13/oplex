'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { describeQuoteStatus, quotesApi, type QuoteDetail as QuoteDetailType } from '@/lib/quotes';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import QuoteDetailPanel from './QuoteDetailPanel';
import QuoteFormModal from './QuoteFormModal';

export default function CotizacionesTab() {
  const [creating, setCreating] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editing, setEditing] = useState<QuoteDetailType | null>(null);

  const { data: quotes, isLoading } = useQuery({
    queryKey: ['quotes'],
    queryFn: () => quotesApi.list(),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button type="button" onClick={() => setCreating(true)}>
          Nueva cotización
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando...</p>
      ) : !quotes || quotes.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no hay cotizaciones</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-muted-foreground">
                <th className="p-3">Número</th>
                <th className="p-3">Cliente</th>
                <th className="p-3">Fecha</th>
                <th className="p-3">Estado</th>
                <th className="p-3 text-right">Total</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {quotes.map((q) => {
                const { label, colorClass } = describeQuoteStatus(q);
                return (
                  <tr key={q.id} className="border-b border-border/50">
                    <td className="p-3 font-mono text-xs">{q.number}</td>
                    <td className="p-3">{q.customer.name}</td>
                    <td className="p-3 text-muted-foreground">
                      {new Date(q.createdAt).toLocaleDateString('es-AR')}
                    </td>
                    <td className="p-3">
                      <Badge className={colorClass}>{label}</Badge>
                    </td>
                    <td className="p-3 text-right">
                      ${Number(q.total).toFixed(2)} {q.currency.code}
                    </td>
                    <td className="p-3">
                      <div className="flex justify-end gap-3 text-xs">
                        <button onClick={() => setDetailId(q.id)} className="text-primary hover:text-primary/80">
                          Ver
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {creating && <QuoteFormModal onClose={() => setCreating(false)} />}
      {editing && <QuoteFormModal quote={editing} onClose={() => setEditing(null)} />}
      {detailId && (
        <QuoteDetailPanel
          quoteId={detailId}
          onClose={() => setDetailId(null)}
          onEdit={(detail) => {
            setDetailId(null);
            setEditing(detail);
          }}
        />
      )}
    </div>
  );
}
