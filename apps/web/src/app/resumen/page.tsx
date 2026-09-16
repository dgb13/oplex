'use client';

import { BentoCell, BentoCellHeader, BentoGrid } from '@/components/resumen/BentoCell';
import RankedBars from '@/components/resumen/RankedBars';
import RingStat from '@/components/resumen/RingStat';
import SegmentedNav, { type SegmentedNavItem } from '@/components/resumen/SegmentedNav';
import SeveritySpectrum from '@/components/resumen/SeveritySpectrum';
import TrendChart from '@/components/resumen/TrendChart';
import { receivablesApi } from '@/lib/receivables';
import { reportsApi } from '@/lib/reports';
import { productionApi } from '@/lib/production';
import { resumenApi } from '@/lib/resumen';
import { useCountUp } from '@/lib/useCountUp';
import { useQuery } from '@tanstack/react-query';
import {
  Boxes,
  Factory,
  LayoutGrid,
  ShoppingBag,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { useState } from 'react';

const NAV_ITEMS: SegmentedNavItem[] = [
  { key: 'resumen', label: 'Resumen', icon: <LayoutGrid className="h-3.5 w-3.5" /> },
  { key: 'ventas', label: 'Ventas', icon: <TrendingUp className="h-3.5 w-3.5" />, disabled: true, title: 'Próximamente' },
  { key: 'compras', label: 'Compras', icon: <ShoppingBag className="h-3.5 w-3.5" />, disabled: true, title: 'Próximamente' },
  { key: 'inventario', label: 'Inventario', icon: <Boxes className="h-3.5 w-3.5" />, disabled: true, title: 'Requiere una tabla de valuación histórica de stock' },
  { key: 'produccion', label: 'Producción', icon: <Factory className="h-3.5 w-3.5" />, disabled: true, title: 'Próximamente' },
];

function fmtMoney(n: number): string {
  return `$ ${Math.round(n).toLocaleString('es-AR')}`;
}

function fmtCompact(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n.toFixed(0)}`;
}

export default function ResumenPage() {
  const [view, setView] = useState('resumen');

  const revenueQuery = useQuery({ queryKey: ['resumen-revenue-by-month'], queryFn: () => resumenApi.getRevenueByMonth({}) });
  const agingQuery = useQuery({ queryKey: ['resumen-aging'], queryFn: () => receivablesApi.getAgingReport() });
  const topProductsQuery = useQuery({
    queryKey: ['resumen-top-products'],
    queryFn: () => reportsApi.getSalesByProduct({}),
  });
  const stockValueQuery = useQuery({
    queryKey: ['resumen-stock-value-by-category'],
    queryFn: () => resumenApi.getStockValueByCategory(),
  });
  const suppliersQuery = useQuery({
    queryKey: ['resumen-purchases-by-supplier'],
    queryFn: () => resumenApi.getPurchasesBySupplier({}),
  });
  const productionQuery = useQuery({ queryKey: ['production-orders'], queryFn: productionApi.listOrders });

  const revenue = revenueQuery.data ?? [];
  const heroTotal = revenue.reduce((sum, m) => sum + Number(m.total), 0);
  const heroTotalShown = useCountUp(heroTotal, !revenueQuery.isLoading);

  const aging = agingQuery.data ?? [];
  const totalOutstanding = aging.reduce((sum, c) => sum + Number(c.totalOutstanding), 0);
  const bucketSum = (key: 'current' | 'days1to30' | 'days31to60' | 'days61to90' | 'days90Plus') =>
    aging.reduce((sum, c) => sum + Number(c[key]), 0);
  const overdue = totalOutstanding - bucketSum('current');
  const overduePct = totalOutstanding > 0 ? Math.round((overdue / totalOutstanding) * 100) : 0;

  const spectrumBuckets =
    totalOutstanding > 0
      ? [
          { label: 'Corriente', pct: (bucketSum('current') / totalOutstanding) * 100, valueLabel: fmtMoney(bucketSum('current')), colorClassName: 'bg-chart-2' },
          { label: '1-30 días', pct: (bucketSum('days1to30') / totalOutstanding) * 100, valueLabel: fmtMoney(bucketSum('days1to30')), colorClassName: 'bg-chart-4' },
          { label: '31-60 días', pct: (bucketSum('days31to60') / totalOutstanding) * 100, valueLabel: fmtMoney(bucketSum('days31to60')), colorClassName: 'bg-chart-3' },
          { label: '61-90 días', pct: (bucketSum('days61to90') / totalOutstanding) * 100, valueLabel: fmtMoney(bucketSum('days61to90')), colorClassName: 'bg-orange-500' },
          { label: '+90 días', pct: (bucketSum('days90Plus') / totalOutstanding) * 100, valueLabel: fmtMoney(bucketSum('days90Plus')), colorClassName: 'bg-destructive' },
        ]
      : [];

  const topProducts = (topProductsQuery.data ?? [])
    .slice(0, 5)
    .map((p) => ({ id: p.articleVariantId, name: p.articleName, value: Number(p.revenue), valueLabel: fmtCompact(Number(p.revenue)) }));

  const stockByCategory = (stockValueQuery.data ?? [])
    .slice(0, 5)
    .map((c) => ({ id: c.categoryId ?? 'none', name: c.categoryName, value: Number(c.totalValue), valueLabel: fmtCompact(Number(c.totalValue)) }));

  const suppliers = (suppliersQuery.data ?? [])
    .slice(0, 5)
    .map((s) => ({ id: s.supplierId, name: s.supplierName, value: Number(s.totalPurchased), valueLabel: fmtCompact(Number(s.totalPurchased)) }));

  const orders = productionQuery.data ?? [];
  const relevantOrders = orders.filter((o) => o.status !== 'CANCELLED');
  const doneOrders = relevantOrders.filter((o) => o.status === 'DONE');
  const productionPct = relevantOrders.length > 0 ? Math.round((doneOrders.length / relevantOrders.length) * 100) : 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Resumen</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Un desglose por categoría de cómo le está yendo a tu negocio.
        </p>
      </div>

      <SegmentedNav items={NAV_ITEMS} active={view} onChange={setView} />

      <BentoGrid>
        <BentoCell variant="hero">
          <BentoCellHeader
            title="Facturación por mes"
            meta={
              <span className="flex items-center gap-3 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-sm bg-chart-1" />Facturado</span>
                <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-sm bg-chart-3" />IVA débito</span>
              </span>
            }
          />
          <p className="mt-1 font-mono text-3xl font-extrabold tracking-tight tabular-nums">{fmtMoney(heroTotalShown)}</p>
          <p className="mb-2 text-xs text-muted-foreground">Total de los últimos {revenue.length || 6} meses</p>
          <div className="mt-auto">
            <TrendChart data={revenue.map((m) => ({ month: m.month, total: Number(m.total), taxTotal: Number(m.taxTotal) }))} />
          </div>
        </BentoCell>

        <BentoCell variant="tall" className={overduePct > 0 ? 'bg-destructive/5' : ''}>
          <BentoCellHeader
            title="Cartera vencida"
            meta={<Wallet className="h-4 w-4 text-destructive" />}
          />
          <p className="font-mono text-xl font-extrabold tabular-nums text-destructive">{fmtMoney(overdue)}</p>
          <p className="mb-4 text-xs text-muted-foreground">{aging.length} clientes con saldo</p>
          <div className="mt-auto flex items-center gap-3">
            <RingStat pct={overduePct} colorClassName="text-destructive" />
            <div className="text-xs text-muted-foreground">
              <b className="text-foreground">{overduePct}%</b> del total
              <br />
              por cobrar
            </div>
          </div>
        </BentoCell>

        <BentoCell>
          <BentoCellHeader title="Producción" meta={<Factory className="h-4 w-4 text-chart-5" />} />
          <div className="mt-auto flex items-center gap-3">
            <RingStat pct={productionPct} colorClassName="text-chart-2" />
            <div className="text-xs">
              <div className="font-mono text-sm font-bold">
                {doneOrders.length} / {relevantOrders.length}
              </div>
              <div className="text-muted-foreground">completadas</div>
            </div>
          </div>
        </BentoCell>

        <BentoCell variant="wide">
          <BentoCellHeader title="Antigüedad de cartera (AR)" meta={<span className="text-[11px] text-muted-foreground">Total: {fmtMoney(totalOutstanding)}</span>} />
          {spectrumBuckets.length > 0 ? (
            <SeveritySpectrum buckets={spectrumBuckets} />
          ) : (
            <p className="text-sm text-muted-foreground">Sin cuentas por cobrar pendientes.</p>
          )}
        </BentoCell>

        <BentoCell>
          <BentoCellHeader title="Top productos" />
          <RankedBars items={topProducts} />
        </BentoCell>

        <BentoCell>
          <BentoCellHeader title="Inventario por categoría" />
          <RankedBars items={stockByCategory} />
        </BentoCell>

        <BentoCell>
          <BentoCellHeader title="Proveedores" meta={<span className="text-[11px] text-muted-foreground">Por monto comprado</span>} />
          <RankedBars items={suppliers} />
        </BentoCell>
      </BentoGrid>
    </div>
  );
}
