import { BadRequestException } from '@nestjs/common';

// El punto de venta de ARCA es un número de hasta 5 dígitos y se imprime
// con 5 (00008-00000001). Se guarda como texto y se copia tal cual a cada
// comprobante: la numeración local y el @@unique de Invoice comparan ese
// texto, así que un mismo punto de venta tiene que quedar siempre escrito
// igual.
//
// - Valor nuevo: se guarda con 5 dígitos ("8" → "00008").
// - Si la sucursal ya tenía guardado el mismo número con otro formato
//   (p. ej. "0001" de antes de este cambio), se conserva el texto anterior:
//   reescribirlo como "00001" separaría las facturas ya emitidas de las
//   nuevas y desfasaría la numeración (los comprobantes emitidos no se
//   pueden modificar, ver invoice_fiscal_lock).
export function normalizePointOfSaleNumber(input: string, current?: string | null): string {
  const trimmed = input.trim();
  if (!/^\d{1,5}$/.test(trimmed) || Number.parseInt(trimmed, 10) === 0) {
    throw new BadRequestException('El punto de venta tiene que ser un número de 1 a 99999 (por ejemplo 8 o 00008).');
  }
  if (current && /^\d+$/.test(current) && Number.parseInt(current, 10) === Number.parseInt(trimmed, 10)) {
    return current;
  }
  return trimmed.padStart(5, '0');
}
