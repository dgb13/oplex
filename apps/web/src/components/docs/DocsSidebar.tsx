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

/** Temario + buscador + descarga del PDF. Buscar es local (el índice viene
 * armado del servidor): sin acentos ni mayúsculas, todas las palabras
 * tienen que aparecer; el título pesa más que el texto. */
export default function DocsSidebar({ chapters, index }: { chapters: DocsSidebarChapter[]; index: DocsSearchEntry[] }) {
  const pathname = usePathname();
  const [query, setQuery] = useState('');
  const activeChapter = pathname.split('/')[2] ?? '';

  const results = useMemo(() => {
    const words = normalize(query).split(/\s+/).filter((w) => w.length > 1);
    if (words.length === 0) return null;
    return index
      .map((entry) => {
        const title = normalize(entry.title);
        const body = normalize(`${entry.summary} ${entry.text}`);
        if (!words.every((w) => title.includes(w) || body.includes(w))) return null;
        const score = words.reduce((sum, w) => sum + (title.includes(w) ? 3 : 1), 0);
        return { entry, score };
      })
      .filter((r): r is { entry: DocsSearchEntry; score: number } => r !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);
  }, [query, index]);

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
