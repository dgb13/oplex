import Storefront from '@/components/storefront/Storefront';
import type { StorefrontPayload } from '@/lib/storefront';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';

// Corre en el servidor de Next: en Docker va directo al contenedor de la API.
const API_BASE_URL =
  process.env.INTERNAL_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000/api';

// Se llega acá desde <subdominio>.oplex.com.ar (ver src/proxy.ts) o directo
// por /tienda/<subdominio>. Stock y precios cambian todo el tiempo: se piden
// en cada visita, sin caché.
const loadStore = cache(async (sub: string): Promise<StorefrontPayload | null> => {
  try {
    const res = await fetch(`${API_BASE_URL}/public/storefront/${encodeURIComponent(sub)}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as StorefrontPayload;
  } catch {
    return null;
  }
});

function absoluteUpload(path: string | undefined): string | undefined {
  if (!path) return undefined;
  if (/^https?:/.test(path)) return path;
  const origin = (process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000/api').replace(/\/api\/?$/, '');
  return `${origin}${path}`;
}

export async function generateMetadata({ params }: { params: Promise<{ sub: string }> }): Promise<Metadata> {
  const { sub } = await params;
  const data = await loadStore(sub);
  if (!data) return { title: 'Tienda no disponible', robots: { index: false } };
  const description = data.store.heroSubtitle || `Catálogo de ${data.store.name}: ${data.categories.slice(0, 4).join(', ')}. Armá tu pedido online.`;
  const image = absoluteUpload(data.products.find((p) => p.images[0])?.images[0]);
  return {
    title: data.store.name,
    description,
    openGraph: { title: data.store.name, description, url: data.store.url, images: image ? [image] : undefined },
  };
}

export default async function StorePage({ params }: { params: Promise<{ sub: string }> }) {
  const { sub } = await params;
  const data = await loadStore(sub);
  if (!data) notFound();
  return <Storefront data={data} />;
}
