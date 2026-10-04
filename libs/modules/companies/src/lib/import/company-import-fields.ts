/** Reglas puras del importador de empresas (proveedores y clientes): qué
 * campos existen, cómo se reconoce cada columna por su encabezado y cómo se
 * interpretan la condición de IVA, el CUIT y el rubro tal como los exportan
 * los sistemas argentinos ("RI", "Monot.", "30-71000001-0"). */

import type { CompanyIndustry } from '@plexo/database';
import { suggestFields, valueKey } from '@plexo/spreadsheet-import';
import { isValidCuit, normalizeCuit } from '../cuit.js';

export const COMPANY_IMPORT_FIELDS = [
  'name',
  'taxId',
  'taxCondition',
  'address',
  'phone',
  'email',
  'website',
  'grossIncome',
  'industry',
  'creditLimit',
  'contact',
  'contactJob',
  'contactEmail',
  'contactPhone',
] as const;
export type CompanyImportField = (typeof COMPANY_IMPORT_FIELDS)[number];
export type CompanyImportFieldOrSkip = CompanyImportField | 'skip';

export const COMPANY_FIELD_LABELS: Record<CompanyImportField, string> = {
  name: 'Razón social',
  taxId: 'CUIT',
  taxCondition: 'Condición de IVA',
  address: 'Domicilio fiscal',
  phone: 'Teléfono',
  email: 'Email',
  website: 'Web',
  grossIncome: 'Nº de Ingresos Brutos',
  industry: 'Rubro',
  creditLimit: 'Límite de crédito',
  contact: 'Contacto',
  contactJob: 'Cargo del contacto',
  contactEmail: 'Email del contacto',
  contactPhone: 'Celular del contacto',
};

/** Encabezados habituales de cada campo, normalizados (ver normalizeHeader).
 * Primero los más específicos. */
const SYNONYMS: Record<CompanyImportField, string[]> = {
  name: ['razon social', 'nombre', 'denominacion', 'empresa', 'proveedor', 'cliente', 'nombre o razon social', 'razon'],
  taxId: ['cuit', 'c u i t', 'nro cuit', 'numero de cuit', 'cuit cuil', 'cuit dni', 'cuil', 'dni', 'documento', 'nro documento', 'nro doc', 'doc'],
  taxCondition: [
    'condicion de iva',
    'condicion iva',
    'cond iva',
    'condicion frente al iva',
    'situacion iva',
    'situacion frente al iva',
    'categoria iva',
    'tipo iva',
    'responsabilidad iva',
    'condicion fiscal',
    'cond fiscal',
    'iva',
  ],
  address: ['domicilio fiscal', 'domicilio', 'direccion', 'dir', 'calle', 'domicilio comercial', 'localidad'],
  phone: ['telefono', 'tel', 'telefonos', 'tel fijo', 'telefono fijo'],
  email: ['email', 'e mail', 'mail', 'correo', 'correo electronico'],
  website: ['web', 'sitio web', 'pagina web', 'website', 'url'],
  grossIncome: ['ingresos brutos', 'iibb', 'nro iibb', 'n iibb', 'numero iibb', 'nro ingresos brutos', 'ib', 'nro ib'],
  industry: ['rubro', 'actividad', 'sector', 'ramo'],
  creditLimit: ['limite de credito', 'limite credito', 'credito', 'limite'],
  contact: ['contacto', 'nombre contacto', 'nombre del contacto', 'persona de contacto', 'contacto nombre', 'vendedor', 'atencion'],
  contactJob: ['cargo', 'cargo contacto', 'cargo del contacto', 'puesto'],
  contactEmail: ['email contacto', 'email del contacto', 'mail contacto', 'correo contacto', 'contacto email', 'contacto mail'],
  contactPhone: [
    'celular',
    'cel',
    'whatsapp',
    'wsp',
    'movil',
    'cel contacto',
    'celular contacto',
    'celular del contacto',
    'whatsapp contacto',
    'contacto celular',
    'telefono contacto',
  ],
};

export const COMPANY_REQUIRED_FIELDS: CompanyImportField[] = ['name'];

export function suggestCompanyMapping(headers: string[]): CompanyImportFieldOrSkip[] {
  return suggestFields(headers, COMPANY_IMPORT_FIELDS, SYNONYMS);
}

/** Condiciones de IVA tal como las guarda Oplex: el mismo texto que trae el
 * padrón de ARCA ("Responsable Inscripto", "Monotributo"...). La factura
 * las lee por texto (resolveCondicionIvaReceptor en @plexo/invoicing) para
 * decidir A o B y la condición del receptor, así que no se inventan otras. */
