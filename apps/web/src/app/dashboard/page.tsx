'use client';

import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getSocket } from '@/lib/socket';
import { useTheme } from '@/providers/ThemeProvider';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import OnboardingChecklist from './OnboardingChecklist';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface WarehouseStock {
  warehouseId: string;
  warehouseName: string;
  items: { articleVariantId: string; sku: string; articleName: string; quantity: number }[];
  totalItems: number;
}

interface RecentInvoice {
  id: string;
  customerName: string;
  total: number;
  balanceDue: number;
  status: string;
  issueDate: string;
  documentLetter: string;
  number: string;
}

interface Snapshot {
  stockByWarehouse: WarehouseStock[];
  recentInvoices: RecentInvoice[];
  todaySummary: { invoiceCount: number; total: number; paidCount: number };
  lowStockAlerts: {
    warehouseName: string;
    sku: string;
    articleName: string;
    currentQuantity: number;
    minimumQuantity: number;
  }[];
  salesLast7Days: { date: string; total: number; count: number }[];
}

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

export default function DashboardPage() {
  const queryClient = useQueryClient();
  const { theme } = useTheme();

  const { data, isLoading, error } = useQuery<Snapshot>({
    queryKey: ['dashboard-snapshot'],
    queryFn: () => api.get('/dashboard/snapshot').then((r) => r.data as Snapshot),
  });

  useEffect(() => {
    const socket = getSocket();

    socket.on('stock.updated', () => {
      void queryClient.invalidateQueries({ queryKey: ['dashboard-snapshot'] });
    });

    socket.on('invoice.created', () => {
      void queryClient.invalidateQueries({ queryKey: ['dashboard-snapshot'] });
    });

    // Cobro reconciliado por el webhook de Mercado Pago - "Cobrado hoy" ya
    // lo toma porque reusa el mismo Receipt que un cobro manual, sólo
    // falta refrescar el snapshot en vivo (ver MercadoPagoWebhookService).
    socket.on('invoice.paid', () => {
      void queryClient.invalidateQueries({ queryKey: ['dashboard-snapshot'] });
    });

    return () => {
      socket.off('stock.updated');
      socket.off('invoice.created');
      socket.off('invoice.paid');
    };
  }, [queryClient]);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-slate-500">
        Cargando tablero...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex h-64 items-center justify-center text-red-600 dark:text-red-400">
        Error al cargar el tablero
      </div>
    );
  }

  const { todaySummary, stockByWarehouse, recentInvoices, lowStockAlerts, salesLast7Days } = data;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Tablero</h1>

      <OnboardingChecklist />

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard
          label="Facturado hoy"
          value={`$${todaySummary.total.toFixed(2)}`}
          sub={`${todaySummary.invoiceCount} factura${todaySummary.invoiceCount !== 1 ? 's' : ''}`}
        />
        <KpiCard
          label="Cobrado hoy"
          value={`${todaySummary.paidCount}`}
          sub={`de ${todaySummary.invoiceCount} factura${todaySummary.invoiceCount !== 1 ? 's' : ''}`}
        />
        <KpiCard
          label="Alertas de stock"
          value={`${lowStockAlerts.length}`}
          sub="productos bajo mínimo"
          alert={lowStockAlerts.length > 0}
        />
      </div>

      {/* Sales chart + low stock */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Ventas últimos 7 días</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={salesLast7Days}>
                <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#1e293b' : '#e2e8f0'} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: theme === 'dark' ? '#94a3b8' : '#475569' }}
                  tickFormatter={(v: string) => v.slice(5)}
                />
                <YAxis tick={{ fontSize: 11, fill: theme === 'dark' ? '#94a3b8' : '#475569' }} width={60} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: theme === 'dark' ? '#0f172a' : '#ffffff',
                    border: `1px solid ${theme === 'dark' ? '#1e293b' : '#e2e8f0'}`,
                  }}
                  labelStyle={{ color: theme === 'dark' ? '#94a3b8' : '#475569' }}
                  formatter={(v) => [`$${Number(v ?? 0).toFixed(2)}`, 'Total']}
                />
                <Bar dataKey="total" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Alertas de stock</CardTitle>
          </CardHeader>
          <CardContent>
            {lowStockAlerts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin alertas</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {lowStockAlerts.map((a, i) => (
                  <li key={i} className="rounded-lg bg-destructive/10 p-3">
                    <p className="text-sm font-medium text-destructive">{a.sku}</p>
                    <p className="text-xs text-destructive/80">{a.articleName}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {a.currentQuantity} / {a.minimumQuantity} mín · {a.warehouseName}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Stock by warehouse */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">Stock por depósito</CardTitle>
        </CardHeader>
        <CardContent>
          {stockByWarehouse.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin depósitos creados</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {stockByWarehouse.map((wh) => (
                <Card key={wh.warehouseId} size="sm" className="bg-muted/40">
                  <CardContent>
                    <div className="mb-2 flex items-center justify-between">
                      <span className="font-medium">{wh.warehouseName}</span>
                      <span className="text-lg font-bold text-primary">{wh.totalItems}</span>
                    </div>
                    {wh.items.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Sin stock</p>
                    ) : (
                      <ul className="flex flex-col gap-1">
                        {wh.items.slice(0, 5).map((item) => (
                          <li key={item.articleVariantId} className="flex justify-between text-xs">
                            <span className="truncate text-muted-foreground">{item.sku}</span>
                            <span className="ml-2 shrink-0">{item.quantity}</span>
                          </li>
                        ))}
                        {wh.items.length > 5 && (
                          <li className="text-xs text-muted-foreground">+{wh.items.length - 5} más</li>
                        )}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent invoices */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">Últimas facturas</CardTitle>
        </CardHeader>
        <CardContent>
          {recentInvoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin facturas</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="pb-2 pr-4">Número</th>
                    <th className="pb-2 pr-4">Cliente</th>
                    <th className="pb-2 pr-4">Fecha</th>
                    <th className="pb-2 pr-4 text-right">Total</th>
                    <th className="pb-2 pr-4 text-right">Saldo</th>
                    <th className="pb-2">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {recentInvoices.map((inv) => (
                    <tr key={inv.id} className="border-b border-border/50 hover:bg-muted/40">
                      <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">
                        {inv.documentLetter}-{inv.number}
                      </td>
                      <td className="py-2 pr-4">{inv.customerName}</td>
                      <td className="py-2 pr-4 text-muted-foreground">
                        {new Date(inv.issueDate).toLocaleDateString('es-AR')}
                      </td>
                      <td className="py-2 pr-4 text-right">${inv.total.toFixed(2)}</td>
                      <td className="py-2 pr-4 text-right text-muted-foreground">${inv.balanceDue.toFixed(2)}</td>
                      <td className="py-2">
                        <Badge className={STATUS_COLORS[inv.status] ?? 'bg-slate-300 dark:bg-slate-700 text-slate-700 dark:text-slate-300'}>
                          {STATUS_LABELS[inv.status] ?? inv.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  alert,
}: {
  label: string;
  value: string;
  sub: string;
  alert?: boolean;
}) {
  return (
    <Card className={alert ? 'bg-destructive/5 ring-destructive/30' : undefined}>
      <CardContent>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`mt-1 text-2xl font-bold ${alert ? 'text-destructive' : ''}`}>{value}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}
