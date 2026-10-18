import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type { ArticleImage } from '@plexo/database';
import { downloadImage } from './article-import.service.js';
import { ArticleImageService } from './article-image.service.js';

export type PhotoSource = 'off' | 'pixabay' | 'pexels';

export interface PhotoSuggestion {
  // Miniatura para elegir y foto más grande para guardar.
  thumbUrl: string;
  url: string;
  source: PhotoSource;
  // Lo que se muestra debajo de la foto y queda guardado con ella.
  credit: string;
}

const PER_SOURCE = 3;
const TIMEOUT_MS = 8_000;
const USER_AGENT = 'Oplex/1.0 (soporte@oplex.com.ar)';
// Pixabay pide guardar cada búsqueda 24 h; sus links de foto vencen a las
// 24 h, así que se guardan un poco menos para no ofrecer links vencidos.
const PIXABAY_CACHE_MS = 23 * 60 * 60 * 1000;
const PIXABAY_CACHE_MAX = 500;

// Sólo se guardan fotos de estos servidores: la foto elegida viaja desde el
// navegador, y sin esta lista la API bajaría cualquier link que le manden.
const ALLOWED_HOSTS = [
  'images.openfoodfacts.org',
  'static.openfoodfacts.org',
  'pixabay.com',
  'cdn.pixabay.com',
  'images.pexels.com',
];

interface OffHit {
  product_name?: string;
  brands?: string[] | string;
  countries_tags?: string[];
  image_front_url?: string;
  image_front_small_url?: string;
}

interface PixabayHit {
  tags?: string;
  user?: string;
  webformatURL?: string;
  largeImageURL?: string;
}

interface PexelsPhoto {
  photographer?: string;
  src?: { medium?: string; large?: string };
}

/** Fotos sugeridas para el alta de un artículo (boceto aprobado "Alta
 * guiada de artículos"). Dos fuentes con licencia que permite usarlas
 * también en la tienda online:
 * - Open Food Facts: envases reales de supermercado (CC BY-SA, se cita).
 * - Fotos genéricas (licencia libre): Pixabay con PIXABAY_API_KEY o, si no
 *   hay, Pexels con PEXELS_API_KEY (Pexels pausó las claves nuevas).
 * Primero va la fuente que mejor le va al nombre: si Open Food Facts
 * encuentra la marca escrita en el nombre, sus fotos; si no, las genéricas. */
@Injectable()
export class PhotoSuggestionsService {
  private readonly logger = new Logger(PhotoSuggestionsService.name);
  private readonly pixabayCache = new Map<string, { at: number; photos: PhotoSuggestion[] }>();

  constructor(private readonly articleImageService: ArticleImageService) {}

  async search(rawQuery: string): Promise<PhotoSuggestion[]> {
    const query = rawQuery.trim().slice(0, 80);
    if (query.length < 2) return [];
    const [off, stock] = await Promise.all([this.searchOff(query), this.searchStock(query)]);
    const [first, second] = off.brandMatch ? [off.photos, stock] : [stock, off.photos];
    // 3 de cada una; si una trae menos, la otra completa los lugares libres.
    const picked = [...first.slice(0, PER_SOURCE), ...second.slice(0, PER_SOURCE)];
    const spare = [...first.slice(PER_SOURCE), ...second.slice(PER_SOURCE)];
    return [...picked, ...spare].slice(0, PER_SOURCE * 2);
  }

