export interface TicketLine {
  articleVariantId: string;
  articleName: string;
  variantLabel: string | null;
  sku: string;
  unitPrice: number;
  quantity: number;
  taxRate: number | null;
  taxKind: 'GRAVADO' | 'EXENTO' | 'NO_GRAVADO';
}

export function computeTotals(lines: TicketLine[]) {
  let subtotal = 0;
  let taxTotal = 0;
  for (const line of lines) {
    const net = line.unitPrice * line.quantity;
    const tax = line.taxKind === 'GRAVADO' ? net * ((line.taxRate ?? 0) / 100) : 0;
    subtotal += net;
    taxTotal += tax;
  }
  return { subtotal, taxTotal, total: subtotal + taxTotal };
}
