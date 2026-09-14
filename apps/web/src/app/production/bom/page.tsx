'use client';

import ArticlePicker from '@/components/ArticlePicker';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { buildArticleVariantLookup, inventoryApi } from '@/lib/inventory';
import { productionApi, type CreateBomLineInput } from '@/lib/production';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ProductionPlanGateBanner, useProductionGate } from '../ProductionPlanGate';

interface LineDraft {
  inputArticleVariantId: string;
  quantity: string;
  length: string;
  width: string;
  cutsCount: string;
  expectedWastePercent: string;
}

function emptyLine(): LineDraft {
  return { inputArticleVariantId: '', quantity: '', length: '', width: '', cutsCount: '', expectedWastePercent: '' };
}

export default function BomPage() {
  const gate = useProductionGate();
  const queryClient = useQueryClient();
  const [outputArticleVariantId, setOutputArticleVariantId] = useState('');
  const [name, setName] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const [error, setError] = useState('');

  const articlesQuery = useQuery({
    queryKey: ['inventory-articles'],
    queryFn: () => inventoryApi.listArticles(),
    enabled: gate.enabled,
  });
  const lookup = useMemo(() => buildArticleVariantLookup(articlesQuery.data ?? []), [articlesQuery.data]);

  const bomQuery = useQuery({
    queryKey: ['production-bom', outputArticleVariantId],
    queryFn: () => productionApi.getBom(outputArticleVariantId),
    enabled: gate.enabled && !!outputArticleVariantId,
    retry: false,
  });

  // Al elegir un producto con receta activa, se precarga como punto de
  // partida para la nueva versión (BomService.create SIEMPRE crea una
  // versión nueva, nunca pisa la existente - ver el service). Un producto
  // sin receta arranca con una sola línea vacía.
  useEffect(() => {
    if (bomQuery.data) {
      setName(bomQuery.data.name);
      setLines(
        bomQuery.data.lines.map((l) => ({
          inputArticleVariantId: l.inputArticleVariantId,
          quantity: l.quantity,
          length: l.length ?? '',
          width: l.width ?? '',
          cutsCount: l.cutsCount != null ? String(l.cutsCount) : '',
          expectedWastePercent: l.expectedWastePercent !== '0' ? l.expectedWastePercent : '',
        })),
      );
    } else if (bomQuery.isError) {
      setName('');
      setLines([emptyLine()]);
    }
  }, [bomQuery.data, bomQuery.isError]);

  const mutation = useMutation({
    mutationFn: () => {
      const parsedLines: CreateBomLineInput[] = lines
        .filter((l) => l.inputArticleVariantId && l.quantity)
        .map((l) => ({
          inputArticleVariantId: l.inputArticleVariantId,
          quantity: Number(l.quantity),
          length: l.length ? Number(l.length) : undefined,
          width: l.width ? Number(l.width) : undefined,
          cutsCount: l.cutsCount ? Number(l.cutsCount) : undefined,
          expectedWastePercent: l.expectedWastePercent ? Number(l.expectedWastePercent) : undefined,
        }));
      return productionApi.createBom({ outputArticleVariantId, name: name.trim(), lines: parsedLines });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['production-bom', outputArticleVariantId] });
      setError('');
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo guardar la receta';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!name.trim()) {
      setError('Ingresá un nombre para la receta');
      return;
    }
    const validLines = lines.filter((l) => l.inputArticleVariantId && l.quantity);
    if (validLines.length === 0) {
      setError('Agregá al menos un insumo con cantidad');
      return;
    }
    mutation.mutate();
  }

  function updateLine(index: number, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  if (gate.isLoading) {
    return null;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Recetas de producción</h1>

      {!gate.enabled ? (
        <ProductionPlanGateBanner planName={gate.planName} />
      ) : (
        <>
          <Card className="max-w-md">
            <CardContent>
              <label className="text-sm text-muted-foreground">Producto</label>
              <ArticlePicker
                value={outputArticleVariantId}
                onChange={(id) => setOutputArticleVariantId(id)}
                placeholder="Buscar producto..."
                className="mt-1"
              />
            </CardContent>
          </Card>

          {outputArticleVariantId && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {bomQuery.data ? `Receta activa - versión ${bomQuery.data.version}` : 'Nueva receta'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-sm text-muted-foreground">Nombre de la receta</label>
                    <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="p. ej. Tablero eléctrico armado" />
                  </div>

                  <div className="flex flex-col gap-2">
                    <p className="text-sm text-muted-foreground">
                      Insumos (largo/ancho/cortes sólo hacen falta para artículos por metro o por pieza)
                    </p>
                    {lines.map((line, i) => {
                      const article = lookup[line.inputArticleVariantId];
                      return (
                        <div key={i} className="flex flex-wrap items-end gap-2 rounded-lg border p-2">
                          <ArticlePicker
                            value={line.inputArticleVariantId}
                            onChange={(id) => updateLine(i, { inputArticleVariantId: id })}
                            placeholder="Insumo..."
                            className="min-w-[220px] flex-1"
                          />
                          <div className="flex flex-col gap-0.5">
                            <label className="text-[10px] text-muted-foreground">Cantidad</label>
                            <Input
                              type="number"
                              className="w-20"
                              value={line.quantity}
                              onChange={(e) => updateLine(i, { quantity: e.target.value })}
                            />
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <label className="text-[10px] text-muted-foreground">Largo (mm)</label>
                            <Input
                              type="number"
                              className="w-20"
                              value={line.length}
                              onChange={(e) => updateLine(i, { length: e.target.value })}
                            />
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <label className="text-[10px] text-muted-foreground">Ancho (mm)</label>
                            <Input
                              type="number"
                              className="w-20"
                              value={line.width}
                              onChange={(e) => updateLine(i, { width: e.target.value })}
                            />
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <label className="text-[10px] text-muted-foreground">Cortes</label>
                            <Input
                              type="number"
                              className="w-16"
                              value={line.cutsCount}
                              onChange={(e) => updateLine(i, { cutsCount: e.target.value })}
                            />
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <label className="text-[10px] text-muted-foreground">Merma %</label>
                            <Input
                              type="number"
                              className="w-16"
                              value={line.expectedWastePercent}
                              onChange={(e) => updateLine(i, { expectedWastePercent: e.target.value })}
                            />
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Quitar insumo"
                            onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                          {article && line.inputArticleVariantId && (
                            <p className="w-full text-[11px] text-muted-foreground">SKU {article.sku}</p>
                          )}
                        </div>
                      );
                    })}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setLines((prev) => [...prev, emptyLine()])}
                    >
                      <Plus className="h-3.5 w-3.5" /> Agregar insumo
                    </Button>
                  </div>

                  {error && <p className="text-sm text-destructive">{error}</p>}

                  <div className="flex justify-end">
                    <Button type="submit" disabled={mutation.isPending}>
                      {mutation.isPending
                        ? 'Guardando...'
                        : bomQuery.data
                          ? 'Guardar como nueva versión'
                          : 'Crear receta'}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
