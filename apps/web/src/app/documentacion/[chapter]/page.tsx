import { getDocsTree } from '@/lib/docs';
import { notFound, redirect } from 'next/navigation';

/** /documentacion/<capítulo> lleva al primer artículo del capítulo. */
export default async function DocsChapterPage({ params }: { params: Promise<{ chapter: string }> }) {
  const { chapter } = await params;
  const first = getDocsTree().find((c) => c.slug === chapter)?.articles[0];
  if (!first) notFound();
  redirect(first.href);
}
