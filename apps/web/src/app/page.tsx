import { PublicWebAnalytics } from '@/components/analytics/PublicWebAnalytics';
import Landing from '@/components/landing/Landing';
import type { PublicPlan } from '@/components/landing/data';
import { OPLEX_SUPPORT_EMAIL } from '@/lib/contact';
import { SITE_URL } from '@/lib/site';
import { Bricolage_Grotesque, JetBrains_Mono, Onest } from 'next/font/google';

const display = Bricolage_Grotesque({ subsets: ['latin'], weight: ['500', '700', '800'], variable: '--font-lp-display' });
const body = Onest({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-lp-body' });
const mono = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '600'], variable: '--font-lp-mono' });

const TITLE = 'Oplex · ERP en la nube para pymes argentinas';
const DESCRIPTION =
  'Facturación ARCA, Caja, stock, compras, producción y contabilidad en un solo sistema, con un asistente de IA que responde por WhatsApp. Probalo 15 días gratis.';

// canonical + openGraph le marcan a Google que la portada es la página
// principal del sitio (antes una búsqueda de "oplex" mostraba primero los
// Términos legales).
export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/' },
  openGraph: { type: 'website', url: '/', siteName: 'Oplex', locale: 'es_AR', title: TITLE, description: DESCRIPTION },
  twitter: { card: 'summary', title: TITLE, description: DESCRIPTION },
};

// Datos estructurados: Organization + WebSite son lo que Google usa para el
// nombre del sitio y el logo en los resultados.
const JSON_LD = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#organization`,
      name: 'Oplex',
      url: `${SITE_URL}/`,
      logo: `${SITE_URL}/logo.png`,
      email: OPLEX_SUPPORT_EMAIL,
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      name: 'Oplex',
      url: `${SITE_URL}/`,
      inLanguage: 'es-AR',
      publisher: { '@id': `${SITE_URL}/#organization` },
    },
  ],
};

// Esto corre en el servidor de Next: en Docker, INTERNAL_API_BASE_URL va
// directo al contenedor de la API en vez de salir a internet y volver.
const API_BASE_URL =
  process.env.INTERNAL_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000/api';

// Planes y precios en vivo desde la API pública (GET /plans), así un cambio
// de precio en Admin se ve en la landing sin tocar código. Cacheado 5 min.
async function loadPlans(): Promise<PublicPlan[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/plans`, { next: { revalidate: 300 } });
    if (!res.ok) return [];
    return (await res.json()) as PublicPlan[];
  } catch {
    return [];
  }
}

export default async function Home() {
  const plans = await loadPlans();
  return (
    <div className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
      <Landing plans={plans} />
      <PublicWebAnalytics />
    </div>
  );
}
