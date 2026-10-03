export interface TicketLine {
  articleVariantId: string;
  articleName: string;
  variantLabel: string | null;
  sku: string;
  unitPrice: number;
  quantity: number;
  taxRate: number | null;
  taxKind: 'GRAVADO' | 'EXENTO' | 'NO_GRAVADO';
  /** Stock en el depósito de la caja al agregarlo - tope de quantity. */
  stock: number;
}

/** withoutVat: emisor Monotributo/Exento (Factura C) - sin IVA, el precio es
 * el final. Tiene que dar exactamente lo mismo que factura el backend:
 * PosService rechaza el cobro si el total pagado no coincide. */
export function computeTotals(lines: TicketLine[], withoutVat = false) {
  let subtotal = 0;
  let taxTotal = 0;
  for (const line of lines) {
    const net = line.unitPrice * line.quantity;
    const tax = !withoutVat && line.taxKind === 'GRAVADO' ? net * ((line.taxRate ?? 0) / 100) : 0;
    subtotal += net;
    taxTotal += tax;
  }
  return { subtotal, taxTotal, total: subtotal + taxTotal };
}
