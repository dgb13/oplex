'use client';

import { BentoCell, BentoCellHeader, BentoGrid } from '@/components/resumen/BentoCell';
import Leaderboard from '@/components/resumen/Leaderboard';
import RankedBars from '@/components/resumen/RankedBars';
import RingStat from '@/components/resumen/RingStat';
import { resumenApi } from '@/lib/resumen';
import { fmtCompact, fmtMoney } from '@/lib/resumenFormat';
import { useCountUp } from '@/lib/useCountUp';
import { useQuery } from '@tanstack/react-query';
import { ShoppingBag } from 'lucide-react';

/** Desglose de "Compras" (Fase 6 del plan) - proveedores y compradores,
 * ambos de la Fase 1 del backend (libs/modules/reports-purchases). Sin
 * tendencia mensual: el endpoint de compras por mes no está en alcance de
 * esta primera entrega (ver plan). */
export default function ComprasView() {
  const suppliersQuery = useQuery({ queryKey: ['resumen-purchases-by-supplier'], queryFn: () => resumenApi.getPurchasesBySupplier({}) });
  const buyersQuery = useQuery({ queryKey: ['resumen-purchases-by-buyer'], queryFn: () => resumenApi.getPurchasesByBuyer({}) });

  const supplierRows = suppliersQuery.data ?? [];
  const totalPurchased = supplierRows.reduce((sum, s) => sum + Number(s.totalPurchased), 0);
  const totalOrders = supplierRows.reduce((sum, s) => sum + s.orderCount, 0);
  const totalShown = useCountUp(totalPurchased, !suppliersQuery.isLoading);

  const topSupplierShare =
    totalPurchased > 0 && supplierRows.length > 0
      ? Math.round((Number(supplierRows[0].totalPurchased) / totalPurchased) * 100)
      : 0;

  const buyers = (buyersQuery.data ?? []).map((b) => ({
    id: b.userId,
    name: b.userName,
    avatarUrl: b.avatarUrl,
    amount: Number(b.totalPurchased),
    amountLabel: fmtCompact(Number(b.totalPurchased)),
    sub: `${b.orderCount} órdenes`,
  }));

  const suppliers = supplierRows
    .slice(0, 6)
    .map((s) => ({ id: s.supplierId, name: s.supplierName, value: Number(s.totalPurchased), valueLabel: fmtCompact(Number(s.totalPurchased)) }));

  return (
    <BentoGrid>
      <BentoCell variant="tall">
        <BentoCellHeader title="Total comprado" meta={<ShoppingBag className="h-4 w-4 text-chart-5" />} />
        <p className="mt-1 font-mono text-3xl font-extrabold tracking-tight tabular-nums">{fmtMoney(totalShown)}</p>
        <p className="mb-2 text-xs text-muted-foreground">{totalOrders} órdenes de compra</p>
        {supplierRows.length > 0 && (
          <div className="mt-auto flex items-center gap-3">
            <RingStat pct={topSupplierShare} colorClassName="text-chart-5" />
            <div className="text-xs text-muted-foreground">
              <b className="text-foreground">{supplierRows[0].supplierName}</b>
              <br />
              concentra el {topSupplierShare}%
            </div>
          </div>
        )}
      </BentoCell>

      <BentoCell variant="hero">
        <BentoCellHeader title="Compradores" meta={<span className="text-[11px] text-muted-foreground">Por monto comprado</span>} />
        <Leaderboard people={buyers} />
      </BentoCell>

      <BentoCell variant="wide">
        <BentoCellHeader title="Proveedores" meta={<span className="text-[11px] text-muted-foreground">Por monto comprado</span>} />
        <RankedBars items={suppliers} />
      </BentoCell>
    </BentoGrid>
  );
}