export const TAX_CONDITIONS = [
  'Responsable Inscripto',
  'Monotributo',
  'Exento',
  'Consumidor Final',
  'No categorizado',
  'Monotributista Social',
  'IVA No Alcanzado',
] as const;
/** Elección del usuario para un valor de condición de IVA: dejarla vacía. */
export const NO_CONDITION = '__none__';

/** Condición de IVA de Oplex para un valor del archivo, o null si no se
 * reconoce (lo elige el usuario). Un valor vacío no es "no reconocido":
 * queda vacío y, si se verifica con ARCA, lo completa ARCA. */
export function guessTaxCondition(raw: string): string | null {
  const text = valueKey(raw)
    .replace(/[.\-_/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return null;
  if (/social/.test(text) && /monotribut|^mono/.test(text)) return 'Monotributista Social';
  if (/no alcanzad/.test(text)) return 'IVA No Alcanzado';
  if (/no categorizad|^nc$/.test(text)) return 'No categorizado';
  if (/^(r i|ri|resp insc|resp inscripto|responsable inscripto|iva responsable inscripto|inscripto|insc|iva insc|iva inscripto)$/.test(text)) {
    return 'Responsable Inscripto';
  }
  if (/monotribut|^(mono|monot|mt|rm|resp monotributo|responsable monotributo)$/.test(text)) return 'Monotributo';
  if (/^(ex|exe|exento|exenta|iva exento|sujeto exento|iva sujeto exento)$/.test(text)) return 'Exento';
  if (/^(cf|c f|consumidor final|cons final|consumidor)$/.test(text)) return 'Consumidor Final';
  return null;
}

const INDUSTRY_WORDS: [RegExp, CompanyIndustry][] = [
  [/comerci|ferreter|corralon|distribui|mayorist|minorist|almacen|libreri/, 'COMERCIO'],
  [/servicio/, 'SERVICIOS'],
  [/industri|fabric|metalurg|manufactur/, 'INDUSTRIA'],
  [/construc/, 'CONSTRUCCION'],
  [/agro|campo|agricol|ganader/, 'AGRO'],
  [/tecnolog|informatic|software|sistemas/, 'TECNOLOGIA'],
  [/salud|medic|farmac|clinic/, 'SALUD'],
  [/educa|escuela|colegio/, 'EDUCACION'],
  [/gastronom|restaurant|bar|comida/, 'GASTRONOMIA'],
  [/transport|logistic|flete/, 'TRANSPORTE'],
  [/inmobiliari/, 'INMOBILIARIO'],
];

/** Rubro de Oplex para el texto del archivo, o null si no se reconoce. */
export function guessIndustry(raw: string): CompanyIndustry | null {
  const text = valueKey(raw);
  if (!text) return null;
  return INDUSTRY_WORDS.find(([re]) => re.test(text))?.[1] ?? null;
}

export type TaxIdCheck =
  | { kind: 'cuit'; value: string; digits: string }
  | { kind: 'dni'; value: string; digits: string }
  | { kind: 'invalid'; message: string };

/** CUIT con guiones ("30-71000001-0") si es válido; un DNI de 7 u 8 números
 * se acepta como está (clientes consumidor final). */
export function checkTaxId(raw: string): TaxIdCheck {
  const digits = normalizeCuit(raw);
  if (digits.length === 11) {
    if (!isValidCuit(digits)) return { kind: 'invalid', message: `El CUIT "${raw}" no es válido (el último número no coincide)` };
    return { kind: 'cuit', digits, value: `${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits.slice(10)}` };
  }
  if (digits.length === 7 || digits.length === 8) return { kind: 'dni', digits, value: digits };
  return { kind: 'invalid', message: `El CUIT "${raw}" no es válido (tiene que tener 11 números)` };
}

/** "Carlos Gómez" -> nombre "Carlos", apellido "Gómez". */
export function splitPersonName(full: string): { firstName: string; lastName: string | null } {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: null };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

const LEGAL_WORDS = new Set(['sa', 'srl', 'sas', 'sociedad', 'anonima', 'de', 'responsabilidad', 'limitada', 'y', 'cia', 'hnos', 'e', 'hijos', 's', 'a', 'r', 'l', 'saic', 'sacif', 'sca']);

/** Si la razón social del archivo y la de ARCA son la misma escrita
 * distinto ("Hierros Norte S.A." / "HIERROS NORTE SA"). */
export function sameCompanyName(a: string, b: string): boolean {
  const words = (s: string) =>
    new Set(
      valueKey(s)
        .replace(/[^a-z0-9ñ ]/g, ' ')
        .split(/\s+/)
        .filter((w) => w && !LEGAL_WORDS.has(w)),
    );
  const wa = words(a);
  const wb = words(b);
  if (wa.size === 0 || wb.size === 0) return true;
  return [...wa].every((w) => wb.has(w)) || [...wb].every((w) => wa.has(w));
}
