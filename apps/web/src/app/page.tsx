import Landing from '@/components/landing/Landing';
import type { PublicPlan } from '@/components/landing/data';
import { Bricolage_Grotesque, JetBrains_Mono, Onest } from 'next/font/google';

const display = Bricolage_Grotesque({ subsets: ['latin'], weight: ['500', '700', '800'], variable: '--font-lp-display' });
const body = Onest({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-lp-body' });
const mono = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '600'], variable: '--font-lp-mono' });

export const metadata = {
  title: 'Oplex · ERP en la nube para pymes argentinas',
  description:
    'Facturación ARCA, Caja, stock, compras, producción y contabilidad en un solo sistema, con un asistente de IA que responde por WhatsApp. Probalo 15 días gratis.',
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
      <Landing plans={plans} />
    </div>
  );
}
