/** Reglas puras del importador de artículos (sin base de datos): qué campos
 * de Oplex existen, cómo se reconoce cada columna del archivo del cliente por
 * su encabezado, y cómo se interpretan números, IVA y unidades tal como los
 * exportan los sistemas argentinos ("1.234,50", "21", "EX", "UN"). */

export const IMPORT_FIELDS = [
  'sku',
  'name',
  'price',
  'cost',
  'category',
  'brand',
  'tax',
  'stock',
  'supplier',
  'unit',
  'description',
  'color',
  'size',
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];
export type ImportFieldOrSkip = ImportField | 'skip';

export const REQUIRED_FIELDS: ImportField[] = ['sku', 'name', 'price'];

export const FIELD_LABELS: Record<ImportField, string> = {
  sku: 'Código (SKU)',
  name: 'Nombre',
  price: 'Precio de venta',
  cost: 'Costo',
  category: 'Categoría',
  brand: 'Marca',
  tax: 'IVA',
  stock: 'Stock inicial',
  supplier: 'Proveedor',
  unit: 'Unidad de medida',
  description: 'Descripción larga',
  color: 'Color',
  size: 'Talle',
};

/** Encabezados habituales de cada campo, ya normalizados (sin acentos, en
 * minúscula, sin puntos ni símbolos). Primero los más específicos. */
const SYNONYMS: Record<ImportField, string[]> = {
  sku: ['sku', 'codigo', 'cod', 'cod articulo', 'codigo articulo', 'cod producto', 'codigo producto', 'codigo interno', 'cod interno', 'id articulo', 'item', 'referencia', 'ref', 'articulo'],
  name: ['nombre', 'descripcion', 'desc', 'detalle', 'producto', 'nombre articulo', 'nombre producto', 'descripcion articulo', 'denominacion'],
  price: ['precio de venta', 'precio venta', 'p venta', 'pventa', 'pv', 'precio', 'precio lista', 'precio de lista', 'lista', 'precio final', 'precio publico', 'pvp', 'venta'],
  cost: ['costo', 'precio costo', 'p costo', 'pcosto', 'costo unitario', 'precio de costo', 'precio compra', 'p compra', 'ultimo costo'],
  category: ['categoria', 'rubro', 'familia', 'grupo', 'linea', 'subrubro', 'seccion', 'departamento', 'tipo'],
  brand: ['marca', 'fabricante', 'brand'],
  tax: ['iva', 'alicuota', 'alicuota iva', 'tasa iva', 'iva %', 'iva porcentaje', 'impuesto', 'codigo de impuesto'],
  stock: ['stock', 'existencia', 'existencias', 'stock inicial', 'cantidad', 'cant', 'stock actual', 'disponible', 'saldo'],
  supplier: ['proveedor', 'proveedor habitual', 'proveedor principal', 'prov'],
  unit: ['unidad', 'unidad de medida', 'unid', 'um', 'u m', 'medida', 'uni'],
  description: ['descripcion larga', 'observaciones', 'obs', 'notas', 'detalle largo', 'caracteristicas'],
  color: ['color', 'colour'],
  size: ['talle', 'talla', 'tamano', 'size', 'medida talle'],
};

const COMBINING_DIACRITICS = new RegExp('[\\u0300-\\u036f]', 'g');

export function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(COMBINING_DIACRITICS, '')
    .toLowerCase()
    .replace(/[._:/\\$()#°ºª-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Sugiere el campo para cada encabezado sin repetir campos: si dos columnas
 * parecen "Código", gana la que coincide mejor (exacta antes que parcial). */
export function suggestMapping(headers: string[]): ImportFieldOrSkip[] {
  const scored: { index: number; field: ImportField; score: number }[] = [];
  headers.forEach((header, index) => {
    const h = normalizeHeader(header);
    if (!h) return;
    for (const field of IMPORT_FIELDS) {
      SYNONYMS[field].forEach((syn, rank) => {
        let score = 0;
        if (h === syn) score = 100 - rank;
        else if (h.startsWith(`${syn} `) || h.endsWith(` ${syn}`)) score = 50 - rank;
        if (score > 0) scored.push({ index, field, score });
      });
    }
  });
  scored.sort((a, b) => b.score - a.score);
  const result: ImportFieldOrSkip[] = headers.map(() => 'skip');
  const used = new Set<ImportField>();
  for (const { index, field } of scored) {
    if (result[index] !== 'skip' || used.has(field)) continue;
    result[index] = field;
    used.add(field);
  }
  return result;
}

/** Texto de una celda tal como la ve el usuario. */
export function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    const v = value as Record<string, unknown>;
    if ('result' in v) return cellText(v['result']);
    if ('text' in v) return String(v['text'] ?? '').trim();
    if ('richText' in v && Array.isArray(v['richText'])) {
      return (v['richText'] as { text: string }[]).map((r) => r.text).join('').trim();
    }
  }
  return String(value).trim();
}

