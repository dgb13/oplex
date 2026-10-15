import DocsFrame from '@/components/docs/DocsFrame';
import DocsSidebar from '@/components/docs/DocsSidebar';
import { getDocsSearchIndex, getDocsTree } from '@/lib/docs';

export const metadata = {
  title: 'Manual de Oplex · Documentación',
  description: 'Manual de usuario de Oplex: primeros pasos, conexión con ARCA, ventas, caja, inventario, compras, producción y contabilidad, paso a paso.',
};

export default function DocumentacionLayout({ children }: { children: React.ReactNode }) {
  const chapters = getDocsTree().map((chapter) => ({
    slug: chapter.slug,
    number: chapter.number,
    title: chapter.title,
    featured: chapter.featured,
    articles: chapter.articles.map((a) => ({ slug: a.slug, title: a.title, href: a.href })),
  }));
  return (
    <DocsFrame>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <DocsSidebar chapters={chapters} index={getDocsSearchIndex()} />
        <div className="min-w-0">{children}</div>
      </div>
    </DocsFrame>
  );
}
