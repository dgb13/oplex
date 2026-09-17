'use client';

import ArticlePicker from '@/components/ArticlePicker';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import Select from '@/components/ui/Select';
import { inventoryApi } from '@/lib/inventory';
import { productionApi, type PieceStatus } from '@/lib/production';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { ProductionPlanGateBanner, useProductionGate } from '../ProductionPlanGate';

const PIECE_STATUS_LABELS: Record<PieceStatus, string> = {
  AVAILABLE: 'Disponible',
  DEPLETED: 'Agotada',
  SCRAP: 'Descarte',
};

const PIECE_STATUS_COLORS: Record<PieceStatus, string> = {
  AVAILABLE: 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300',
  DEPLETED: 'bg-slate-200 dark:bg-slate-800 text-slate-500',
  SCRAP: 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-400',
};

export default function StockPiecesPage() {
  const gate = useProductionGate();
  const [articleVariantId, setArticleVariantId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');

  const warehousesQuery = useQuery({
    queryKey: ['inventory-warehouses'],
    queryFn: inventoryApi.listWarehouses,
    enabled: gate.enabled,
  });
  const piecesQuery = useQuery({
    queryKey: ['production-pieces', articleVariantId, warehouseId],
    queryFn: () => productionApi.listPieces(articleVariantId, warehouseId || undefined),
    enabled: gate.enabled && !!articleVariantId,
  });

  // Mismo criterio sourceType que ya usa la columna "Origen" de la tabla de
  // abajo ("Compra"/"Recorte") - acá sólo se cuenta, nada nuevo del back:
  // esta pantalla ya trae la lista completa de piezas de este insumo.
  const summary = useMemo(() => {
    const available = (piecesQuery.data ?? []).filter((p) => p.status === 'AVAILABLE');
    if (available.length === 0) return null;
    return {
      wholeCount: available.filter((p) => p.sourceType === 'FULL_STOCK').length,
      offcutCount: available.filter((p) => p.sourceType === 'OFFCUT').length,
      totalMm: available.reduce((sum, p) => sum + Number(p.currentLength), 0),
    };
  }, [piecesQuery.data]);

  if (gate.isLoading) {
    return null;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Piezas y recortes</h1>

      {!gate.enabled ? (
        <ProductionPlanGateBanner planName={gate.planName} />
      ) : (
        <>
          <Card>
            <CardContent className="flex flex-wrap gap-4">
              <div className="flex min-w-[240px] flex-1 flex-col gap-1">
                <label className="text-sm text-muted-foreground">Artículo (por metro/pieza)</label>
                <ArticlePicker value={articleVariantId} onChange={(id) => setArticleVariantId(id)} placeholder="Buscar artículo..." />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm text-muted-foreground">Depósito</label>
                <Select
                  value={warehouseId}
                  onChange={setWarehouseId}
                  options={[
                    { value: '', label: 'Todos los depósitos' },
                    ...(warehousesQuery.data ?? []).map((w) => ({ value: w.id, label: w.name })),
                  ]}
                />
              </div>
            </CardContent>
          </Card>

          {articleVariantId && summary && (
            <Card>
              <CardContent className="flex flex-wrap gap-3">
                <div className="flex items-center gap-2 rounded-lg border bg-muted/20 px-3 py-2 text-sm">
                  <span className="font-mono text-base font-bold text-primary">{summary.wholeCount}</span>
                  barra{summary.wholeCount === 1 ? '' : 's'} entera{summary.wholeCount === 1 ? '' : 's'}
                </div>
                <div className="flex items-center gap-2 rounded-lg border bg-muted/20 px-3 py-2 text-sm">
                  <span className="font-mono text-base font-bold text-primary">{summary.offcutCount}</span>
                  recorte{summary.offcutCount === 1 ? '' : 's'} reutilizable{summary.offcutCount === 1 ? '' : 's'}
                </div>
                <div className="flex items-center gap-2 rounded-lg border bg-muted/20 px-3 py-2 text-sm">
                  <span className="font-mono text-base font-bold text-primary">
                    {summary.totalMm.toLocaleString('es-AR')}mm
                  </span>
                  disponibles en total
                </div>
              </CardContent>
            </Card>
          )}

          {articleVariantId && (
            <Card>
              <CardContent>
                {!piecesQuery.data ? (
                  <p className="text-sm text-muted-foreground">Cargando...</p>
                ) : piecesQuery.data.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin piezas registradas para este artículo.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-xs text-muted-foreground">
                          <th className="py-2 pr-3 font-medium">Largo original</th>
                          <th className="py-2 pr-3 font-medium">Largo actual</th>
                          <th className="py-2 pr-3 font-medium">Estado</th>
                          <th className="py-2 pr-3 font-medium">Origen</th>
                          <th className="py-2 pr-3 font-medium">Creada</th>
                        </tr>
                      </thead>
                      <tbody>
                        {piecesQuery.data.map((piece) => {
                          const original = Number(piece.originalLength);
                          const current = Number(piece.currentLength);
                          const percent = original > 0 ? Math.min(100, (current / original) * 100) : 0;
                          return (
                            <tr key={piece.id} className="border-b last:border-0">
                              <td className="py-2 pr-3 tabular-nums">{original.toFixed(0)} mm</td>
                              <td className="py-2 pr-3">
                                <div className="flex items-center gap-2">
                                  <span className="tabular-nums">{current.toFixed(0)} mm</span>
                                  <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                                    <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
                                  </div>
                                </div>
                              </td>
                              <td className="py-2 pr-3">
                                <Badge className={PIECE_STATUS_COLORS[piece.status]}>
                                  {PIECE_STATUS_LABELS[piece.status]}
                                </Badge>
                              </td>
                              <td className="py-2 pr-3 text-muted-foreground">
                                {piece.sourceType === 'FULL_STOCK' ? 'Compra' : 'Recorte'}
                              </td>
                              <td className="py-2 pr-3 text-muted-foreground">
                                {new Date(piece.createdAt).toLocaleDateString('es-AR')}
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
          )}
        </>
      )}
    </div>
  );
}
