'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { resolveUploadUrl } from '@/lib/inventory';
import { cartApi, CART_QUERY_KEY } from '@/lib/inventoryCart';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Info, ShoppingBasket } from 'lucide-react';
import { useState } from 'react';

export interface CatalogCardRow {
  articleId: string;
  articleName: string;
  categoryName: string | null;
  imageUrl: string | null;
  variantId: string;
  sku: string;
  variantLabel: string | null;
  unitPrice: number;
  totalStock: number;
  active: boolean;
}

/** Ecommerce-style browsing grid over the same filtered/sorted rows the
 * table view already computes (InventoryPage owns search/category/service/
 * published filtering) - this is purely a different rendering of the same
 * data, so it stays a dumb presentational component, no query of its own.
 * `onDetails` opens the same "Detalles" modal (editar/desactivar) the
 * table view's ℹ️ icon opens - reported missing from this view by the
 * user (2026-09-19), added for parity. */
export default function ArticleCatalogGrid({
  rows,
  onDetails,
}: {
  rows: CatalogCardRow[];
  onDetails: (articleId: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-muted-foreground">
        Sin artículos que coincidan con la búsqueda
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {rows.map((row) => (
        <ArticleCard key={row.variantId} row={row} onDetails={onDetails} />
      ))}
    </div>
  );
}

function ArticleCard({ row, onDetails }: { row: CatalogCardRow; onDetails: (articleId: string) => void }) {
  const queryClient = useQueryClient();
  const [quantity, setQuantity] = useState(1);
  const [justAdded, setJustAdded] = useState(false);

  const addItem = useMutation({
    mutationFn: () => cartApi.addItem({ articleVariantId: row.variantId, quantity }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CART_QUERY_KEY });
      setJustAdded(true);
      setQuantity(1);
      setTimeout(() => setJustAdded(false), 1500);
    },
  });

  return (
    <Card className={`overflow-hidden py-0 ${!row.active ? 'opacity-50' : ''}`}>
      <div className="relative flex h-28 items-center justify-center bg-muted">
        {row.imageUrl ? (
          <img src={resolveUploadUrl(row.imageUrl) ?? undefined} alt="" className="h-full w-full object-cover" />
        ) : (
          <ShoppingBasket className="h-8 w-8 text-muted-foreground" />
        )}
        <button
          type="button"
          onClick={() => onDetails(row.articleId)}
          title="Detalles (editar, activar/desactivar, descripción, folleto, adjunto)"
          className="absolute right-1.5 top-1.5 rounded-full bg-background/80 p-1 text-muted-foreground shadow hover:text-primary"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <div className="flex flex-wrap items-center gap-1">
          {row.categoryName && <Badge variant="secondary" className="w-fit">{row.categoryName}</Badge>}
          {!row.active && (
            <Badge className="w-fit bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300">Inactivo</Badge>
          )}
        </div>
        <p className="text-sm font-medium leading-tight">{row.articleName}</p>
        {row.variantLabel && <p className="text-xs text-muted-foreground">{row.variantLabel}</p>}
        <p className="text-xs text-muted-foreground">{row.sku}</p>
        <div className="mt-auto flex items-center justify-between pt-2">
          <span className="text-sm font-semibold">${row.unitPrice.toFixed(2)}</span>
          <span className="text-xs text-muted-foreground">Stock: {row.totalStock}</span>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <Input
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
            className="w-14 text-center"
            aria-label="Cantidad"
          />
          <Button
            onClick={() => addItem.mutate()}
            disabled={addItem.isPending}
            className={`flex-1 ${justAdded ? 'bg-green-600 text-white hover:bg-green-600' : ''}`}
          >
            {justAdded ? 'Agregado ✓' : 'Agregar'}
          </Button>
        </div>
      </div>
    </Card>
  );
}
