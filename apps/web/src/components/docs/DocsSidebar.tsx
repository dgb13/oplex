'use client';

import { Download, Search } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo, useState } from 'react';

export interface DocsSidebarChapter {
  slug: string;
  number: number;
  title: string;
  featured?: boolean;
  articles: { slug: string; title: string; href: string }[];
}

export interface DocsSearchEntry {
  href: string;
  title: string;
  chapter: string;
  summary: string;
  text: string;
}

export const DOCS_PDF_URL = '/ayuda/manual-oplex.pdf';

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

// Palabras que no ayudan a encontrar nada ("¿cómo subo el certificado?").
const STOP_WORDS = new Set('a al como con cual de del el en es la las lo los me mi para por que se su sus un una uno y o'.split(' '));

// Terminaciones que se sacan para que "vencido", "vence" y "vencimiento"
// busquen lo mismo. De la más larga a la más corta; siempre quedan al menos
// 4 letras, así "caja" o "iva" no se recortan.
const SUFFIXES = [
  'imientos', 'imiento', 'amientos', 'amiento', 'aciones', 'iciones', 'acion', 'icion', 'adoras', 'adores',
  'adora', 'ador', 'istas', 'ista', 'iendo', 'ando', 'idos', 'idas', 'ados', 'adas', 'ido', 'ida', 'ado', 'ada', 'ales', 'al',
  'es', 'ar', 'er', 'ir', 'as', 'os', 'a', 'e', 'o', 's',
];

function stem(word: string): string {
  const suffix = SUFFIXES.find((s) => word.endsWith(s) && word.length - s.length >= 4);
  return suffix ? word.slice(0, -suffix.length) : word;
}

function tokens(text: string): string[] {
  return normalize(text).split(/[^a-z0-9]+/).filter(Boolean);
}

/** Temario + buscador + descarga del PDF. Buscar es local (el índice viene
 * armado del servidor): sin acentos ni mayúsculas, cada palabra se compara
 * por su raíz (vencido = vence = vencimiento) contra el principio de las
 * palabras del artículo, y tienen que aparecer todas. El título pesa más que
 * el texto, y suma un poco cuántas veces aparece. */
export default function DocsSidebar({ chapters, index }: { chapters: DocsSidebarChapter[]; index: DocsSearchEntry[] }) {
  const pathname = usePathname();
  const [query, setQuery] = useState('');
  const activeChapter = pathname.split('/')[2] ?? '';

  const searchable = useMemo(
    () => index.map((entry) => ({ entry, title: tokens(entry.title), body: tokens(`${entry.summary} ${entry.text}`) })),
    [index],
  );

  const results = useMemo(() => {
    const roots = tokens(query)
      .filter((w) => w.length > 1 && !STOP_WORDS.has(w))
      .map(stem);
    if (roots.length === 0) return null;
    const scored = searchable.map(({ entry, title, body }) => {
      let score = 0;
      let matched = 0;
      for (const root of roots) {
        const inTitle = title.some((t) => t.startsWith(root));
        const hits = body.filter((t) => t.startsWith(root)).length;
        if (!inTitle && hits === 0) continue;
        matched += 1;
        score += (inTitle ? 3 : 1) + Math.min(hits, 10) * 0.1;
      }
      return { entry, score, matched };
    });
    // Primero los que tienen todas las palabras; si ninguno, los que tienen
    // más (un verbo conjugado como "subo" no siempre aparece tal cual).
    const all = scored.filter((r) => r.matched === roots.length);
    const pool = all.length > 0 ? all : scored.filter((r) => r.matched > 0);
    return pool.sort((a, b) => b.matched - a.matched || b.score - a.score).slice(0, 12);
  }, [query, searchable]);

  return (
    <aside className="flex flex-col gap-3 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto lg:pr-1" aria-label="Temario del manual">
      <label htmlFor="docs-search" className="flex items-center gap-2 rounded-lg border bg-card px-2.5 py-1.5 text-sm text-muted-foreground focus-within:ring-2 focus-within:ring-primary/40">
        <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
        <input
          id="docs-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar: factura, certificado, 11002..."
          className="w-full bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
        />
      </label>
      <a
        href={DOCS_PDF_URL}
        download
        className="flex items-center justify-center gap-2 rounded-lg border border-primary px-3 py-1.5 text-sm font-semibold text-primary hover:bg-primary/10"
      >
        <Download className="h-4 w-4" aria-hidden="true" />
        Descargar manual en PDF
      </a>

      {results ? (
        <div className="flex flex-col gap-1">
          <p className="px-1 text-xs text-muted-foreground">
            {results.length === 0 ? 'No encontramos nada con esas palabras.' : `${results.length} resultado${results.length === 1 ? '' : 's'}`}
          </p>
          {results.map(({ entry }) => (
            <Link key={entry.href} href={entry.href} onClick={() => setQuery('')} className="rounded-lg px-2 py-1.5 hover:bg-muted">
              <span className="block text-sm font-medium">{entry.title}</span>
              <span className="block text-xs text-muted-foreground">{entry.chapter}</span>
            </Link>
          ))}
        </div>
      ) : (
        <nav className="flex flex-col gap-0.5">
          <Link
            href="/documentacion"
            className={`rounded-lg px-2 py-1.5 text-sm font-semibold ${pathname === '/documentacion' ? 'text-primary' : 'hover:bg-muted'}`}
          >
            Inicio del manual
          </Link>
          {chapters.map((chapter) => {
            const open = chapter.slug === activeChapter;
            return (
              <div key={chapter.slug} className="flex flex-col">
                <Link
                  href={chapter.articles[0]?.href ?? '/documentacion'}
                  className={`flex items-baseline gap-2 rounded-lg px-2 py-1.5 text-sm font-semibold ${open ? 'text-primary' : 'hover:bg-muted'}`}
                >
                  <span className="w-5 shrink-0 font-mono text-[11px] text-muted-foreground">{chapter.number}</span>
                  <span className="flex-1">{chapter.title}</span>
                  {chapter.featured && (
                    <span className="rounded bg-primary/10 px-1.5 text-[10px] font-semibold text-primary">clave</span>
                  )}
                </Link>
                {open && (
                  <ul className="mb-1 ml-7 flex flex-col gap-px">
                    {chapter.articles.map((article) => {
                      const active = pathname === article.href;
                      return (
                        <li key={article.slug}>
                          <Link
                            href={article.href}
                            aria-current={active ? 'page' : undefined}
                            className={`block rounded-md px-2 py-1 text-[13px] ${
                              active ? 'bg-card font-medium text-foreground shadow-[inset_2px_0_0_var(--primary)]' : 'text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            {article.title}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </nav>
      )}
    </aside>
  );
}
