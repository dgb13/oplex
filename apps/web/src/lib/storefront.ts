import { api, API_BASE_URL } from '@/lib/api';

export type StorefrontTemplate = 'aire' | 'atelier' | 'pop' | 'taller' | 'mercado' | 'neon' | 'revista' | 'vitrina';
export type StorefrontStockDisplay = 'LOW' | 'ALWAYS' | 'NEVER';
export type StorefrontOrderStatus = 'NEW' | 'CONFIRMED' | 'DONE' | 'CANCELLED';

export interface StorefrontVariant {
  id: string;
  label: string;
  price: number;
  netPrice: number | null;
  stockShown: number | null;
}

export interface StorefrontProduct {
  id: string;
  name: string;
  description: string | null;
  category: string;
  sku: string;
  images: string[];
  price: number;
  netPrice: number | null;
  stockShown: number | null;
  variants: StorefrontVariant[];
}

export interface StorefrontStore {
  name: string;
  subdomain: string;
  url: string;
  template: StorefrontTemplate;
  accentColor: string | null;
  heroTitle: string | null;
  heroSubtitle: string | null;
  logoUrl: string | null;
  whatsappNumber: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  published: boolean;
}

export interface StorefrontPayload {
  store: StorefrontStore;
  categories: string[];
  products: StorefrontProduct[];
  taxCondition: 'RESPONSABLE_INSCRIPTO' | 'MONOTRIBUTO' | 'EXENTO' | null;
}

export interface StorefrontSettings {
  id: string;
  subdomain: string;
  published: boolean;
  template: StorefrontTemplate;
  accentColor: string | null;
  warehouseId: string | null;
  stockDisplay: StorefrontStockDisplay;
  whatsappNumber: string | null;
  notifyEmail: string | null;
  heroTitle: string | null;
  heroSubtitle: string | null;
}

export interface StorefrontCoverage {
  visible: number;
  total: number;
  notPublished: number;
  noStock: number;
  noCategory: number;
  noPrice: number;
}

export interface StorefrontAdminView {
  planEnabled: boolean;
  planName: string | null;
  taxCondition: string | null;
  suggestedSubdomain: string;
  rootDomain: string;
  settings: StorefrontSettings | null;
  coverage: StorefrontCoverage;
  newOrders: number;
}

export type StorefrontSettingsInput = Omit<StorefrontSettings, 'id'>;

export interface StorefrontOrder {
  id: string;
  number: number;
  customerName: string;
  customerPhone: string | null;
  note: string | null;
  total: string;
  status: StorefrontOrderStatus;
  createdAt: string;
  lines: { description: string; quantity: string; unitPrice: string; articleVariantId: string }[];
}

export interface StorefrontOrderResult {
  number: number;
  message: string;
  whatsappUrl: string | null;
}

export const storefrontApi = {
  getAdminView: () => api.get<StorefrontAdminView>('/storefront/settings').then((r) => r.data),
  save: (input: StorefrontSettingsInput) => api.put<StorefrontSettings>('/storefront/settings', input).then((r) => r.data),
  checkSubdomain: (subdomain: string) =>
    api
      .get<{ subdomain: string; available: boolean; message: string | null }>('/storefront/subdomain-check', { params: { subdomain } })
      .then((r) => r.data),
  preview: () => api.get<StorefrontPayload>('/storefront/preview').then((r) => r.data),
  listOrders: () => api.get<StorefrontOrder[]>('/storefront/orders').then((r) => r.data),
  updateOrderStatus: (id: string, status: StorefrontOrderStatus) =>
    api.patch<StorefrontOrder>(`/storefront/orders/${id}`, { status }).then((r) => r.data),
};

/** El pedido del visitante: sin sesión y sin el interceptor de axios (que
 * redirige al login ante un 401). */
