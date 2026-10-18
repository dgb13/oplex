/** Precio de venta de una variante en Inventario. En $0 no se muestra
 * "$0.00", que confunde: si el artículo no está en el catálogo es un
 * insumo (se usa para fabricar, no se vende); si está publicado o es un
 * servicio, le falta el precio. */
export default function SalePrice({
  unitPrice,
  isService,
  isPublished,
}: {
  unitPrice: number;
  isService: boolean;
  isPublished: boolean;
}) {
  if (unitPrice > 0) return <>${unitPrice.toFixed(2)}</>;
  if (!isService && !isPublished) {
    return (
      <span
        title="No se vende: se usa para fabricar"
        className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
      >
        Insumo
      </span>
    );
  }
  return (
    <span
      title="Está a la venta pero no tiene precio cargado"
      className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300"
    >
      Sin precio
    </span>
  );
}
