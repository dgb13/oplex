import { BadRequestException } from '@nestjs/common';

/** Un campo de la ficha (CustomerAssetType.fields). */
export interface AssetFieldDef {
  key: string;
  label: string;
  type: AssetFieldType;
  required?: boolean;
  /** El dato por el que se busca (patente, n° de serie). Exactamente uno. */
  isIdentifier?: boolean;
  /** Para SELECT. */
  options?: string[];
  /** Campo que el negocio sacó: no se pide más, pero lo cargado se conserva. */
  hidden?: boolean;
}

export const ASSET_FIELD_TYPES = ['TEXT', 'NUMBER', 'DATE', 'SELECT', 'BOOLEAN'] as const;
export type AssetFieldType = (typeof ASSET_FIELD_TYPES)[number];

export type AssetValues = Record<string, string | number | boolean>;

const MAX_TEXT = 200;

/** "AA 000-ZZ" / "aa000zz" -> "AA000ZZ": para buscar y avisar repetidos sin
 * importar cómo se tipeó. */
export function identifierKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

export function readFields(raw: unknown): AssetFieldDef[] {
  return Array.isArray(raw) ? (raw as AssetFieldDef[]) : [];
}

export function identifierField(fields: AssetFieldDef[]): AssetFieldDef {
  const field = fields.find((f) => f.isIdentifier);
  if (!field) throw new BadRequestException('La ficha no tiene un dato principal para buscar');
  return field;
}

/** "Vehículo" -> "Vehículos", "Reloj" -> "Relojes". Sólo la última palabra
 * de un nombre de una palabra; los compuestos se dejan para que el negocio
 * los corrija (Configuración de la ficha). */
export function pluralize(name: string): string {
  const known: Record<string, string> = {
    'Obra / domicilio': 'Obras / domicilios',
    'Vehículo abonado': 'Vehículos abonados',
  };
  if (known[name]) return known[name];
  if (/\s/.test(name.trim())) return name;
  if (/[aeiouáéíóú]$/i.test(name)) return `${name}s`;
  if (/z$/i.test(name)) return `${name.slice(0, -1)}ces`;
  return `${name}es`;
}

export function slugKey(label: string): string {
  const base = label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .map((w, i) => (i === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join('');
  return base || 'campo';
}

/**
 * Valida la lista de campos que manda Configuración. Reglas:
 * - exactamente un dato principal, y no cambia de campo (el historial se
 *   busca por él);
 * - un campo que ya existía no se borra: si no viene, se conserva oculto;
 * - los nuevos reciben una clave a partir de su nombre.
 */
export function mergeFieldDefs(previous: AssetFieldDef[], incoming: AssetFieldDef[]): AssetFieldDef[] {
  const prevByKey = new Map(previous.map((f) => [f.key, f]));
  const usedKeys = new Set(previous.map((f) => f.key));
  const result: AssetFieldDef[] = [];

  for (const raw of incoming) {
    const label = (raw.label ?? '').trim();
    if (!label) throw new BadRequestException('Todos los campos necesitan un nombre');
    if (label.length > 60) throw new BadRequestException(`El nombre "${label.slice(0, 20)}…" es demasiado largo`);
    if (!ASSET_FIELD_TYPES.includes(raw.type)) throw new BadRequestException(`Tipo de campo inválido: ${raw.type}`);
    const options =
      raw.type === 'SELECT'
        ? [...new Set((raw.options ?? []).map((o) => String(o).trim()).filter(Boolean))].slice(0, 50)
        : undefined;
    if (raw.type === 'SELECT' && (!options || options.length === 0)) {
      throw new BadRequestException(`El campo "${label}" es una lista: cargá al menos una opción`);
    }

    let key = raw.key && prevByKey.has(raw.key) ? raw.key : '';
    if (!key) {
      const base = slugKey(label);
      key = base;
      for (let n = 2; usedKeys.has(key); n++) key = `${base}${n}`;
      usedKeys.add(key);
    }
    const prev = prevByKey.get(key);
    // El dato principal queda donde estaba: no se puede mover ni ocultar.
    const isIdentifier = prev ? Boolean(prev.isIdentifier) : false;
    if (prev && prev.type !== raw.type && !isIdentifier) {
      // Cambiar el tipo de un campo con datos los dejaría inválidos.
      throw new BadRequestException(`No se puede cambiar el tipo del campo "${label}": creá uno nuevo`);
    }
    result.push({
      key,
      label,
      type: prev?.isIdentifier ? prev.type : raw.type,
      ...(raw.required || isIdentifier ? { required: true } : {}),
      ...(isIdentifier ? { isIdentifier: true } : {}),
      ...(options ? { options } : {}),
      ...(raw.hidden && !isIdentifier ? { hidden: true } : {}),
    });
  }

  // Los que no vinieron se conservan ocultos (pueden tener datos cargados).
  for (const prev of previous) {
    if (!result.some((f) => f.key === prev.key)) {
      if (prev.isIdentifier) throw new BadRequestException(`No se puede quitar "${prev.label}": es el dato principal`);
      result.push({ ...prev, hidden: true });
    }
  }
  if (result.filter((f) => f.isIdentifier).length !== 1) {
    throw new BadRequestException('La ficha tiene que tener exactamente un dato principal');
  }
  return result;
}

/**
 * Limpia los valores de una ficha contra sus campos. Los campos ocultos
 * conservan lo que ya tenían; las claves desconocidas se descartan.
 */
export function cleanValues(fields: AssetFieldDef[], incoming: Record<string, unknown>, previous: AssetValues = {}): AssetValues {
  const result: AssetValues = {};
  for (const field of fields) {
    if (field.hidden) {
      if (previous[field.key] !== undefined) result[field.key] = previous[field.key];
      continue;
    }
    const raw = incoming[field.key];
    const empty = raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '');
    if (empty) {
      if (field.required) throw new BadRequestException(`Falta "${field.label}"`);
      continue;
    }
    switch (field.type) {
      case 'TEXT': {
        const text = String(raw).trim();
        if (text.length > MAX_TEXT) throw new BadRequestException(`"${field.label}" es demasiado largo`);
        result[field.key] = text;
        break;
      }
      case 'NUMBER': {
        const n = typeof raw === 'number' ? raw : Number(String(raw).replace(/\./g, '').replace(',', '.'));
        if (!Number.isFinite(n)) throw new BadRequestException(`"${field.label}" tiene que ser un número`);
        result[field.key] = n;
        break;
      }
      case 'DATE': {
        const text = String(raw).slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(text))) {
          throw new BadRequestException(`"${field.label}" tiene que ser una fecha`);
        }
        result[field.key] = text;
        break;
      }
      case 'SELECT': {
        const text = String(raw).trim();
        if (!(field.options ?? []).includes(text)) {
          throw new BadRequestException(`"${text}" no es una opción de "${field.label}"`);
        }
        result[field.key] = text;
        break;
      }
      case 'BOOLEAN':
        result[field.key] = raw === true || raw === 'true';
        break;
    }
  }
  return result;
}