export async function sendStorefrontOrder(
  subdomain: string,
  body: { customerName: string; customerPhone?: string; note?: string; lines: { variantId: string; quantity: number }[] },
): Promise<StorefrontOrderResult> {
  const res = await fetch(`${API_BASE_URL}/public/storefront/${encodeURIComponent(subdomain)}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = (data as { message?: string | string[] }).message;
    throw new Error(Array.isArray(message) ? message[0] : message || 'No se pudo enviar el pedido. Probá de nuevo en un momento');
  }
  return data as StorefrontOrderResult;
}

export const STOREFRONT_TEMPLATES: {
  id: StorefrontTemplate;
  name: string;
  vibe: string;
  fx: string;
  swatch: [string, string, string];
  font: string;
  weight: number;
}[] = [
  { id: 'aire', name: 'Aire', vibe: 'Minimalista', fx: 'aparición suave, zoom lento en las fotos', swatch: ['#fbfbf9', '#1d1d1b', '#c9c4b9'], font: "'Jost',sans-serif", weight: 300 },
  { id: 'atelier', name: 'Atelier', vibe: 'Boutique elegante', fx: 'títulos que se revelan, fotos en arco', swatch: ['#ece6dd', '#2a2420', '#6e2a2a'], font: "'Cormorant Garamond',serif", weight: 500 },
  { id: 'pop', name: 'Pop', vibe: 'Moderna y colorida', fx: 'tarjetas que rebotan, confeti al agregar', swatch: ['#fff1cf', '#161616', '#ff4f2e'], font: "'Bricolage Grotesque',sans-serif", weight: 800 },
  { id: 'taller', name: 'Taller', vibe: 'Industrial', fx: 'título que se escribe solo, lista con stock', swatch: ['#1b1c1e', '#ffc21a', '#ecebe6'], font: "'Archivo Black',sans-serif", weight: 400 },
  { id: 'mercado', name: 'Mercado', vibe: 'Natural', fx: 'formas que flotan, onda animada', swatch: ['#f2f1e6', '#4b5d23', '#e0a526'], font: "'Fraunces',serif", weight: 700 },
  { id: 'neon', name: 'Neón', vibe: 'Tecnología', fx: 'luz que sigue al mouse, bordes que brillan', swatch: ['#07080d', '#7cf7ff', '#b56bff'], font: "'Chakra Petch',sans-serif", weight: 700 },
  { id: 'revista', name: 'Revista', vibe: 'Editorial', fx: 'fotos del gris al color, nota de tapa', swatch: ['#ffffff', '#121212', '#1f4fd1'], font: "'DM Serif Display',serif", weight: 400 },
  { id: 'vitrina', name: 'Vitrina', vibe: 'Lujo', fx: 'carrusel 3D, título dorado', swatch: ['#0f0e0c', '#c9a45c', '#f1ead9'], font: "'Italiana',serif", weight: 400 },
];

// Sólo las fuentes de la plantilla elegida (no las 8 juntas).
export const STOREFRONT_FONTS: Record<StorefrontTemplate, string> = {
  aire: 'family=Jost:wght@300;400;500',
  atelier: 'family=Cormorant+Garamond:ital,wght@0,500;1,400;1,500&family=Manrope:wght@400;500;700',
  pop: 'family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,800',
  taller: 'family=Archivo+Black&family=Archivo:wght@400;600&family=JetBrains+Mono:wght@400;600',
  mercado: 'family=Fraunces:opsz,wght@9..144,400;9..144,700&family=Nunito:wght@400;700',
  neon: 'family=Chakra+Petch:wght@500;700&family=Barlow:wght@400;500;600',
  revista: 'family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@400;500;700',
  vitrina: 'family=Italiana&family=Manrope:wght@400;500;700',
};

export function storefrontFontsHref(template: StorefrontTemplate): string {
  return `https://fonts.googleapis.com/css2?${STOREFRONT_FONTS[template]}&display=swap`;
}

/** Todas las fuentes, para la grilla de miniaturas de Configurar tienda. */
export function allStorefrontFontsHref(): string {
  const families = [...new Set(Object.values(STOREFRONT_FONTS).flatMap((f) => f.split('&')))];
  return `https://fonts.googleapis.com/css2?${families.join('&')}&display=swap`;
}
