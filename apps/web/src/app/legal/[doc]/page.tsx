import { PublicWebAnalytics } from '@/components/analytics/PublicWebAnalytics';
import { LEGAL_DOCS } from '@/lib/legal';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import ReactMarkdown from 'react-markdown';

// Los textos viven en apps/web/legal/*.md (versionados en git: importa
// saber qué versión aceptó cada cliente). Se leen en el servidor al
// generar la página; según desde dónde se levante Next, la carpeta está en
// ./legal o en ./apps/web/legal.
function readLegal(file: string): string | null {
  for (const base of [join(process.cwd(), 'legal'), join(process.cwd(), 'apps', 'web', 'legal')]) {
    const path = join(base, file);
    if (existsSync(path)) return readFileSync(path, 'utf8');
  }
  return null;
}

export function generateStaticParams() {
  return LEGAL_DOCS.map((d) => ({ doc: d.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params;
  const meta = LEGAL_DOCS.find((d) => d.slug === doc);
  return { title: meta ? `${meta.title} · Oplex` : 'Oplex' };
}

export default async function LegalPage({ params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params;
  const meta = LEGAL_DOCS.find((d) => d.slug === doc);
  const text = meta ? readLegal(meta.file) : null;
  if (!meta || !text) notFound();

  return (
    <div className="min-h-screen bg-background px-4 py-10 text-foreground">
      <PublicWebAnalytics />
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <nav className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm" aria-label="Documentos legales">
          <Link href="/" className="font-semibold text-primary">
            Oplex
          </Link>
          {LEGAL_DOCS.map((d) => (
            <Link
              key={d.slug}
              href={`/legal/${d.slug}`}
              className={d.slug === doc ? 'font-medium text-foreground underline underline-offset-4' : 'text-muted-foreground hover:text-foreground'}
            >
              {d.title}
            </Link>
          ))}
          <Link href="/arrepentimiento" className="text-muted-foreground hover:text-foreground">
            Botón de arrepentimiento
          </Link>
        </nav>
        <article className="rounded-xl border bg-card p-6 leading-relaxed sm:p-10">
          <ReactMarkdown
            components={{
              h1: (p) => <h1 className="mb-2 text-2xl font-semibold text-balance" {...p} />,
              h2: (p) => <h2 className="mt-8 mb-2 text-lg font-semibold" {...p} />,
              p: (p) => <p className="my-3 max-w-[70ch] text-[15px]" {...p} />,
              ul: (p) => <ul className="my-3 list-disc space-y-1.5 pl-6 text-[15px]" {...p} />,
              li: (p) => <li className="max-w-[70ch]" {...p} />,
              blockquote: (p) => (
                <blockquote
                  className="my-4 rounded-md border-l-4 border-amber-500 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
                  {...p}
                />
              ),
              a: (p) => <a className="text-primary underline" {...p} />,
            }}
          >
            {text}
          </ReactMarkdown>
        </article>
      </div>
    </div>
  );
}
