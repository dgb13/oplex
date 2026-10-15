import { slugify } from '@/lib/docs';
import Link from 'next/link';
import type { ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import styles from './DocsMarkdown.module.css';

// Avisos: en el .md se escriben como "> [!NOTA]", "> [!IMPORTANTE]" o
// "> [!ERROR]" (mismo formato que los avisos de GitHub). Antes de pasar el
// texto a ReactMarkdown se cambia la marca por una negrita reconocible, que
// después se usa para elegir el estilo del recuadro y no se muestra.
const CALLOUTS = {
  NOTA: { label: 'Nota', className: styles.note },
  IMPORTANTE: { label: 'Importante', className: styles.important },
  ERROR: { label: 'Error', className: styles.error },
} as const;
type CalloutKind = keyof typeof CALLOUTS;
const MARK = /^⟦(NOTA|IMPORTANTE|ERROR)⟧$/;

function prepare(markdown: string): string {
  return markdown.replace(/^>\s*\[!(NOTA|IMPORTANTE|ERROR)\]\s*$/gm, '> **⟦$1⟧**');
}

interface HastNode {
  type: string;
  tagName?: string;
  value?: string;
  children?: HastNode[];
}

function textOf(node: HastNode | undefined): string {
  if (!node) return '';
  if (node.type === 'text') return node.value ?? '';
  return (node.children ?? []).map(textOf).join('');
}

function calloutKind(node: HastNode | undefined): CalloutKind | null {
  const firstParagraph = node?.children?.find((child) => child.type === 'element');
  const firstStrong = firstParagraph?.children?.find((child) => child.type === 'element');
  const match = firstStrong?.tagName === 'strong' ? MARK.exec(textOf(firstStrong)) : null;
  return match ? (match[1] as CalloutKind) : null;
}

const components: Components = {
  h2: ({ children, node }) => (
    <h2 id={slugify(textOf(node as HastNode))} className={styles.h2}>
      {children}
    </h2>
  ),
  h3: ({ children }) => <h3 className={styles.h3}>{children}</h3>,
  p: ({ children, node }) => {
    // Una imagen sola en su párrafo se dibuja como figura, que no puede ir
    // dentro de un <p>.
    const only = (node as HastNode | undefined)?.children;
    if (only?.length === 1 && only[0].tagName === 'img') return <>{children}</>;
    return <p>{children}</p>;
  },
  strong: ({ children, node }) => (MARK.test(textOf(node as HastNode)) ? null : <strong>{children}</strong>),
  blockquote: ({ children, node }) => {
    const kind = calloutKind(node as HastNode);
    const callout = kind ? CALLOUTS[kind] : null;
    return (
      <aside className={`${styles.callout} ${callout?.className ?? styles.note}`} role="note">
        {callout && <span className={styles.calloutLabel}>{callout.label}</span>}
        <div className={styles.calloutBody}>{children}</div>
      </aside>
    );
  },
  ol: ({ children }) => <ol className={styles.steps}>{children}</ol>,
  img: ({ src, alt }) => (
    <figure className={styles.figure}>
      <img src={typeof src === 'string' ? src : undefined} alt={alt ?? ''} loading="lazy" />
      {alt && <figcaption>{alt}</figcaption>}
    </figure>
  ),
  table: ({ children }) => (
    <div className={styles.tableWrap}>
      <table>{children}</table>
    </div>
  ),
  a: ({ href, children }) => {
    if (href?.startsWith('/') && !href.startsWith('/ayuda/')) return <Link href={href}>{children}</Link>;
    return (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  },
};

export default function DocsMarkdown({ children }: { children: string }): ReactNode {
  return (
    <div className={styles.prose}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {prepare(children)}
      </ReactMarkdown>
    </div>
  );
}
