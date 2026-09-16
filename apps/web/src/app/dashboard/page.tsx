'use client';

import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getSocket } from '@/lib/socket';
import { productionApi } from '@/lib/production';
import { subscriptionsApi } from '@/lib/subscriptions';
import { useCountUp } from '@/lib/useCountUp';
import { useTheme } from '@/providers/ThemeProvider';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Clock,
  DollarSign,
  Factory,
  MoreHorizontal,
  Package,
  Receipt,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import OnboardingChecklist from './OnboardingChecklist';
import {
  Area,
  AreaChart,
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

/** Atajo de navegación en la esquina de cada card - no un menú de acciones
 * con varias opciones (todavía no hay más de una por card), pero se deja el
 * mismo patrón de DropdownMenu para que sea trivial sumar una segunda
 * acción el día que haga falta. */
function CardMenu({ href, label }: { href: string; label: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon-xs" aria-label="Más opciones">
            <MoreHorizontal />
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuItem render={<Link href={href}>{label}</Link>} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Mismo queryKey que AppShell/TrialBanner (['subscription-me']) y que
 * production/page.tsx (['production-orders']) - React Query dedupea
 * ambos fetches, así que este widget no agrega ningún pedido nuevo al
 * navegar entre Tablero y Producción. No renderiza nada para un tenant en
 * un plan sin el módulo (BASIC). */
function ProductionWidget() {
  const { data: subscription } = useQuery({ queryKey: ['subscription-me'], queryFn: subscriptionsApi.getCurrent });
  const enabled = subscription?.plan.productionModuleEnabled ?? false;
  const ordersQuery = useQuery({ queryKey: ['production-orders'], queryFn: productionApi.listOrders, enabled });

  if (!enabled) {
    return null;
  }

  const waiting = ordersQuery.data?.filter((o) => o.status === 'PLANNED' && o.isShortOnMaterials).length ?? 0;

  return (
    <Link
      href="/production"
      className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 text-sm transition hover:bg-muted/40"
    >
      <div
        className={`flex h-8 w-8 items-center justify-center rounded-lg ${
          waiting > 0 ? 'bg-amber-600/10 text-amber-600 dark:text-amber-400' : 'bg-primary/10 text-primary'
        }`}
      >
        <Factory className="h-4 w-4" />
      </div>
      <div>
        <p className="font-medium">
          {waiting > 0 ? `${waiting} orden${waiting === 1 ? '' : 'es'} esperando insumos` : 'Producción al día'}
        </p>
        <p className="text-xs text-muted-foreground">Ver módulo de Producción</p>
      </div>
    </Link>
  );
}

export default function DashboardPage() {
  const queryClient = useQueryClient();
  const { theme } = useTheme();

  const { data, error } = useQuery<Snapshot>({
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

  // Dispara el stagger/count-up una sola vez, cuando el snapshot llega por
  // primera vez - a propósito no depende de `data` directo (que es una
  // referencia nueva en cada refetch en segundo plano por los sockets de
  // arriba), así una factura creada en otra pestaña no vuelve a hacer
  // aparecer las cards de cero cada vez, sólo la primera carga real.
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    if (!data || revealed) return undefined;
    const id = setTimeout(() => setRevealed(true), 30);
    return () => clearTimeout(id);
  }, [data, revealed]);

  const stockTotal = data ? data.stockByWarehouse.reduce((sum, wh) => sum + wh.totalItems, 0) : 0;
  const pendingInvoices = data ? data.todaySummary.invoiceCount - data.todaySummary.paidCount : 0;
  const avgTicket =
    data && data.todaySummary.invoiceCount > 0 ? data.todaySummary.total / data.todaySummary.invoiceCount : 0;

  // Sólo "Facturado hoy" y "Ticket promedio" tienen una serie real de 7 días
  // detrás (salesLast7Days, que el snapshot ya trae) - las otras cuatro KPIs
  // no tienen historial en el backend todavía, así que no llevan sparkline
  // en vez de inventar una tendencia falsa.
  const kpis: KpiDef[] = data
    ? [
        {
          id: 'facturado',
          icon: DollarSign,
          label: 'Facturado hoy',
          value: data.todaySummary.total,
          prefix: '$',
          decimals: 2,
          sub: `${data.todaySummary.invoiceCount} factura${data.todaySummary.invoiceCount !== 1 ? 's' : ''}`,
          accent: 'emerald',
          spark: data.salesLast7Days.map((d) => ({ v: d.total })),
        },
        {
          id: 'cobrado',
          icon: Wallet,
          label: 'Cobrado hoy',
          value: data.todaySummary.paidCount,
          decimals: 0,
          sub: `de ${data.todaySummary.invoiceCount} factura${data.todaySummary.invoiceCount !== 1 ? 's' : ''}`,
          accent: 'sky',
        },
        {
          id: 'ticket',
          icon: Receipt,
          label: 'Ticket promedio',
          value: avgTicket,
          prefix: '$',
          decimals: 2,
          sub: 'facturado hoy',
          accent: 'violet',
          spark: data.salesLast7Days.map((d) => ({ v: d.count > 0 ? d.total / d.count : 0 })),
        },
        {
          id: 'pendientes',
          icon: Clock,
          label: 'Facturas pendientes',
          value: pendingInvoices,
          decimals: 0,
          sub: pendingInvoices > 0 ? 'sin cobrar todavía' : 'todo cobrado',
          accent: 'amber',
        },
        {
          id: 'stock',
          icon: Package,
          label: 'Stock total',
          value: stockTotal,
          decimals: 0,
          sub: `${data.stockByWarehouse.length} depósito${data.stockByWarehouse.length !== 1 ? 's' : ''}`,
          accent: 'primary',
        },
        {
          id: 'alertas',
          icon: AlertTriangle,
          label: 'Alertas de stock',
          value: data.lowStockAlerts.length,
          decimals: 0,
          sub: 'productos bajo mínimo',
          alert: data.lowStockAlerts.length > 0,
        },
      ]
    : [];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Tablero</h1>

      <OnboardingChecklist />
      <ProductionWidget />

      {error ? (
        <p className="text-sm text-destructive">Error al cargar el tablero</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {data
              ? kpis.map((def, i) => <KpiCard key={def.id} def={def} index={i} revealed={revealed} />)
              : Array.from({ length: 6 }, (_, i) => <KpiCardSkeleton key={i} />)}
          </div>

          {data && (
            <DashboardBelowKpis
              salesLast7Days={data.salesLast7Days}
              lowStockAlerts={data.lowStockAlerts}
              stockByWarehouse={data.stockByWarehouse}
              recentInvoices={data.recentInvoices}
              theme={theme}
            />
          )}
        </>
      )}
    </div>
  );
}

function DashboardBelowKpis({
  salesLast7Days,
  lowStockAlerts,
  stockByWarehouse,
  recentInvoices,
  theme,
}: {
  salesLast7Days: Snapshot['salesLast7Days'];
  lowStockAlerts: Snapshot['lowStockAlerts'];
  stockByWarehouse: Snapshot['stockByWarehouse'];
  recentInvoices: Snapshot['recentInvoices'];
  theme: string;
}) {
  return (
    <>
      {/* Sales chart + low stock */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Ventas últimos 7 días</CardTitle>
            <CardAction>
              <CardMenu href="/reports" label="Ver reportes de ventas" />
            </CardAction>
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
            <CardAction>
              <CardMenu href="/inventory" label="Ver en Inventario" />
            </CardAction>
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
          <CardAction>
            <CardMenu href="/inventory" label="Ver Inventario" />
          </CardAction>
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
          <CardAction>
            <CardMenu href="/invoicing" label="Ver todas" />
          </CardAction>
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
    </>
  );
}

type KpiAccent = 'emerald' | 'sky' | 'violet' | 'amber' | 'primary';

interface KpiDef {
  id: string;
  icon: LucideIcon;
  label: string;
  value: number;
  prefix?: string;
  decimals?: number;
  sub: string;
  accent?: KpiAccent;
  alert?: boolean;
  spark?: { v: number }[];
}

const ACCENT: Record<KpiAccent, { icon: string; tint: string; stroke: string }> = {
  emerald: { icon: 'text-emerald-600 dark:text-emerald-400', tint: 'bg-emerald-600/10', stroke: '#10b981' },
  sky: { icon: 'text-sky-600 dark:text-sky-400', tint: 'bg-sky-600/10', stroke: '#0ea5e9' },
  violet: { icon: 'text-violet-600 dark:text-violet-400', tint: 'bg-violet-600/10', stroke: '#8b5cf6' },
  amber: { icon: 'text-amber-600 dark:text-amber-400', tint: 'bg-amber-600/10', stroke: '#f59e0b' },
  primary: { icon: 'text-primary', tint: 'bg-primary/10', stroke: '#6366f1' },
};

function KpiCard({ def, index, revealed }: { def: KpiDef; index: number; revealed: boolean }) {
  const shown = useCountUp(def.value, revealed);
  const accent = ACCENT[def.accent ?? 'primary'];
  const gradId = `kpi-grad-${def.id}`;

  return (
    <Card
      className={`transition-all duration-500 ease-out hover:-translate-y-0.5 hover:shadow-lg ${
        revealed ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
      } ${def.alert ? 'bg-destructive/5 ring-destructive/30' : ''}`}
      style={{ transitionDelay: `${index * 90}ms` }}
    >
      <CardContent className="flex flex-col gap-1">
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-lg ${
            def.alert ? 'bg-destructive/10 text-destructive' : `${accent.tint} ${accent.icon}`
          }`}
        >
          <def.icon className="h-4 w-4" />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{def.label}</p>
        <p className={`text-2xl font-bold tabular-nums ${def.alert ? 'text-destructive' : ''}`}>
          {def.prefix}
          {shown.toFixed(def.decimals ?? 0)}
        </p>
        <p className="text-xs text-muted-foreground">{def.sub}</p>
        {def.spark && (
          <div className="-mx-1 mt-1 h-9">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={def.spark} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={accent.stroke} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={accent.stroke} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke={accent.stroke}
                  strokeWidth={2}
                  fill={`url(#${gradId})`}
                  dot={false}
                  isAnimationActive={revealed}
                  animationDuration={1100}
                  animationBegin={index * 90 + 150}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function KpiCardSkeleton() {
  return (
    <Card>
      <CardContent className="flex flex-col gap-2">
        <div className="skeleton-shimmer h-8 w-8 rounded-lg bg-muted" />
        <div className="skeleton-shimmer mt-1 h-3 w-16 rounded bg-muted" />
        <div className="skeleton-shimmer h-6 w-20 rounded bg-muted" />
        <div className="skeleton-shimmer h-3 w-14 rounded bg-muted" />
      </CardContent>
    </Card>
  );
}
