'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { buildArticleVariantLookup } from '@/lib/inventory';
import { inventoryApi } from '@/lib/inventory';
import { productionApi } from '@/lib/production';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Factory, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ProductionPlanGateBanner, useProductionGate } from './ProductionPlanGate';
import { PRODUCTION_STATUS_COLORS, PRODUCTION_STATUS_LABELS } from './status';

type KpiAccent = 'sky' | 'amber' | 'emerald';

const ACCENT: Record<KpiAccent, { icon: string; tint: string }> = {
  sky: { icon: 'text-sky-600 dark:text-sky-400', tint: 'bg-sky-600/10' },
  amber: { icon: 'text-amber-600 dark:text-amber-400', tint: 'bg-amber-600/10' },
  emerald: { icon: 'text-emerald-600 dark:text-emerald-400', tint: 'bg-emerald-600/10' },
};

// Mismo useCountUp ~15 líneas que dashboard/page.tsx (sin react-countup,
// no justifica una dependencia nueva) - duplicado a propósito, no
// extraído a un hook compartido todavía (sólo 2 pantallas lo usan hoy).
function useCountUp(target: number, active: boolean, duration = 900): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!active) {
      setValue(0);
      return undefined;
    }
    let frame: number;
    const start = performance.now();
    function tick(now: number) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(target * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, target, duration]);
  return value;
}

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
  revealed,
  index,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  sub: string;
  accent: KpiAccent;
  revealed: boolean;
  index: number;
}) {
  const shown = useCountUp(value, revealed);
  const a = ACCENT[accent];
  return (
    <Card
      className={`transition-all duration-500 ease-out ${revealed ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'}`}
      style={{ transitionDelay: `${index * 90}ms` }}
    >
      <CardContent className="flex flex-col gap-1">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${a.tint} ${a.icon}`}>
          <Icon className="h-4 w-4" />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold tabular-nums">{shown.toFixed(0)}</p>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}

function KpiCardSkeleton() {
  return (
    <Card>
      <CardContent className="flex flex-col gap-2">
        <div className="skeleton-shimmer h-8 w-8 rounded-lg bg-muted" />
        <div className="skeleton-shimmer mt-1 h-3 w-20 rounded bg-muted" />
        <div className="skeleton-shimmer h-6 w-12 rounded bg-muted" />
        <div className="skeleton-shimmer h-3 w-16 rounded bg-muted" />
      </CardContent>
    </Card>
  );
}

export default function ProductionDashboardPage() {
  const gate = useProductionGate();
  const ordersQuery = useQuery({
    queryKey: ['production-orders'],
    queryFn: productionApi.listOrders,
    enabled: gate.enabled,
  });
  const articlesQuery = useQuery({
    queryKey: ['inventory-articles'],
    queryFn: () => inventoryApi.listArticles(),
    enabled: gate.enabled,
  });
  const lookup = useMemo(() => buildArticleVariantLookup(articlesQuery.data ?? []), [articlesQuery.data]);

  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    if (!ordersQuery.data || revealed) return undefined;
    const id = setTimeout(() => setRevealed(true), 30);
    return () => clearTimeout(id);
  }, [ordersQuery.data, revealed]);

  if (gate.isLoading) {
    return null;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Producción</h1>
        {gate.enabled && (
          <Button render={<Link href="/production/orders/new">Nueva orden</Link>} nativeButton={false} />
        )}
      </div>

      {!gate.enabled ? (
        <ProductionPlanGateBanner planName={gate.planName} />
      ) : (
        <ProductionDashboardBody
          orders={ordersQuery.data}
          lookup={lookup}
          revealed={revealed}
        />
      )}
    </div>
  );
}

function ProductionDashboardBody({
  orders,
  lookup,
  revealed,
}: {
  orders: import('@/lib/production').ProductionOrder[] | undefined;
  lookup: Record<string, { articleName: string; variantLabel: string | null; sku: string }>;
  revealed: boolean;
}) {
  const enCurso = orders?.filter((o) => o.status === 'PLANNED' || o.status === 'IN_PROGRESS').length ?? 0;
  const esperandoInsumos = orders?.filter((o) => o.status === 'PLANNED' && o.isShortOnMaterials).length ?? 0;
  const today = new Date().toISOString().slice(0, 10);
  const producidasHoy =
    orders?.filter((o) => o.status === 'DONE' && o.finishedAt?.slice(0, 10) === today).length ?? 0;

  return (
    <>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {orders ? (
          <>
            <KpiCard
              icon={Factory}
              label="Órdenes en curso"
              value={enCurso}
              sub="planificadas o en producción"
              accent="sky"
              revealed={revealed}
              index={0}
            />
            <KpiCard
              icon={AlertTriangle}
              label="Esperando insumos"
              value={esperandoInsumos}
              sub={esperandoInsumos > 0 ? 'faltan materiales' : 'todo cubierto'}
              accent="amber"
              revealed={revealed}
              index={1}
            />
            <KpiCard
              icon={CheckCircle2}
              label="Producidas hoy"
              value={producidasHoy}
              sub="órdenes completadas"
              accent="emerald"
              revealed={revealed}
              index={2}
            />
          </>
        ) : (
          Array.from({ length: 3 }, (_, i) => <KpiCardSkeleton key={i} />)
        )}
      </div>

      <Card>
        <CardContent>
          {!orders ? (
            <p className="text-sm text-muted-foreground">Cargando órdenes...</p>
          ) : orders.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todavía no creaste ninguna orden de producción.{' '}
              <Link href="/production/orders/new" className="font-medium text-primary">
                Creá la primera
              </Link>
              .
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Número</th>
                    <th className="py-2 pr-3 font-medium">Producto</th>
                    <th className="py-2 pr-3 font-medium">Cantidad</th>
                    <th className="py-2 pr-3 font-medium">Estado</th>
                    <th className="py-2 pr-3 font-medium">Creada</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => {
                    const article = lookup[order.outputArticleVariantId];
                    return (
                      <tr key={order.id} className="border-b last:border-0 hover:bg-muted/40">
                        <td className="py-2 pr-3">
                          <Link href={`/production/orders/${order.id}`} className="font-medium text-primary">
                            {order.number}
                          </Link>
                        </td>
                        <td className="py-2 pr-3">
                          {article ? `${article.articleName}${article.variantLabel ? ` (${article.variantLabel})` : ''}` : order.outputArticleVariantId}
                        </td>
                        <td className="py-2 pr-3 tabular-nums">{Number(order.quantity)}</td>
                        <td className="py-2 pr-3">
                          <div className="flex items-center gap-1.5">
                            <Badge className={PRODUCTION_STATUS_COLORS[order.status]}>
                              {PRODUCTION_STATUS_LABELS[order.status]}
                            </Badge>
                            {order.status === 'PLANNED' && order.isShortOnMaterials && (
                              <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300">
                                Esperando insumos
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="py-2 pr-3 text-muted-foreground">
                          {new Date(order.createdAt).toLocaleDateString('es-AR')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
