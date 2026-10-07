import { NextResponse, type NextRequest } from 'next/server';

/**
 * Tiendas online: <subdominio>.oplex.com.ar (y en desarrollo
 * <subdominio>.localhost:4200) muestran la tienda de esa empresa. Se
 * reescribe por dentro a /tienda/<subdominio>, sin cambiar la dirección que
 * ve el visitante. El dominio principal y www siguen siendo Oplex.
 */
const ROOT_DOMAIN = (process.env.STOREFRONT_ROOT_DOMAIN ?? 'oplex.com.ar').toLowerCase();

function storeSubdomain(hostHeader: string | null): string | null {
  if (!hostHeader) return null;
  const host = hostHeader.toLowerCase().split(':')[0];
  let sub: string | null = null;
  if (host.endsWith('.localhost')) sub = host.slice(0, -'.localhost'.length);
  else if (host.endsWith(`.${ROOT_DOMAIN}`)) sub = host.slice(0, -(ROOT_DOMAIN.length + 1));
  if (!sub || sub === 'www' || sub.includes('.')) return null;
  return sub;
}

export function proxy(request: NextRequest) {
  const sub = storeSubdomain(request.headers.get('host'));
  if (!sub) return NextResponse.next();
  const url = request.nextUrl.clone();
  // La tienda es una sola página: cualquier ruta del subdominio la muestra.
  url.pathname = `/tienda/${sub}`;
  return NextResponse.rewrite(url);
}

export const config = {
  // Ni los archivos de Next ni los íconos pasan por acá.
  matcher: ['/((?!_next/|favicon.ico|icon|apple-icon|robots.txt|sitemap.xml).*)'],
};
