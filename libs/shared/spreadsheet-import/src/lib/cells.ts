/** Celdas tal como las exportan los sistemas argentinos ("1.234,50",
 * "21%", fórmulas de Excel) y cómo se reconocen los encabezados. */

export type Cell = string | number | Date | null;

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
 * parecen el mismo campo, gana la que coincide mejor (exacta antes que
 * parcial). Los sinónimos van normalizados y primero los más específicos. */
export function suggestFields<F extends string>(
  headers: string[],
  fields: readonly F[],
  synonyms: Record<F, string[]>,
): (F | 'skip')[] {
  const scored: { index: number; field: F; score: number }[] = [];
  headers.forEach((header, index) => {
    const h = normalizeHeader(header);
    if (!h) return;
    for (const field of fields) {
      synonyms[field].forEach((syn, rank) => {
        let score = 0;
        if (h === syn) score = 100 - rank;
        else if (h.startsWith(`${syn} `) || h.endsWith(` ${syn}`)) score = 50 - rank;
        if (score > 0) scored.push({ index, field, score });
      });
    }
  });
  scored.sort((a, b) => b.score - a.score);
  const result: (F | 'skip')[] = headers.map(() => 'skip');
  const used = new Set<F>();
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

/** Clave de un valor de celda (IVA, unidad) para agruparlo y recordar lo que
 * eligió el usuario: sin acentos y en minúscula, pero sin tocar la
 * puntuación ("10.5" tiene que seguir siendo 10,5). */
export function valueKey(value: unknown): string {
  return String(value ?? '').normalize('NFD').replace(COMBINING_DIACRITICS, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function isBlank(row: Cell[]): boolean {
  return row.every((c) => cellText(c) === '');
}
