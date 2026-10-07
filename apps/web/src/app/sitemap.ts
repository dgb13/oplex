import { LEGAL_DOCS } from '@/lib/legal';
import { SITE_URL } from '@/lib/site';
import type { MetadataRoute } from 'next';

/**
 * /sitemap.xml para Google Search Console: sólo las páginas públicas (las
 * mismas que llevan el contador de visitas). Todo lo que está detrás del
 * login queda afuera - ver robots.ts.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/signup`, lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${SITE_URL}/login`, lastModified: now, changeFrequency: 'yearly', priority: 0.5 },
    ...LEGAL_DOCS.map((doc) => ({
      url: `${SITE_URL}/legal/${doc.slug}`,
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.3,
    })),
    { url: `${SITE_URL}/arrepentimiento`, lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
  ];
}
