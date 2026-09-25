'use client';

import { cartApi, CART_QUERY_KEY } from '@/lib/inventoryCart';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, ShoppingCart } from 'lucide-react';
import { useState } from 'react';

/** Versión "de un click" del botón Agregar de ArticleCatalogGrid, para la
 * vista tabla: siempre suma 1 unidad (sin input de cantidad - la cantidad
 * se ajusta después en el carrito). Componente propio para que cada fila
 * tenga su propio estado de "agregado ✓". */
export default function AddToCartIconButton({
  variantId,
}: {
  variantId: string;
}) {
  const queryClient = useQueryClient();
  const [justAdded, setJustAdded] = useState(false);

  const addItem = useMutation({
    mutationFn: () =>
      cartApi.addItem({ articleVariantId: variantId, quantity: 1 }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CART_QUERY_KEY });
      setJustAdded(true);
      setTimeout(() => setJustAdded(false), 1500);
    },
  });

  return (
    <button
      type="button"
      onClick={() => addItem.mutate()}
      disabled={addItem.isPending}
      title={
        addItem.isError
          ? 'No se pudo agregar al carrito'
          : 'Agregar al carrito (1 unidad)'
      }
      className={
        justAdded
          ? 'text-green-600 dark:text-green-400'
          : addItem.isError
            ? 'text-destructive hover:text-primary'
            : 'text-muted-foreground hover:text-primary disabled:opacity-50'
      }
    >
      {justAdded ? (
        <Check className="h-3.5 w-3.5" />
      ) : (
        <ShoppingCart className="h-3.5 w-3.5" />
      )}
    </button>
  );
}