/** Número en formato argentino o internacional: "1.234,50", "1234.5",
 * "$ 3.237,50", "21%". null si la celda está vacía o no es un número. */
export function parseNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value && typeof value === 'object' && 'result' in (value as Record<string, unknown>)) {
    return parseNumber((value as { result: unknown }).result);
  }
  let text = cellText(value).replace(/[$%\s]/g, '').replace(/^ARS/i, '');
  if (!text) return null;
  const lastComma = text.lastIndexOf(',');
  const lastDot = text.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    // El que aparece último es el separador decimal.
    text = lastComma > lastDot ? text.replace(/\./g, '').replace(',', '.') : text.replace(/,/g, '');
  } else if (lastComma > -1) {
    // Sólo coma: es el decimal ("1,5", "3237,50").
    text = text.replace(',', '.');
  } else if (lastDot > -1 && /^\d{1,3}(\.\d{3})+$/.test(text)) {
    // "1.234" o "12.345.678": puntos de miles.
    text = text.replace(/\./g, '');
  }
  const num = Number(text);
  return Number.isFinite(num) ? num : null;
}

export type UnitValue = 'UNIT' | 'KG' | 'LTR' | 'MM' | 'M2';

const UNIT_ALIASES: Record<string, UnitValue> = {
  '': 'UNIT', un: 'UNIT', u: 'UNIT', uni: 'UNIT', unid: 'UNIT', unidad: 'UNIT', unidades: 'UNIT', unit: 'UNIT', 'c u': 'UNIT', cu: 'UNIT', pza: 'UNIT', pieza: 'UNIT', ud: 'UNIT',
  kg: 'KG', kgs: 'KG', kilo: 'KG', kilos: 'KG', kilogramo: 'KG', kilogramos: 'KG',
  l: 'LTR', lt: 'LTR', lts: 'LTR', ltr: 'LTR', litro: 'LTR', litros: 'LTR',
  mm: 'MM', milimetro: 'MM', milimetros: 'MM',
  m2: 'M2', mt2: 'M2', 'metro cuadrado': 'M2', 'metros cuadrados': 'M2',
};

/** Clave de un valor de celda (IVA, unidad) para agruparlo y recordar lo que
 * eligió el usuario: sin acentos y en minúscula, pero sin tocar la
 * puntuación ("10.5" tiene que seguir siendo 10,5). */
export function valueKey(value: unknown): string {
  return String(value ?? '').normalize('NFD').replace(COMBINING_DIACRITICS, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Unidad de Oplex para un valor del archivo, o null si no se reconoce. */
export function guessUnit(raw: string): UnitValue | null {
  return UNIT_ALIASES[valueKey(raw).replace(/[./]/g, ' ').replace(/\s+/g, ' ').trim()] ?? null;
}

export interface TaxOption {
  id: string;
  name: string;
  calculationType: string;
  rate: number | null;
}

/** Impuesto de Oplex para un valor de IVA del archivo ("21", "10,5", "0.21",
 * "EX", "Exento", "IVA 21%"), o null si no se puede decidir solo. */
export function guessTax(raw: string, options: TaxOption[]): string | null {
  const text = valueKey(raw);
  if (!text) return null;
  if (/^(ex|exe|exento|exenta)$/.test(text)) return options.find((o) => o.calculationType === 'EXENTO')?.id ?? null;
  if (/^(ng|no gravado|nogravado)$/.test(text)) return options.find((o) => o.calculationType === 'NO_GRAVADO')?.id ?? null;
  let rate = parseNumber(text.replace(/^iva\s*/, ''));
  if (rate === null) return null;
  if (rate > 0 && rate < 1) rate = Math.round(rate * 10000) / 100; // 0.21 -> 21
  const match = options.filter((o) => o.calculationType === 'PERCENTAGE' && o.rate !== null && Math.abs(o.rate - rate!) < 0.001);
  return match.length === 1 ? match[0].id : null;
}
