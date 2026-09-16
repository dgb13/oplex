/** Formato compartido entre las categorías de "Resumen" (Resumen/Ventas/Compras). */
export function fmtMoney(n: number): string {
  return `$ ${Math.round(n).toLocaleString('es-AR')}`;
}

export function fmtCompact(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n.toFixed(0)}`;
}
