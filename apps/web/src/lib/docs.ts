import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DOCS_CHAPTERS, type DocsChapter } from './docs-manifest';

// Sólo servidor: lee los artículos del manual de apps/web/ayuda al generar
// las páginas (mismo criterio que /legal: según desde dónde se levante Next,
// la carpeta está en ./ayuda o en ./apps/web/ayuda). Las páginas se generan
// estáticas, así que el texto queda dentro del build.

export interface DocsArticleMeta {
  chapter: string;
  slug: string;
  title: string;
  summary: string;
  minutes: number | null;
  roles: string | null;
  href: string;
}

export interface DocsArticle extends DocsArticleMeta {
  body: string;
}

export interface DocsChapterWithArticles extends Omit<DocsChapter, 'articles'> {
  articles: DocsArticleMeta[];
}

function readContent(relative: string): string | null {
  for (const base of [join(process.cwd(), 'ayuda'), join(process.cwd(), 'apps', 'web', 'ayuda')]) {
    const path = join(base, relative);
    if (existsSync(path)) return readFileSync(path, 'utf8');
  }
  return null;
}

/** Encabezado "---\nclave: valor\n---" al principio del archivo. */
function parseFrontmatter(raw: string): { data: Record<string, string>; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  if (!match) return { data: {}, body: raw };
  const data: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const index = line.indexOf(':');
    if (index > 0) data[line.slice(0, index).trim()] = line.slice(index + 1).trim().replace(/^["']|["']$/g, '');
  }
  return { data, body: raw.slice(match[0].length) };
}

function loadArticle(chapter: string, slug: string): DocsArticle | null {
  const raw = readContent(join(chapter, `${slug}.md`));
  if (raw === null) return null;
  const { data, body } = parseFrontmatter(raw);
  const minutes = Number(data['minutes']);
  return {
    chapter,
    slug,
    title: data['title'] || slug,
    summary: data['summary'] || '',
    minutes: Number.isFinite(minutes) && minutes > 0 ? minutes : null,
    roles: data['roles'] || null,
    href: `/documentacion/${chapter}/${slug}`,
    body,
  };
}

/** Temario completo con los títulos reales; omite los artículos que todavía
 * no tienen archivo. */
export function getDocsTree(): DocsChapterWithArticles[] {
  return DOCS_CHAPTERS.map((chapter) => ({
    ...chapter,
    articles: chapter.articles
      .map((slug) => loadArticle(chapter.slug, slug))
      .filter((article): article is DocsArticle => article !== null)
      .map(({ body: _body, ...meta }) => meta),
  }));
}

export function getDocsArticle(chapter: string, slug: string): DocsArticle | null {
  const known = DOCS_CHAPTERS.find((c) => c.slug === chapter)?.articles.includes(slug);
  return known ? loadArticle(chapter, slug) : null;
}

/** Resumen de una página por capítulo, para el PDF. */
export function getChapterSummary(chapter: string): string | null {
  const raw = readContent(join(chapter, '_resumen.md'));
  return raw === null ? null : parseFrontmatter(raw).body;
}

/** Texto plano de cada artículo para el buscador (sin markdown). */
export function getDocsSearchIndex(): { href: string; title: string; chapter: string; summary: string; text: string }[] {
  return DOCS_CHAPTERS.flatMap((chapter) =>
    chapter.articles
      .map((slug) => loadArticle(chapter.slug, slug))
      .filter((article): article is DocsArticle => article !== null)
      .map((article) => ({
        href: article.href,
        title: article.title,
        chapter: chapter.title,
        summary: article.summary,
        text: article.body
          .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
          .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
          .replace(/[#>*_`|[\]-]/g, ' ')
          .replace(/\s+/g, ' ')
          .slice(0, 4000),
      })),
  );
}

/** Anterior y siguiente en el orden del temario. */
export function getNeighbours(chapter: string, slug: string): { prev: DocsArticleMeta | null; next: DocsArticleMeta | null } {
  const flat = getDocsTree().flatMap((c) => c.articles);
  const index = flat.findIndex((a) => a.chapter === chapter && a.slug === slug);
  return { prev: index > 0 ? flat[index - 1] : null, next: index >= 0 && index < flat.length - 1 ? flat[index + 1] : null };
}

/** Títulos de nivel 2 del artículo, para "En esta página". */
export function getHeadings(body: string): { id: string; text: string }[] {
  return [...body.matchAll(/^##\s+(.+)$/gm)].map((m) => ({ id: slugify(m[1]), text: m[1].replace(/[*`]/g, '').trim() }));
}

export function slugify(text: string): string {
  return text
    .replace(/[*`]/g, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
