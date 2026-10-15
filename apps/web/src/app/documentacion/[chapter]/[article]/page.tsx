import DocsMarkdown from '@/components/docs/DocsMarkdown';
import { getDocsArticle, getDocsTree, getHeadings, getNeighbours } from '@/lib/docs';
import { DOCS_CHAPTERS } from '@/lib/docs-manifest';
import Link from 'next/link';
import { notFound } from 'next/navigation';

type Params = { chapter: string; article: string };

export function generateStaticParams(): Params[] {
  return getDocsTree().flatMap((chapter) => chapter.articles.map((a) => ({ chapter: chapter.slug, article: a.slug })));
}

export async function generateMetadata({ params }: { params: Promise<Params> }) {
  const { chapter, article } = await params;
  const doc = getDocsArticle(chapter, article);
  return doc ? { title: `${doc.title} · Manual de Oplex`, description: doc.summary } : { title: 'Manual de Oplex' };
}

export default async function DocsArticlePage({ params }: { params: Promise<Params> }) {
  const { chapter, article } = await params;
  const doc = getDocsArticle(chapter, article);
  if (!doc) notFound();
  const chapterMeta = DOCS_CHAPTERS.find((c) => c.slug === chapter);
  const { prev, next } = getNeighbours(chapter, article);
  const headings = getHeadings(doc.body);

  return (
    <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_190px]">
      <article className="flex min-w-0 flex-col gap-4">
        <p className="text-xs text-muted-foreground">
          <Link href="/documentacion" className="hover:text-foreground">
            Documentación
          </Link>{' '}
          › {chapterMeta?.number} · {chapterMeta?.title}
        </p>
        <h1 className="text-2xl font-bold tracking-tight text-balance">{doc.title}</h1>
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {doc.minutes && <span>Lectura: {doc.minutes} minutos</span>}
          {doc.roles && <span>Para: {doc.roles}</span>}
        </p>

        <DocsMarkdown>{doc.body}</DocsMarkdown>

        <nav className="mt-6 grid grid-cols-1 gap-2.5 sm:grid-cols-2" aria-label="Artículos anterior y siguiente">
          {prev ? (
            <Link href={prev.href} className="rounded-xl border bg-card px-4 py-3 hover:border-primary/50">
              <span className="block text-xs text-muted-foreground">Anterior</span>
              <span className="text-sm font-medium">{prev.title}</span>
            </Link>
          ) : (
            <span />
          )}
          {next && (
            <Link href={next.href} className="rounded-xl border bg-card px-4 py-3 text-right hover:border-primary/50">
              <span className="block text-xs text-muted-foreground">Siguiente</span>
              <span className="text-sm font-medium">{next.title}</span>
            </Link>
          )}
        </nav>
      </article>

      {headings.length > 1 && (
        <aside className="hidden xl:block">
          <nav className="sticky top-4 flex flex-col gap-1.5 text-[13px]" aria-label="En esta página">
            <span className="mb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">En esta página</span>
            {headings.map((h) => (
              <a key={h.id} href={`#${h.id}`} className="text-muted-foreground hover:text-foreground">
                {h.text}
              </a>
            ))}
          </nav>
        </aside>
      )}
    </div>
  );
}