  /** Guarda como foto principal una de las sugeridas, con su crédito. */
  async saveSuggested(articleId: string, rawUrl: string, credit: string): Promise<ArticleImage | null> {
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      throw new BadRequestException('Link de foto inválido');
    }
    if (url.protocol !== 'https:' || !ALLOWED_HOSTS.includes(url.hostname)) {
      throw new BadRequestException('Esa foto no viene de una fuente sugerida');
    }
    let photo: { mime: string; buffer: Buffer };
    try {
      photo = await downloadImage(url.toString());
    } catch (err) {
      throw new BadRequestException(`No se pudo bajar la foto: ${(err as Error).message}`);
    }
    await this.articleImageService.setImage(articleId, photo.mime, photo.buffer, credit.trim().slice(0, 200) || null);
    const [main] = await this.articleImageService.listImages(articleId);
    return main ?? null;
  }

  private async searchOff(query: string): Promise<{ photos: PhotoSuggestion[]; brandMatch: boolean }> {
    const params = new URLSearchParams({
      q: query,
      page_size: '24',
      fields: 'product_name,brands,countries_tags,image_front_url,image_front_small_url',
    });
    const data = await this.getJson<{ hits?: OffHit[] }>(`https://search.openfoodfacts.org/search?${params}`);
    const hits = (data?.hits ?? []).filter(
      (h): h is OffHit & { image_front_url: string; image_front_small_url: string } =>
        !!h.image_front_url && !!h.image_front_small_url,
    );
    // El buscador de Open Food Facts devuelve cualquier producto que tenga
    // una de las palabras ("Harina Cañuelas" trae aceites Cañuelas): primero
    // los que tienen más palabras de la búsqueda y, a igualdad, los de
    // Argentina (mismas marcas y envases que ve el usuario).
    const plainQuery = plain(query);
    const words = plainQuery.split(/[^a-z0-9]+/).filter((w) => w.length > 2 || /^\d+$/.test(w));
    // Coincidir en el nombre pesa el doble que en la marca: "Harina
    // Cañuelas" prefiere otra harina antes que un aceite Cañuelas.
    const score = (h: OffHit) => {
      const name = plain(h.product_name ?? '');
      const brands = plain(brandsOf(h).join(' '));
      return words.reduce((sum, w) => sum + (name.includes(w) ? 2 : brands.includes(w) ? 1 : 0), 0);
    };
    const ranked = hits
      .map((h, i) => ({ h, i, s: score(h) }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s || Number(isArgentine(b.h)) - Number(isArgentine(a.h)) || a.i - b.i)
      .map((r) => r.h);
    const brandMatch = ranked.slice(0, PER_SOURCE).some((h) => brandsOf(h).some((b) => b.length > 2 && plainQuery.includes(plain(b))));
    const photos = ranked.slice(0, PER_SOURCE * 2).map((h) => {
      const name = /[a-z0-9]/i.test(h.product_name ?? '') ? h.product_name : null;
      return {
        thumbUrl: h.image_front_small_url,
        url: h.image_front_url,
        source: 'off' as const,
        credit: `Open Food Facts${name ? ` · ${name}` : ''} (CC BY-SA)`,
      };
    });
    return { photos, brandMatch };
  }

  private searchStock(query: string): Promise<PhotoSuggestion[]> {
    return process.env.PIXABAY_API_KEY ? this.searchPixabay(query, process.env.PIXABAY_API_KEY) : this.searchPexels(query);
  }

  private async searchPixabay(query: string, key: string): Promise<PhotoSuggestion[]> {
    const cacheKey = plain(query);
    const cached = this.pixabayCache.get(cacheKey);
    if (cached && Date.now() - cached.at < PIXABAY_CACHE_MS) return cached.photos;
    const params = new URLSearchParams({ key, q: query, lang: 'es', image_type: 'photo', safesearch: 'true', per_page: '20' });
    const data = await this.getJson<{ hits?: PixabayHit[] }>(`https://pixabay.com/api/?${params}`);
    if (!data) return [];
    // Pixabay trae todo lo que tenga la palabra en alguna etiqueta ("martillo"
    // trae un pájaro "martillo amarillo"): primero las fotos donde la palabra
    // es de las primeras etiquetas, que es de lo que trata la foto.
    const words = plain(query).split(/[^a-z0-9]+/).filter((w) => w.length > 2);
    const score = (h: PixabayHit) => {
      const tags = (h.tags ?? '').split(',').map(plain);
      return words.reduce((sum, w) => {
        const i = tags.findIndex((t) => t === w || t === `${w}s` || t.startsWith(`${w} `));
        if (i === 0) return sum + 3;
        if (i === 1) return sum + 2;
        if (i > 1) return sum + 1.5;
        return sum + (tags.some((t) => t.includes(w)) ? 1 : 0);
      }, 0);
    };
    const photos = (data.hits ?? [])
      .filter((h): h is PixabayHit & { webformatURL: string; largeImageURL: string } => !!h.webformatURL && !!h.largeImageURL)
      .map((h, i) => ({ h, i, s: score(h) }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s || a.i - b.i)
      .slice(0, PER_SOURCE * 2)
      .map(({ h }) => ({
        thumbUrl: h.webformatURL,
        url: h.largeImageURL,
        source: 'pixabay' as const,
        credit: `Foto de ${h.user || 'un autor'} en Pixabay`,
      }));
    if (this.pixabayCache.size >= PIXABAY_CACHE_MAX) {
      const oldest = this.pixabayCache.keys().next().value;
      if (oldest !== undefined) this.pixabayCache.delete(oldest);
    }
    this.pixabayCache.set(cacheKey, { at: Date.now(), photos });
    return photos;
  }

  private async searchPexels(query: string): Promise<PhotoSuggestion[]> {
    const key = process.env.PEXELS_API_KEY;
    if (!key) return [];
    const params = new URLSearchParams({ query, per_page: String(PER_SOURCE * 2), locale: 'es-ES' });
    const data = await this.getJson<{ photos?: PexelsPhoto[] }>(`https://api.pexels.com/v1/search?${params}`, {
      authorization: key,
    });
    return (data?.photos ?? []).flatMap((p) =>
      p.src?.medium && p.src.large
        ? [
            {
              thumbUrl: p.src.medium,
              url: p.src.large,
              source: 'pexels' as const,
              credit: `Foto de ${p.photographer || 'un autor'} en Pexels`,
            },
          ]
        : [],
    );
  }

  /** Una fuente caída o lenta no rompe la búsqueda: devuelve null y se
   * muestran sólo las fotos de la otra. */
  private async getJson<T>(url: string, headers: Record<string, string> = {}): Promise<T | null> {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { 'user-agent': USER_AGENT, accept: 'application/json', ...headers },
      });
      if (!res.ok) {
        this.logger.warn(`Fotos sugeridas: ${new URL(url).hostname} respondió ${res.status}`);
        return null;
      }
      return (await res.json()) as T;
    } catch (err) {
      this.logger.warn(`Fotos sugeridas: ${new URL(url).hostname} falló (${(err as Error).message})`);
      return null;
    }
  }
}

function brandsOf(hit: OffHit): string[] {
  if (Array.isArray(hit.brands)) return hit.brands;
  return hit.brands ? hit.brands.split(',') : [];
}

function isArgentine(hit: OffHit): boolean {
  return (hit.countries_tags ?? []).includes('en:argentina');
}

function plain(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}
