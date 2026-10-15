import { getDocsTree } from '@/lib/docs';
import Link from 'next/link';

export default function DocumentacionHome() {
  const chapters = getDocsTree();
  const arca = chapters.find((c) => c.featured);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="text-xs text-muted-foreground">Documentación</p>
        <h1 className="text-2xl font-bold tracking-tight text-balance">Manual de Oplex</h1>
        <p className="max-w-[70ch] text-[15px] text-muted-foreground">
          Todo lo que necesitás para usar Oplex, explicado paso a paso con capturas. Empezá por los primeros pasos o buscá
          lo que necesitás en el buscador del temario.
        </p>
      </div>

      {arca?.articles[0] && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm dark:border-amber-900 dark:bg-amber-950/40">
          <p>
            <b>¿Recién empezás?</b> Lo primero es la <b>Conexión con ARCA</b>: sin ella no se pueden emitir facturas
            electrónicas.
          </p>
          <Link href={arca.articles[0].href} className="font-semibold text-primary underline underline-offset-4">
            Ver cómo conectar
          </Link>
        </div>
      )}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3">
        {chapters
          .filter((chapter) => chapter.articles.length > 0)
          .map((chapter) => (
            <Link
              key={chapter.slug}
              href={chapter.articles[0].href}
              className={`flex flex-col gap-1 rounded-xl border p-4 transition hover:border-primary/50 ${
                chapter.featured ? 'border-primary bg-primary/5' : 'bg-card'
              }`}
            >
              <span className="font-mono text-[11px] text-muted-foreground">Capítulo {chapter.number}</span>
              <span className="text-[15px] font-semibold">{chapter.title}</span>
              <span className="text-[13px] text-muted-foreground">{chapter.description}</span>
              <span className="mt-1 text-xs text-muted-foreground">
                {chapter.articles.length} artículo{chapter.articles.length === 1 ? '' : 's'}
              </span>
            </Link>
          ))}
      </div>
    </div>
  );
}
