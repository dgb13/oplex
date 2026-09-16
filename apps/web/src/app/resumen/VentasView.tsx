'use client';

import { BentoCell, BentoCellHeader, BentoGrid } from '@/components/resumen/BentoCell';
import Leaderboard from '@/components/resumen/Leaderboard';
import RankedBars from '@/components/resumen/RankedBars';
import TrendChart from '@/components/resumen/TrendChart';
import { reportsApi } from '@/lib/reports';
import { resumenApi } from '@/lib/resumen';
import { fmtCompact, fmtMoney } from '@/lib/resumenFormat';
import { useCountUp } from '@/lib/useCountUp';
import { useQuery } from '@tanstack/react-query';

/** Desglose de "Ventas" (Fase 5 del plan) - tendencia mensual + vendedores
 * son nuevos (Fase 0 del backend); clientes y productos ya existían en
 * reportsApi, se reusan sin duplicar. */
export default function VentasView() {
  const revenueQuery = useQuery({ queryKey: ['resumen-revenue-by-month'], queryFn: () => resumenApi.getRevenueByMonth({}) });
  const sellersQuery = useQuery({ queryKey: ['resumen-sales-by-seller'], queryFn: () => resumenApi.getSalesBySeller({}) });
  const customersQuery = useQuery({ queryKey: ['resumen-sales-by-customer'], queryFn: () => reportsApi.getSalesByCustomer({}) });
  const topProductsQuery = useQuery({ queryKey: ['resumen-top-products'], queryFn: () => reportsApi.getSalesByProduct({}) });

  const revenue = revenueQuery.data ?? [];
  const heroTotal = revenue.reduce((sum, m) => sum + Number(m.total), 0);
  const heroTotalShown = useCountUp(heroTotal, !revenueQuery.isLoading);

  const sellers = (sellersQuery.data ?? []).map((s) => ({
    id: s.userId,
    name: s.userName,
    avatarUrl: s.avatarUrl,
    amount: Number(s.totalSales),
    amountLabel: fmtCompact(Number(s.totalSales)),
    sub: `${s.invoiceCount} facturas`,
  }));

  const customers = (customersQuery.data ?? [])
    .slice(0, 6)
    .map((c) => ({ id: c.customerId, name: c.customerName, value: Number(c.totalSales), valueLabel: fmtCompact(Number(c.totalSales)) }));

  const topProducts = (topProductsQuery.data ?? [])
    .slice(0, 6)
    .map((p) => ({ id: p.articleVariantId, name: p.articleName, value: Number(p.revenue), valueLabel: fmtCompact(Number(p.revenue)) }));

  return (
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

      <BentoCell variant="tall">
        <BentoCellHeader title="Vendedores" meta={<span className="text-[11px] text-muted-foreground">Por monto facturado</span>} />
        <Leaderboard people={sellers} />
      </BentoCell>

      <BentoCell>
        <BentoCellHeader title="Top clientes" />
        <RankedBars items={customers} />
      </BentoCell>

      <BentoCell>
        <BentoCellHeader title="Top productos" />
        <RankedBars items={topProducts} />
      </BentoCell>
    </BentoGrid>
  );
}
