import { SITE_URL } from '@/lib/site';
import type { MetadataRoute } from 'next';

// Secciones detrás del login: no tienen nada para mostrarle a un buscador
// (sin sesión redirigen al login). Las públicas están en sitemap.ts.
const PRIVATE_SECTIONS = [
  '/api/',
  '/admin',
  '/dashboard',
  '/accountants',
  '/accounting',
  '/agenda',
  '/branches',
  '/clients',
  '/companies',
  '/inventory',
  '/invoicing',
  '/payables',
  '/pos',
  '/preferences',
  '/production',
  '/profile',
  '/purchases',
  '/quotes',
  '/receivables',
  '/reports',
  '/resumen',
  '/settings',
  '/sla',
  '/suppliers',
  '/taxes',
  '/treasury',
  '/uploads/',
  '/accept-invitation',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/oauth',
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: PRIVATE_SECTIONS },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
