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
  // Cargado hace menos de 30 días (etiqueta "Nuevo").
  isNew: boolean;
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
  coverUrl: string | null;
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
  coverImageUrl: string | null;
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

export type StorefrontSettingsInput = Omit<StorefrontSettings, 'id' | 'coverImageUrl'>;

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
  uploadCover: (file: Blob) => {
    const form = new FormData();
    form.append('file', file, 'portada.jpg');
    return api.post<StorefrontSettings>('/storefront/cover', form).then((r) => r.data);
  },
  removeCover: () => api.delete<StorefrontSettings | null>('/storefront/cover').then((r) => r.data),
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

/** Las 8 plantillas del boceto v2. `preview` es la miniatura de
 * public/storefront/templates (captura de la tienda de ejemplo). */
export const STOREFRONT_TEMPLATES: { id: StorefrontTemplate; name: string; vibe: string; what: string }[] = [
  { id: 'aire', name: 'Aire', vibe: 'Galería minimal', what: 'Foto de portada a pantalla completa, grilla con recuadros de tamaños distintos y ficha con las fotos grandes apiladas.' },
  { id: 'atelier', name: 'Atelier', vibe: 'Revista de lujo', what: 'Menú a pantalla completa, título que se revela, productos en zigzag y fotos en una tira que se arrastra.' },
  { id: 'pop', name: 'Pop', vibe: 'Stickers y color', what: 'Título que cae letra por letra, stickers, cintas cruzadas, muro de tarjetas y el pedido en una burbuja.' },
  { id: 'taller', name: 'Taller', vibe: 'Catálogo técnico', what: 'Buscador, filtros al costado, lista o grilla con cantidad en cada fila y el pedido siempre a la vista.' },
  { id: 'mercado', name: 'Mercado', vibe: 'App de delivery', what: 'Datos del local, pestañas por categoría, + y − en cada producto y la barra de pedido fija abajo.' },
  { id: 'neon', name: 'Neón', vibe: 'Tecnología oscura', what: 'Portada que se enciende con el mouse, destacados que cambian al bajar y grilla de vidrio con brillo.' },
  { id: 'revista', name: 'Revista', vibe: 'Editorial', what: 'Cabezal gigante, tapa en collage, índice y cada categoría diagramada como una sección distinta.' },
  { id: 'vitrina', name: 'Vitrina', vibe: 'Pantalla completa', what: 'Un producto por pantalla, a todo color, que se pasa con flechas, la rueda o deslizando.' },
];

// Sólo las fuentes de la plantilla elegida (no las 8 juntas).
export const STOREFRONT_FONTS: Record<StorefrontTemplate, string> = {
  aire: 'family=Geist:wght@300;400;500;600&family=Geist+Mono:wght@400;500',
  atelier: 'family=Cormorant:ital,wght@0,500;0,600;1,400;1,500&family=Hanken+Grotesk:wght@400;500;600',
  pop: 'family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800',
  taller: 'family=Archivo:wdth,wght@62..125,400;62..125,600;62..125,800;62..125,900&family=IBM+Plex+Mono:wght@400;500;600',
  mercado: 'family=Plus+Jakarta+Sans:wght@400;500;600;700;800',
  neon: 'family=Unbounded:wght@400;600;800&family=Sora:wght@300;400;600',
  revista: 'family=Big+Shoulders+Display:wght@700;900&family=Bodoni+Moda:ital,opsz,wght@0,6..96,400;0,6..96,600;1,6..96,400&family=Libre+Franklin:wght@400;500;700',
  vitrina: 'family=Syne:wght@500;700;800&family=DM+Sans:wght@400;500;700',
};

export function storefrontFontsHref(template: StorefrontTemplate): string {
  return `https://fonts.googleapis.com/css2?${STOREFRONT_FONTS[template] ?? STOREFRONT_FONTS.aire}&display=swap`;
}
