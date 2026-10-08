/**
 * Reglas de la dirección de la tienda (<subdominio>.oplex.com.ar). Todo lo
 * que entra se normaliza ANTES de compararlo o guardarlo, así "Casa Nativa",
 * "casa-nativa" y "CASA NATIVA" no pueden convivir como tres tiendas
 * distintas que se pisan: las tres terminan en "casa-nativa". La unicidad
 * real la garantiza el índice único de storefront_settings.subdomain.
 */

export const SUBDOMAIN_MIN = 3;
export const SUBDOMAIN_MAX = 30;

// Direcciones que se confunden con el sistema o con servicios típicos.
export const RESERVED_SUBDOMAINS = new Set([
  'www', 'api', 'app', 'apps', 'admin', 'administrador', 'oplex', 'plexo', 'mail', 'email', 'smtp', 'imap', 'pop',
  'ftp', 'ns', 'ns1', 'ns2', 'dns', 'cdn', 'static', 'assets', 'uploads', 'media', 'img', 'images', 'files',
  'tienda', 'tiendas', 'shop', 'store', 'stores', 'login', 'signup', 'registro', 'cuenta', 'auth', 'sso',
  'soporte', 'support', 'ayuda', 'help', 'docs', 'blog', 'status', 'estado', 'dev', 'test', 'demo', 'staging',
  'beta', 'panel', 'dashboard', 'pagos', 'pago', 'checkout', 'billing', 'facturacion', 'arca', 'afip', 'root',
  'webmail', 'cpanel', 'localhost', 'mercadopago', 'whatsapp',
]);

/** Minúsculas, sin acentos ni ñ, espacios/guiones bajos -> guion, sólo a-z 0-9 y guiones. */
export function normalizeSubdomain(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[\s_.]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SUBDOMAIN_MAX)
    .replace(/-+$/g, '');
}

export type SubdomainProblem = 'TOO_SHORT' | 'RESERVED' | 'INVALID';

/** Problema de forma (no de disponibilidad) de un subdominio ya normalizado. */
export function subdomainProblem(normalized: string): SubdomainProblem | null {
  if (normalized.length < SUBDOMAIN_MIN) return 'TOO_SHORT';
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(normalized)) return 'INVALID';
  if (RESERVED_SUBDOMAINS.has(normalized)) return 'RESERVED';
  return null;
}

export const SUBDOMAIN_PROBLEM_MESSAGE: Record<SubdomainProblem | 'TAKEN', string> = {
  TOO_SHORT: `La dirección tiene que tener al menos ${SUBDOMAIN_MIN} letras o números`,
  INVALID: 'La dirección sólo puede tener letras, números y guiones',
  RESERVED: 'Esa dirección está reservada. Probá con el nombre de tu negocio',
  TAKEN: 'Esa dirección ya la tiene otra tienda',
};
