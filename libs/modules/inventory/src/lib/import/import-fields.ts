/** Reglas puras del importador de artículos (sin base de datos): qué campos
 * de Oplex existen, cómo se reconoce cada columna del archivo del cliente por
 * su encabezado, y cómo se interpretan números, IVA y unidades tal como los
 * exportan los sistemas argentinos ("1.234,50", "21", "EX", "UN"). */

import { parseNumber, suggestFields, valueKey } from '@plexo/spreadsheet-import';

export { cellText, normalizeHeader, parseNumber, valueKey } from '@plexo/spreadsheet-import';

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
  'imageUrl',
  'barLength',
  'sheetWidth',
  'sheetLength',
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
  imageUrl: 'Foto (link)',
  barLength: 'Largo comercial (barra)',
  sheetWidth: 'Ancho de la plancha',
  sheetLength: 'Largo de la plancha',
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
  imageUrl: ['foto', 'imagen', 'url imagen', 'url foto', 'link foto', 'link imagen', 'foto url', 'imagen url', 'image', 'picture', 'url'],
  barLength: ['largo de la barra', 'largo barra', 'largo comercial', 'largo', 'longitud', 'largo m', 'largo mm', 'medida comercial'],
  sheetWidth: ['ancho de la plancha', 'ancho plancha', 'ancho chapa', 'ancho'],
  sheetLength: ['largo de la plancha', 'largo plancha', 'largo chapa', 'alto plancha', 'alto'],
};

/** Sugiere el campo para cada encabezado sin repetir campos. */
export function suggestMapping(headers: string[]): ImportFieldOrSkip[] {
  return suggestFields(headers, IMPORT_FIELDS, SYNONYMS);
}

export type UnitValue = 'UNIT' | 'KG' | 'LTR' | 'MM' | 'M2';

const UNIT_ALIASES: Record<string, UnitValue> = {
  '': 'UNIT', un: 'UNIT', u: 'UNIT', uni: 'UNIT', unid: 'UNIT', unidad: 'UNIT', unidades: 'UNIT', unit: 'UNIT', 'c u': 'UNIT', cu: 'UNIT', pza: 'UNIT', pieza: 'UNIT', ud: 'UNIT',
  kg: 'KG', kgs: 'KG', kilo: 'KG', kilos: 'KG', kilogramo: 'KG', kilogramos: 'KG',
  l: 'LTR', lt: 'LTR', lts: 'LTR', ltr: 'LTR', litro: 'LTR', litros: 'LTR',
  mm: 'MM', milimetro: 'MM', milimetros: 'MM',
  m2: 'M2', mt2: 'M2', 'metro cuadrado': 'M2', 'metros cuadrados': 'M2',
};

/** Unidad de Oplex para un valor del archivo, o null si no se reconoce. */
export function guessUnit(raw: string): UnitValue | null {
  return UNIT_ALIASES[valueKey(raw).replace(/[./]/g, ' ').replace(/\s+/g, ' ').trim()] ?? null;
}

export type LengthUnit = 'm' | 'cm' | 'mm';

/** Milímetros, que es como Oplex guarda largos y anchos. */
export function toMillimeters(value: number, unit: LengthUnit): number {
  return Math.round(value * (unit === 'm' ? 1000 : unit === 'cm' ? 10 : 1));
}

/** Unidad probable de una columna de largos: "6" o "3,2" son metros,
 * "600" son centímetros y "6000" milímetros. El usuario la confirma. */
export function guessLengthUnit(values: number[]): LengthUnit {
  const positive = values.filter((v) => v > 0).sort((a, b) => a - b);
  if (positive.length === 0) return 'm';
  const median = positive[Math.floor(positive.length / 2)];
  if (median <= 30) return 'm';
  if (median <= 1000) return 'cm';
  return 'mm';
}

/** Links compartidos de Drive y Dropbox apuntan a una página, no a la
 * imagen: se pasan al link de descarga directa. */
export function directImageUrl(raw: string): string {
  const url = raw.trim();
  const drive = /drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?.*id=)([\w-]+)/.exec(url);
  if (drive) return `https://drive.google.com/uc?export=download&id=${drive[1]}`;
  if (/^https?:\/\/(www\.)?dropbox\.com\//.test(url)) {
    try {
      const parsed = new URL(url);
      parsed.searchParams.set('dl', '1');
      return parsed.toString();
    } catch {
      return url;
    }
  }
  return url;
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
