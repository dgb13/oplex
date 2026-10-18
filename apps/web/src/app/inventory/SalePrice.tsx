/** Precio de venta de una variante en Inventario. Un insumo (lo marca el
 * usuario, ver Article.isSupply) no se vende y no muestra precio; un
 * artículo a la venta en $0 avisa que le falta, en vez de "$0.00". */
export default function SalePrice({ unitPrice, isSupply }: { unitPrice: number; isSupply: boolean }) {
  if (isSupply) {
    return (
      <span
        title="No se vende: se usa para fabricar"
        className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
      >
        Insumo
      </span>
    );
  }
  if (unitPrice > 0) return <>${unitPrice.toFixed(2)}</>;
  return (
    <span
      title="Está a la venta pero no tiene precio cargado"
      className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300"
    >
      Sin precio
    </span>
  );
}
